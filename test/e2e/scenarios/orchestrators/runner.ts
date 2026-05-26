// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { PhaseResult, RunContext, RunPlan } from "../types.ts";
import { EnvironmentOrchestrator } from "./environment.ts";
import { OnboardingOrchestrator } from "./onboarding.ts";
import { RuntimeOrchestrator } from "./runtime.ts";

export class ScenarioRunner {
  private readonly environment = new EnvironmentOrchestrator();
  private readonly onboarding = new OnboardingOrchestrator();
  private readonly runtime = new RuntimeOrchestrator();

  async run(ctx: RunContext, plan: RunPlan): Promise<PhaseResult[]> {
    const results: PhaseResult[] = [];
    for (const phase of plan.phases) {
      if (phase.name === "environment") {
        results.push(await this.environment.run(ctx, phase));
      } else if (phase.name === "onboarding") {
        results.push(await this.onboarding.run(ctx, phase));
      } else {
        results.push(await this.runtime.run(ctx, phase));
      }
    }
    return results;
  }
}
