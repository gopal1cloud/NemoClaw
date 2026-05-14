// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { withCommandDisplay } from "../lib/cli/command-display";
import Command from "../lib/commands/resources";

export default withCommandDisplay(Command, [
  {
    usage: "nemoclaw resources",
    description: "Show hardware inventory (CPU cores, RAM, GPU VRAM)",
    flags: "[--json]",
    group: "Resources",
    scope: "global",
    order: 900,
  },
]);
