// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { AgentDefinition } from "./defs";

type RunCaptureOpenshell = (
  args: string[],
  opts?: { ignoreError?: boolean; timeout?: number },
) => string | { output?: string | null } | null;

export type AgentSmokeCommandResult =
  | { ok: true }
  | { ok: false; command: string; output: string | null };

export function runAgentSmokeCommands(
  sandboxName: string,
  agent: AgentDefinition,
  runCaptureOpenshell: RunCaptureOpenshell,
): AgentSmokeCommandResult {
  const commands = agent.runtime?.smoke_commands ?? [];
  for (const command of commands) {
    const result = runCaptureOpenshell(
      ["sandbox", "exec", "-n", sandboxName, "--", "sh", "-lc", command],
      { ignoreError: true },
    );
    const output = typeof result === "string" ? result : (result?.output ?? null);
    if (!output || /not found|error|failed/i.test(output)) {
      return { ok: false, command, output };
    }
  }
  return { ok: true };
}
