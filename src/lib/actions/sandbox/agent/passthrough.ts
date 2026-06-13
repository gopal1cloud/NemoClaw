// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import * as registry from "../../../state/registry";
import { execSandbox } from "../exec";
import { ensureLiveSandboxOrExit } from "../gateway-state";

export {
  hasAgentPassthroughHelpToken,
  printAgentPassthroughHelp,
} from "./passthrough-help";

export interface AgentPassthroughOptions {
  extraArgs?: readonly string[];
}

export interface AgentPassthroughDeps {
  getSandbox?: typeof registry.getSandbox;
  ensureLive?: typeof ensureLiveSandboxOrExit;
  exec?: typeof execSandbox;
  process?: {
    exit(code: number): never;
    stderr: { write(s: string): unknown };
  };
}

function resolveSandboxAgent(
  sandboxName: string,
  getSandbox: typeof registry.getSandbox = registry.getSandbox,
): string | null {
  try {
    const sandbox = getSandbox(sandboxName);
    return sandbox?.agent ?? null;
  } catch {
    return null;
  }
}

function rejectNonOpenclawAgent(
  sandboxName: string,
  agent: string,
  proc: NonNullable<AgentPassthroughDeps["process"]>,
): never {
  proc.stderr.write(
    `  agent is currently supported only on OpenClaw sandboxes (got '${agent}').\n`,
  );
  proc.stderr.write(
    "  Hermes exposes an OpenAI-compatible API on port 8642 inside the sandbox;\n",
  );
  proc.stderr.write(
    `  forward it with 'openshell forward start --background 8642 ${sandboxName}'\n`,
  );
  proc.stderr.write("  and POST to http://127.0.0.1:8642/v1/chat/completions instead.\n");
  return proc.exit(2);
}

export async function runAgentPassthrough(
  sandboxName: string,
  { extraArgs = [] }: AgentPassthroughOptions = {},
  deps: AgentPassthroughDeps = {},
): Promise<void> {
  const proc = deps.process ?? process;
  const agent = resolveSandboxAgent(sandboxName, deps.getSandbox);
  if (agent && agent !== "openclaw") {
    rejectNonOpenclawAgent(sandboxName, agent, proc);
  }
  const ensureLive = deps.ensureLive ?? ensureLiveSandboxOrExit;
  await ensureLive(sandboxName, { allowNonReadyPhase: true });
  const command = ["openclaw", "agent", ...extraArgs];
  const exec = deps.exec ?? execSandbox;
  await exec(sandboxName, command);
}
