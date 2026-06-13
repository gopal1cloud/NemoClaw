// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";

import * as registry from "../../state/registry";
import { buildOpenshellExecArgs, computeExitCode } from "./exec";

export type SandboxPromptOptions = {
  agentProfile?: string;
  workdir?: string;
  timeoutSeconds?: number;
  promptFile?: string;
};

type SpawnLikeResult = {
  status: number | null;
  signal?: NodeJS.Signals | null;
  error?: Error;
};

const DEFAULT_AGENT_PROFILE = "main";

export function buildOpenclawAgentArgs(
  text: string,
  options: SandboxPromptOptions = {},
): string[] {
  return [
    "openclaw",
    "agent",
    "--agent",
    options.agentProfile || DEFAULT_AGENT_PROFILE,
    "-m",
    text,
  ];
}

export function readPromptText(text: string | undefined, promptFile: string | undefined): string {
  const hasInline = typeof text === "string" && text.length > 0;
  const hasFile = typeof promptFile === "string" && promptFile.length > 0;
  if (hasInline && hasFile) {
    throw new Error("Pass either a positional prompt or --prompt-file, not both.");
  }
  if (hasInline) return text as string;
  if (hasFile) {
    const source = promptFile === "-" ? 0 : (promptFile as string);
    return readFileSync(source, "utf8");
  }
  throw new Error("Provide a prompt as a positional argument or via --prompt-file <path|->.");
}

function exitWithSpawnResult(
  result: SpawnLikeResult,
  proc: PromptProcess,
): never {
  const { code, errorMessage } = computeExitCode(result);
  if (errorMessage) {
    proc.stderr.write(`  Failed to invoke openshell: ${errorMessage}\n`);
    proc.stderr.write("  Ensure 'openshell' is installed and on PATH.\n");
  }
  proc.exit(code);
}

type PromptProcess = {
  exit(code: number): never;
  stderr: { write(s: string): unknown };
};

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

export type PromptDeps = {
  getSandbox?: typeof registry.getSandbox;
  getOpenshellBinary?: () => string;
  spawn?: typeof spawnSync;
  process?: PromptProcess;
};

export async function promptSandbox(
  sandboxName: string,
  text: string | undefined,
  options: SandboxPromptOptions = {},
  deps: PromptDeps = {},
): Promise<void> {
  const proc = deps.process ?? process;
  const agent = resolveSandboxAgent(sandboxName, deps.getSandbox);
  if (agent && agent !== "openclaw") {
    proc.stderr.write(
      `  prompt is currently supported only on OpenClaw sandboxes (got '${agent}').\n`,
    );
    proc.stderr.write(
      "  Hermes exposes an OpenAI-compatible API on port 8642 inside the sandbox;\n",
    );
    proc.stderr.write(
      `  forward it with 'openshell forward start --background 8642 ${sandboxName}'\n`,
    );
    proc.stderr.write("  and POST to http://127.0.0.1:8642/v1/chat/completions instead.\n");
    proc.exit(2);
  }

  let body: string;
  try {
    body = readPromptText(text, options.promptFile);
  } catch (error) {
    proc.stderr.write(`  ${(error as Error).message}\n`);
    return proc.exit(2);
  }

  const innerCommand = buildOpenclawAgentArgs(body, options);
  const argv = buildOpenshellExecArgs(sandboxName, innerCommand, {
    workdir: options.workdir,
    tty: false,
    timeoutSeconds: options.timeoutSeconds,
  });
  const openshellBinary =
    deps.getOpenshellBinary?.() ?? require("../../adapters/openshell/runtime").getOpenshellBinary();
  const spawn = deps.spawn ?? spawnSync;
  const result = spawn(openshellBinary, argv, { stdio: "inherit" });
  if (result.status === null && !result.error && !result.signal) {
    proc.stderr.write(`  openshell exited without status (uname=${os.type()}).\n`);
  }
  exitWithSpawnResult(result, proc);
}
