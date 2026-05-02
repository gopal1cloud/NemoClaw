// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Agent-specific runtime logic — called from nemoclaw.ts when the active
// sandbox uses a non-OpenClaw agent. Reads the agent from the onboard session
// and provides agent-aware health probes, recovery scripts, and display names.
// When the session agent is openclaw (or absent), all functions return
// defaults that match the hardcoded OpenClaw values on main.

import * as registry from "./registry";
import { DASHBOARD_PORT } from "./ports";
import * as onboardSession from "./onboard-session";
import { loadAgent, type AgentDefinition } from "./agent-defs";
import { shellQuote } from "./runner";

/**
 * Resolve the agent for a sandbox. Checks the per-sandbox registry first
 * (so status/connect/recovery use the right agent even when multiple
 * sandboxes exist), then falls back to the global onboard session.
 * Returns the loaded agent definition for non-OpenClaw agents, or null.
 */
export function getSessionAgent(sandboxName?: string): AgentDefinition | null {
  try {
    if (sandboxName) {
      const sb = registry.getSandbox(sandboxName);
      if (sb?.agent && sb.agent !== "openclaw") {
        return loadAgent(sb.agent);
      }
      if (sb?.agent === "openclaw" || (sb && !sb.agent)) {
        return null;
      }
    }
    const session = onboardSession.loadSession();
    const name = session?.agent || "openclaw";
    if (name === "openclaw") return null;
    return loadAgent(name);
  } catch {
    return null;
  }
}

/**
 * Get the health probe URL for the agent.
 * Returns the agent's configured probe URL, or the OpenClaw default.
 */
export function getHealthProbeUrl(agent: AgentDefinition | null): string {
  if (!agent) return `http://127.0.0.1:${DASHBOARD_PORT}/`;
  return agent.healthProbe?.url || `http://127.0.0.1:${DASHBOARD_PORT}/`;
}

