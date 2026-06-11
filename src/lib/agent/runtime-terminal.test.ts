// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
// Import from compiled dist/ so coverage is attributed correctly.
import {
  buildManualRecoveryCommand,
  buildRecoveryScript,
  getTerminalCommand,
} from "../../../dist/lib/agent/runtime";
import type { AgentDefinition } from "./defs";

const terminalAgent = {
  name: "terminal-agent",
  displayName: "Terminal Agent",
  runtime: {
    kind: "terminal",
    interactive_command: "terminal-agent",
    headless_command: "terminal-agent -n",
  },
  gateway_command: undefined,
} as AgentDefinition;

describe("terminal agent runtime helpers", () => {
  it("returns null for terminal agents without a gateway process", () => {
    expect(buildRecoveryScript(terminalAgent, 18789)).toBeNull();
  });

  it("resolves terminal launch commands without synthesizing gateway recovery", () => {
    expect(getTerminalCommand(terminalAgent)).toBe("terminal-agent");
    expect(getTerminalCommand(terminalAgent, "headless")).toBe("terminal-agent -n");
    expect(buildManualRecoveryCommand(terminalAgent, 18789)).toBe("terminal-agent");
  });
});
