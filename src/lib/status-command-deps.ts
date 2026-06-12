// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import type { CaptureOpenshellResult } from "./adapters/openshell/client";
import { captureOpenshellCommand } from "./adapters/openshell/client";
import { resolveOpenshell } from "./adapters/openshell/resolve";
import { OPENSHELL_PROBE_TIMEOUT_MS } from "./adapters/openshell/timeouts";
import { getNamedGatewayLifecycleState } from "./gateway-runtime-action";
import { getLiveGatewayInference } from "./inference/live";
import type {
  GatewayHealth,
  MessagingBridgeHealth,
  MessagingOverlap,
  ShowStatusCommandDeps,
} from "./inventory";
import { findAllOverlaps } from "./messaging/applier";
import type { MessagingAgentId } from "./messaging/manifest";
import { getActiveChannelIdsFromPlan } from "./messaging/plan-validation";
import {
  collectBuiltInMessagingStatusOutputs,
  type MessagingStatusOutput,
  type GatewayLogConflictCounterStatusOutput,
  type SingleGatewayChannelOverlapStatusOutput,
} from "./messaging/status-outputs";
import { BASE_GATEWAY_NAME } from "./onboard/gateway-binding";
import * as registry from "./state/registry";
import { createSystemDeps, parseSshProcesses } from "./state/sandbox-session";
import { getServiceStatuses, showStatus as showServiceStatus } from "./tunnel/services";

function captureOpenshell(
  rootDir: string,
  args: string[],
  opts: { timeout?: number } = {},
): CaptureOpenshellResult {
  const openshell = resolveOpenshell();
  if (!openshell) {
    return { status: 1, output: "" };
  }
  return captureOpenshellCommand(openshell, args, {
    cwd: rootDir,
    ignoreError: true,
    timeout: opts.timeout,
  });
}

function checkMessagingBridgeHealth(
  rootDir: string,
  sandboxName: string,
  channels: string[],
  agent: string | null | undefined = "openclaw",
): MessagingBridgeHealth[] {
  const channelSet = new Set(Array.isArray(channels) ? channels : []);
  const specs = getStatusOutputsForAgent(agent)
    .filter(isGatewayLogConflictCounterStatusOutput)
    .filter((spec) => channelSet.has(spec.channelId));
  if (specs.length === 0) return [];
  const openshell = resolveOpenshell();
  if (!openshell) return [];

  const results: MessagingBridgeHealth[] = [];
  for (const spec of specs) {
    const logTail = readSandboxFileTail(
      rootDir,
      openshell,
      sandboxName,
      spec.logFile,
      spec.maxLogLines,
    );
    if (logTail === null) continue;
    const conflicts = countRegexMatchesByLine(logTail, spec.pattern, spec.flags);
    if (conflicts > 0) {
      results.push({ channel: spec.channelId, conflicts });
    }
  }
  return results;
}

function findMessagingOverlaps() {
  // Non-critical path: status must remain usable even if overlap detection
  // throws, so any failure yields an empty overlap list.
  try {
    // Report both conflict axes independently and without deduping. They are
    // distinct, both-true facts: a shared messaging credential conflicts on any
    // gateway, while manifest-declared gateway exclusivity can conflict even
    // with distinct credentials. A pair that hits both genuinely has two
    // problems, so surfacing both avoids masking the credential warning behind
    // the gateway one.
    const { sandboxes } = registry.listSandboxes();
    const credentialOverlaps = findAllOverlaps({
      listSandboxes: () => ({ sandboxes }),
    });
    const singleGatewayOverlaps = listSingleGatewayOverlapSpecsForEntries(sandboxes).flatMap(
      ({ spec, agents }) => detectSingleGatewayChannelOverlaps(sandboxes, spec, agents),
    );
    return [...credentialOverlaps, ...singleGatewayOverlaps];
  } catch {
    return [];
  }
}

function isGatewayLogConflictCounterStatusOutput(
  output: MessagingStatusOutput,
): output is GatewayLogConflictCounterStatusOutput {
  return output.type === "gateway-log-conflict-counter";
}

function isSingleGatewayChannelOverlapStatusOutput(
  output: MessagingStatusOutput,
): output is SingleGatewayChannelOverlapStatusOutput {
  return output.type === "single-gateway-channel-overlap";
}

function getStatusOutputsForAgent(agent: string | null | undefined): MessagingStatusOutput[] {
  return collectBuiltInMessagingStatusOutputs({ agent: normalizeMessagingAgentId(agent) });
}

function normalizeMessagingAgentId(agent: string | null | undefined): MessagingAgentId {
  return agent === "hermes" ? "hermes" : "openclaw";
}

function readSandboxFileTail(
  rootDir: string,
  openshell: string,
  sandboxName: string,
  path: string,
  maxLines: number,
): string | null {
  const script = `tail -n ${maxLines} ${shellQuote(path)} 2>/dev/null || true`;
  try {
    const result = spawnSync(
      openshell,
      ["sandbox", "exec", "-n", sandboxName, "--", "sh", "-c", script],
      { cwd: rootDir, encoding: "utf-8", timeout: 3000, stdio: ["ignore", "pipe", "pipe"] },
    );
    return typeof result.stdout === "string" ? result.stdout : "";
  } catch {
    return null;
  }
}

function countRegexMatchesByLine(logTail: string, pattern: string, flags: string): number {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags.replaceAll("g", ""));
  } catch {
    return 0;
  }
  return logTail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && regex.test(line)).length;
}

