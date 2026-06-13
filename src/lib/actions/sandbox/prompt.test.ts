// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildOpenclawAgentArgs,
  promptSandbox,
  readPromptText,
} from "./prompt";

describe("buildOpenclawAgentArgs", () => {
  it("defaults to the 'main' agent profile when none is supplied", () => {
    expect(buildOpenclawAgentArgs("hi")).toEqual([
      "openclaw",
      "agent",
      "--agent",
      "main",
      "-m",
      "hi",
    ]);
  });

  it("honours an explicit agent profile", () => {
    expect(buildOpenclawAgentArgs("hello", { agentProfile: "chess-bot" })).toEqual([
      "openclaw",
      "agent",
      "--agent",
      "chess-bot",
      "-m",
      "hello",
    ]);
  });

  it("falls back to the default profile when the supplied value is empty", () => {
    expect(buildOpenclawAgentArgs("hi", { agentProfile: "" })).toEqual([
      "openclaw",
      "agent",
      "--agent",
      "main",
      "-m",
      "hi",
    ]);
  });

  it("preserves the prompt body verbatim, including shell metacharacters", () => {
    const text = 'Summarise $HOME && echo "done"';
    expect(buildOpenclawAgentArgs(text)).toContain(text);
  });
});

describe("readPromptText", () => {
  it("returns the inline text when supplied", () => {
    expect(readPromptText("hello", undefined)).toBe("hello");
  });

  it("reads from a file path when --prompt-file is a real path", () => {
    const dir = mkdtempSync(join(tmpdir(), "prompt-"));
    const path = join(dir, "p.txt");
    writeFileSync(path, "file body\n");
    expect(readPromptText(undefined, path)).toBe("file body\n");
  });

  it("rejects both inline text and --prompt-file together", () => {
    expect(() => readPromptText("inline", "/tmp/x")).toThrow(/either a positional prompt or --prompt-file/);
  });

  it("rejects neither inline nor --prompt-file", () => {
    expect(() => readPromptText(undefined, undefined)).toThrow(/positional argument or via --prompt-file/);
  });
});

describe("promptSandbox", () => {
  function makeDeps(agent: string | null) {
    const writes: string[] = [];
    const exit = vi.fn((code: number) => {
      throw new Error(`__exit:${code}`);
    });
    const spawn = vi.fn((..._args: unknown[]) => ({ status: 0 }));
    return {
      writes,
      exit,
      spawn,
      deps: {
        getSandbox: vi.fn(() => (agent ? ({ name: "alpha", agent } as any) : null)),
        getOpenshellBinary: () => "/usr/local/bin/openshell",
        spawn: spawn as unknown as typeof import("node:child_process").spawnSync,
        process: {
          exit: exit as unknown as (code: number) => never,
          stderr: { write: (s: string) => writes.push(s) },
        },
      },
    };
  }

  it("rejects Hermes sandboxes with a redirect to the OpenAI-compatible API", async () => {
    const { writes, exit, spawn, deps } = makeDeps("hermes");
    await expect(promptSandbox("alpha", "hi", {}, deps)).rejects.toThrow("__exit:2");
    expect(spawn).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(2);
    expect(writes.join("")).toMatch(/supported only on OpenClaw sandboxes \(got 'hermes'\)/);
    expect(writes.join("")).toMatch(/port 8642/);
  });

  it("invokes openshell sandbox exec with the openclaw agent argv for OpenClaw sandboxes", async () => {
    const { spawn, deps } = makeDeps("openclaw");
    await expect(promptSandbox("alpha", "hi", {}, deps)).rejects.toThrow("__exit:0");
    expect(spawn).toHaveBeenCalledTimes(1);
    const [bin, argv, options] = spawn.mock.calls[0] as [string, string[], unknown];
    expect(bin).toBe("/usr/local/bin/openshell");
    expect(argv).toEqual([
      "sandbox",
      "exec",
      "--name",
      "alpha",
      "--no-tty",
      "--",
      "openclaw",
      "agent",
      "--agent",
      "main",
      "-m",
      "hi",
    ]);
    expect(options).toEqual({ stdio: "inherit" });
  });

  it("propagates --agent, --workdir and --timeout into the inner argv", async () => {
    const { spawn, deps } = makeDeps("openclaw");
    await expect(
      promptSandbox(
        "alpha",
        "list",
        {
          agentProfile: "chess-bot",
          workdir: "/sandbox/workspace",
          timeoutSeconds: 30,
        },
        deps,
      ),
    ).rejects.toThrow("__exit:0");
    const [, rawArgv] = spawn.mock.calls[0] as [string, string[]];
    const argv = rawArgv;
    expect(argv).toContain("--workdir");
    expect(argv).toContain("/sandbox/workspace");
    expect(argv).toContain("--timeout");
    expect(argv).toContain("30");
    expect(argv).toContain("--no-tty");
    const dashDash = argv.indexOf("--");
    expect(argv.slice(dashDash + 1)).toEqual([
      "openclaw",
      "agent",
      "--agent",
      "chess-bot",
      "-m",
      "list",
    ]);
  });

  it("treats an unknown sandbox as OpenClaw (registry miss should not block)", async () => {
    const { spawn, deps } = makeDeps(null);
    await expect(promptSandbox("ghost", "hi", {}, deps)).rejects.toThrow("__exit:0");
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("exits 2 with a clear message when no prompt body is supplied", async () => {
    const { writes, exit, spawn, deps } = makeDeps("openclaw");
    await expect(promptSandbox("alpha", undefined, {}, deps)).rejects.toThrow("__exit:2");
    expect(spawn).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(2);
    expect(writes.join("")).toMatch(/positional argument or via --prompt-file/);
  });
});
