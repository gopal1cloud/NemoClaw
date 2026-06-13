// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";

const promptSandboxMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../lib/actions/sandbox/prompt", () => ({
  promptSandbox: promptSandboxMock,
}));

import SandboxPromptCommand from "./prompt";

const rootDir = process.cwd();

describe("SandboxPromptCommand oclif parse path", () => {
  beforeEach(() => {
    promptSandboxMock.mockReset();
  });

  it("forwards the positional prompt text and default flags", async () => {
    await SandboxPromptCommand.run(["alpha", "What is 2+2?"], rootDir);
    expect(promptSandboxMock).toHaveBeenCalledWith("alpha", "What is 2+2?", {
      agentProfile: undefined,
      workdir: undefined,
      timeoutSeconds: undefined,
      promptFile: undefined,
    });
  });

  it("parses --agent, --workdir and --timeout into typed options", async () => {
    await SandboxPromptCommand.run(
      [
        "alpha",
        "--agent",
        "chess-bot",
        "--workdir",
        "/sandbox/workspace",
        "--timeout",
        "30",
        "Best opening?",
      ],
      rootDir,
    );
    expect(promptSandboxMock).toHaveBeenCalledWith("alpha", "Best opening?", {
      agentProfile: "chess-bot",
      workdir: "/sandbox/workspace",
      timeoutSeconds: 30,
      promptFile: undefined,
    });
  });

  it("supports --prompt-file with no positional text", async () => {
    await SandboxPromptCommand.run(["alpha", "--prompt-file", "/tmp/q.txt"], rootDir);
    expect(promptSandboxMock).toHaveBeenCalledWith("alpha", undefined, {
      agentProfile: undefined,
      workdir: undefined,
      timeoutSeconds: undefined,
      promptFile: "/tmp/q.txt",
    });
  });

  it("supports --prompt-file - for stdin", async () => {
    await SandboxPromptCommand.run(["alpha", "--prompt-file", "-"], rootDir);
    expect(promptSandboxMock).toHaveBeenCalledWith("alpha", undefined, {
      agentProfile: undefined,
      workdir: undefined,
      timeoutSeconds: undefined,
      promptFile: "-",
    });
  });
});
