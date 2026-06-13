// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { Args, Flags } from "@oclif/core";
import { promptSandbox } from "../../lib/actions/sandbox/prompt";
import { NemoClawCommand } from "../../lib/cli/nemoclaw-oclif-command";

export default class SandboxPromptCommand extends NemoClawCommand {
  static id = "sandbox:prompt";
  static strict = false;
  static summary = "Send a single prompt to a running sandbox's agent non-interactively";
  static description =
    "Send one prompt to the OpenClaw agent inside a running sandbox and stream the response to stdout. The command runs inside the sandbox via the OpenShell exec transport, with HOME=/sandbox so the selected agent profile resolves the same way as `connect`. Supply the prompt as a positional argument, or read it from a file (or stdin via '-') with --prompt-file. Currently supported on OpenClaw sandboxes only; for Hermes, POST to its OpenAI-compatible API on port 8642 inside the sandbox.";
  static usage = [
    "<name> [--agent <profile>] [--workdir <dir>] [--timeout <s>] [--prompt-file <path|->] [<text>]",
  ];
  static examples = [
    '<%= config.bin %> sandbox prompt alpha "Summarise README.md"',
    "<%= config.bin %> sandbox prompt alpha --prompt-file ./question.txt",
    '<%= config.bin %> sandbox prompt alpha --agent chess-bot "Best opening for Black?"',
    '<%= config.bin %> sandbox prompt alpha --prompt-file - <<<"What is 2+2?"',
  ];
  static args = {
    sandboxName: Args.string({ name: "sandbox", description: "Sandbox name", required: true }),
    text: Args.string({
      name: "text",
      description: "Prompt text. Omit when supplying --prompt-file.",
    }),
  };
  static flags = {
    agent: Flags.string({
      description: "OpenClaw agent profile to address (default: main)",
    }),
    workdir: Flags.string({ description: "Working directory inside the sandbox" }),
    timeout: Flags.integer({
      min: 0,
      description: "Timeout in seconds (0 = no timeout)",
    }),
    "prompt-file": Flags.string({
      description: "Read prompt body from a file path, or '-' for stdin",
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(SandboxPromptCommand);
    await promptSandbox(args.sandboxName, args.text, {
      agentProfile: flags.agent,
      workdir: flags.workdir,
      timeoutSeconds: flags.timeout,
      promptFile: flags["prompt-file"],
    });
  }
}
