// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

const execMock = vi.hoisted(() => vi.fn(async () => {}));
const ensureLiveMock = vi.hoisted(() => vi.fn(async () => ({})));
const getSandboxMock = vi.hoisted(() => vi.fn(() => null as { agent?: string } | null));

vi.mock("../exec", () => ({ execSandbox: execMock }));
vi.mock("../gateway-state", () => ({ ensureLiveSandboxOrExit: ensureLiveMock }));
vi.mock("../../../state/registry", () => ({ getSandbox: getSandboxMock }));

import { runAgentPassthrough } from "./passthrough";

describe("runAgentPassthrough", () => {
  function makeProcMock() {
    const writes: string[] = [];
    const exit = vi.fn((code: number) => {
      throw new Error(`__exit:${code}`);
    });
    return {
      writes,
      exit,
      proc: {
        exit: exit as unknown as (code: number) => never,
        stderr: { write: (s: string) => writes.push(s) },
      },
    };
  }

  it("rejects Hermes sandboxes with a redirect to the OpenAI-compatible API", async () => {
    execMock.mockClear();
    ensureLiveMock.mockClear();
    getSandboxMock.mockReturnValueOnce({ agent: "hermes" });
    const { writes, exit, proc } = makeProcMock();
    await expect(
      runAgentPassthrough("alpha", { extraArgs: ["-m", "hi"] }, { process: proc }),
    ).rejects.toThrow("__exit:2");
    expect(execMock).not.toHaveBeenCalled();
    expect(ensureLiveMock).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(2);
    expect(writes.join("")).toMatch(/supported only on OpenClaw sandboxes \(got 'hermes'\)/);
    expect(writes.join("")).toMatch(/port 8642/);
  });

  it("forwards extraArgs verbatim to `openclaw agent` for OpenClaw sandboxes", async () => {
    execMock.mockClear();
    ensureLiveMock.mockClear();
    getSandboxMock.mockReturnValueOnce({ agent: "openclaw" });
    await runAgentPassthrough("alpha", {
      extraArgs: ["--agent", "work", "--session-id", "s-1", "-m", "ping", "--json"],
    });
    expect(ensureLiveMock).toHaveBeenCalledWith("alpha", { allowNonReadyPhase: true });
    expect(execMock).toHaveBeenCalledWith("alpha", [
      "openclaw",
      "agent",
      "--agent",
      "work",
      "--session-id",
      "s-1",
      "-m",
      "ping",
      "--json",
    ]);
  });

  it("treats an unknown sandbox as OpenClaw (registry miss should not block)", async () => {
    execMock.mockClear();
    getSandboxMock.mockReturnValueOnce(null);
    await runAgentPassthrough("ghost", { extraArgs: ["-m", "hi"] });
    expect(execMock).toHaveBeenCalledWith("ghost", ["openclaw", "agent", "-m", "hi"]);
  });

  it("works with no extraArgs (prints upstream openclaw agent help inside the sandbox)", async () => {
    execMock.mockClear();
    getSandboxMock.mockReturnValueOnce({ agent: "openclaw" });
    await runAgentPassthrough("alpha");
    expect(execMock).toHaveBeenCalledWith("alpha", ["openclaw", "agent"]);
  });
});