function escapeEre(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function escapeCharClass(value: string): string {
  return value.replace(/[\\\]\[\^\-]/g, "\\$&");
}

function selfSafeGatewayProcessPattern(binaryName: string): string {
  const [first = "", ...rest] = Array.from(binaryName);
  if (!first) return "";
  return `[${escapeCharClass(first)}]${escapeEre(rest.join(""))}([ -]gateway| gateway run|$)`;
}

/**
 * Build the recovery shell script for a non-OpenClaw agent.
 * Returns the script string, or null if agent is null (use existing inline
 * OpenClaw script instead).
 */
export function buildRecoveryScript(agent: AgentDefinition | null, port: number): string | null {
  if (!agent) return null;

  const binaryPath = agent.binary_path || "/usr/local/bin/openclaw";
  const binaryName = binaryPath.split("/").pop() ?? "openclaw";
  const defaultGatewayCommand = `${binaryName} gateway run`;
  const configuredGatewayCommand = agent.gateway_command?.trim() || defaultGatewayCommand;
  const usesValidatedBinary = configuredGatewayCommand === defaultGatewayCommand;
  const customGatewayExecutable = configuredGatewayCommand.split(/\s+/)[0] ?? binaryName;
  const gatewayExecutableName = usesValidatedBinary
    ? binaryName
    : (customGatewayExecutable.split("/").pop() ?? customGatewayExecutable);
  const staleGatewayPattern = selfSafeGatewayProcessPattern(gatewayExecutableName);
  const validationSteps = usesValidatedBinary
    ? [
        `AGENT_BIN=${shellQuote(binaryPath)}; if [ ! -x "$AGENT_BIN" ]; then AGENT_BIN="$(command -v ${shellQuote(binaryName)})"; fi;`,
        'if [ -z "$AGENT_BIN" ]; then echo AGENT_MISSING; exit 1; fi;',
      ]
    : [
        `GATEWAY_CMD_BIN=${shellQuote(customGatewayExecutable)};`,
        'case "$GATEWAY_CMD_BIN" in */*) [ -x "$GATEWAY_CMD_BIN" ] || { echo AGENT_MISSING; exit 1; } ;; *) command -v "$GATEWAY_CMD_BIN" >/dev/null 2>&1 || { echo AGENT_MISSING; exit 1; } ;; esac;',
      ];
  // Append (>>) rather than truncate (>) so the [gateway-recovery] WARNING
  // lines that the recovery script writes to gateway.log moments earlier
  // survive past the gateway launch — otherwise the warning explaining
  // *why* the gateway is about to crash gets wiped by the same launch
  // that's about to crash on a missing guard. (#2478)
  const launchCommand = usesValidatedBinary
    ? `nohup "$AGENT_BIN" gateway run --port ${port} >> /tmp/gateway.log 2>&1 &`
    : `nohup ${configuredGatewayCommand} --port ${port} >> /tmp/gateway.log 2>&1 &`;
  const isHermes = agent.name === "hermes";
  const hermesHome = isHermes ? "export HERMES_HOME=/sandbox/.hermes; " : "";

  // Source /tmp/nemoclaw-proxy-env.sh immediately before launching. That file
  // is the single source of truth for NODE_OPTIONS preload guards (safety-net,
  // ciao networkInterfaces, slack, http-proxy, ws-proxy, nemotron). Recovery
  // also stops stale launcher/gateway processes that may have respawned
  // between the health probe and relaunch. A missing env file remains warning-
  // only; a present env file that does not install required guards is a hard
  // failure because launching would create an unguarded gateway.
  return [
    "[ -f ~/.bashrc ] && . ~/.bashrc;",
    hermesHome,
    "rm -f /tmp/gateway.log;",
    "touch /tmp/gateway.log; chmod 600 /tmp/gateway.log;",
    `_GATEWAY_PROC_PATTERN=${shellQuote(staleGatewayPattern)};`,
    'if [ -n "$_GATEWAY_PROC_PATTERN" ]; then pkill -TERM -f "$_GATEWAY_PROC_PATTERN" 2>/dev/null || true; for _i in 1 2 3 4 5; do pgrep -f "$_GATEWAY_PROC_PATTERN" >/dev/null 2>&1 || break; sleep 1; done; pkill -KILL -f "$_GATEWAY_PROC_PATTERN" 2>/dev/null || true; for _i in 1 2 3 4 5; do pgrep -f "$_GATEWAY_PROC_PATTERN" >/dev/null 2>&1 || break; sleep 1; done; if pgrep -f "$_GATEWAY_PROC_PATTERN" >/dev/null 2>&1; then echo GATEWAY_STALE_PROCESSES; exit 1; fi; fi;',
    ...validationSteps,
    "if [ -r /tmp/nemoclaw-proxy-env.sh ]; then . /tmp/nemoclaw-proxy-env.sh; _PE_MISSING=0; else _PE_MISSING=1; fi;",
    'if [ "$_PE_MISSING" = "0" ]; then case "${NODE_OPTIONS:-}" in *nemoclaw-sandbox-safety-net*) _SN_MISSING=0 ;; *) _SN_MISSING=1 ;; esac; case "${NODE_OPTIONS:-}" in *nemoclaw-ciao-network-guard*) _CIAO_MISSING=0 ;; *) _CIAO_MISSING=1 ;; esac; if [ "$_SN_MISSING" = "0" ] && [ "$_CIAO_MISSING" = "0" ]; then _GUARDS_MISSING=0; else _GUARDS_MISSING=1; fi; else _GUARDS_MISSING=0; fi;',
    '[ "$_PE_MISSING" = "1" ] && { _W="[gateway-recovery] WARNING: /tmp/nemoclaw-proxy-env.sh missing — gateway launching without library guards (#2478)"; echo "$_W" >&2; echo "$_W" >> /tmp/gateway.log; };',
    '[ "$_PE_MISSING" = "0" ] && [ "$_GUARDS_MISSING" = "1" ] && { _E="[gateway-recovery] ERROR: /tmp/nemoclaw-proxy-env.sh present but NODE_OPTIONS missing safety-net preload or ciao preload — refusing unguarded gateway relaunch (#2478)"; echo "$_E" >&2; echo "$_E" >> /tmp/gateway.log; exit 1; };',
    launchCommand,
    "GPID=$!; sleep 2;",
    'if kill -0 "$GPID" 2>/dev/null; then echo "GATEWAY_PID=$GPID"; else echo GATEWAY_FAILED; cat /tmp/gateway.log 2>/dev/null | tail -5; fi',
  ].join(" ");
}

/**
 * Get the display name for the current agent.
 */
export function getAgentDisplayName(agent: AgentDefinition | null): string {
  return agent ? agent.displayName : "OpenClaw";
}

/**
 * Get the gateway command for the current agent.
 */
export function getGatewayCommand(agent: AgentDefinition | null): string {
  return agent?.gateway_command || "openclaw gateway run";
}
