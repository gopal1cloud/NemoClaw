// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { PhaseResult, RunContext, RunPlanPhase } from "../types.ts";

export class RuntimeOrchestrator {
  async run(_ctx: RunContext, _phase: RunPlanPhase): Promise<PhaseResult> {
    return { phase: "runtime", status: "skipped", assertions: [] };
  }
}
