// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { CommandDisplayEntry } from "../cli/command-display";

import { printHardwareResources } from "../resources-cmd";
import { NemoClawCommand } from "../cli/nemoclaw-oclif-command";

export default class ResourcesCommand extends NemoClawCommand {
  static id = "resources";
  static strict = true;
  static enableJsonFlag = true;
  static summary = "Show hardware inventory (CPU cores, RAM, GPU VRAM)";
  static description =
    "Display available hardware resources including CPU core count and model, " +
    "total system RAM and swap, Kubernetes node allocatable capacity (when a " +
    "gateway is running), and NVIDIA GPU name and VRAM. Supports --json for " +
    "machine-readable output.";
  static usage = ["resources [--json]"];
  static examples = [
    "<%= config.bin %> resources",
    "<%= config.bin %> resources --json",
  ];
  static flags = {};

  static display: readonly CommandDisplayEntry[] = [
    {
      usage: "nemoclaw resources",
      description: "Show hardware inventory (CPU cores, RAM, GPU VRAM)",
      flags: "(--json)",
      group: "Resources",
      scope: "global",
      order: 900,
    },
  ];

  public async run(): Promise<unknown> {
    await this.parse(ResourcesCommand);
    const result = printHardwareResources(this.jsonEnabled());
    if (this.jsonEnabled()) {
      return result;
    }
  }
}