function detectSingleGatewayChannelOverlaps(
  entries: readonly registry.SandboxEntry[],
  spec: SingleGatewayChannelOverlapStatusOutput,
  agents: ReadonlySet<MessagingAgentId>,
): MessagingOverlap[] {
  const byGateway = new Map<string, string[]>();
  for (const entry of entries) {
    if (!agents.has(normalizeMessagingAgentId(entry.agent))) continue;
    if (!entry.messaging?.plan) continue;
    if (!getActiveChannelIdsFromPlan(entry.messaging.plan).includes(spec.channelId)) continue;
    const gatewayName = entry.gatewayName ?? BASE_GATEWAY_NAME;
    const names = byGateway.get(gatewayName) ?? [];
    names.push(entry.name);
    byGateway.set(gatewayName, names);
  }

  const overlaps: MessagingOverlap[] = [];
  for (const names of byGateway.values()) {
    if (names.length < 2) continue;
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        overlaps.push({
          channel: spec.channelId,
          sandboxes: [names[i], names[j]],
          reason: spec.reason,
          message: spec.message,
        });
      }
    }
  }
  return overlaps;
}

function listSingleGatewayOverlapSpecsForEntries(entries: readonly registry.SandboxEntry[]): Array<{
  readonly spec: SingleGatewayChannelOverlapStatusOutput;
  readonly agents: ReadonlySet<MessagingAgentId>;
}> {
  const byKey = new Map<
    string,
    { spec: SingleGatewayChannelOverlapStatusOutput; agents: Set<MessagingAgentId> }
  >();
  for (const entry of entries) {
    const agent = normalizeMessagingAgentId(entry.agent);
    for (const spec of getStatusOutputsForAgent(agent).filter(
      isSingleGatewayChannelOverlapStatusOutput,
    )) {
      const key = `${spec.channelId}\0${spec.reason}\0${spec.message}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.agents.add(agent);
      } else {
        byKey.set(key, { spec, agents: new Set([agent]) });
      }
    }
  }
  return [...byKey.values()];
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function readGatewayLog(rootDir: string, sandboxName: string): string | null {
  const openshell = resolveOpenshell();
  if (!openshell) return null;
  try {
    const result = spawnSync(
      openshell,
      [
        "sandbox",
        "exec",
        "-n",
        sandboxName,
        "--",
        "sh",
        "-c",
        "tail -n 10 /tmp/gateway.log 2>/dev/null",
      ],
      { cwd: rootDir, encoding: "utf-8", timeout: 3000, stdio: ["ignore", "pipe", "pipe"] },
    );
    const output = (result.stdout || "").trim();
    return output || null;
  } catch {
    return null;
  }
}

function probeGatewayHealth(): GatewayHealth {
  try {
    const lifecycle = getNamedGatewayLifecycleState();
    if (lifecycle.state === "healthy_named") {
      return { healthy: true, state: lifecycle.state };
    }
    const reasonByState: Record<string, string> = {
      named_unreachable: "host port held or container not running",
      named_unhealthy: "named gateway present but not Connected",
      connected_other: `connected to '${lifecycle.activeGateway ?? "unknown"}', not 'nemoclaw'`,
      missing_named: "named gateway not configured",
    };
    return {
      healthy: false,
      state: lifecycle.state,
      reason: reasonByState[lifecycle.state],
    };
  } catch {
    // A transient probe failure must not mask a real gateway problem, but
    // we also can't claim it's unhealthy when we genuinely couldn't tell.
    // Report it as a soft degraded state so the user still sees a hint.
    return { healthy: false, state: "probe_error", reason: "could not reach OpenShell CLI" };
  }
}

export function buildStatusCommandDeps(rootDir: string): ShowStatusCommandDeps {
  const opsBin = resolveOpenshell();
  const sessionDeps = opsBin ? createSystemDeps(opsBin) : null;
  // Cache the SSH process probe once per command invocation — avoids
  // spawning ps per sandbox row. #2604; mirrors buildListCommandDeps.
  let cachedSshOutput: string | null | undefined;
  const getCachedSshOutput = (): string | null => {
    if (cachedSshOutput === undefined && sessionDeps) {
      try {
        cachedSshOutput = sessionDeps.getSshProcesses();
      } catch {
        cachedSshOutput = null;
      }
    }
    return cachedSshOutput ?? null;
  };

  return {
    listSandboxes: () => registry.listSandboxes(),
    getLiveInference: () =>
      getLiveGatewayInference(
        (args, opts) =>
          captureOpenshell(rootDir, args, {
            timeout: opts?.timeout,
          }),
        { timeout: OPENSHELL_PROBE_TIMEOUT_MS },
      ).inference,
    showServiceStatus,
    getServiceStatuses,
    getGatewayHealth: probeGatewayHealth,
    getActiveSessionCount: sessionDeps
      ? (name) => {
          try {
            const sshOutput = getCachedSshOutput();
            if (sshOutput === null) return null;
            return parseSshProcesses(sshOutput, name).length;
          } catch {
            return null;
          }
        }
      : undefined,
    checkMessagingBridgeHealth: (sandboxName, channels, agent) =>
      checkMessagingBridgeHealth(rootDir, sandboxName, channels, agent),
    findMessagingOverlaps,
    readGatewayLog: (sandboxName) => readGatewayLog(rootDir, sandboxName),
    log: console.log,
  };
}
