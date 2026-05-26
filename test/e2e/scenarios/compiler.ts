// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { requireScenarios } from "./registry.ts";
import type { AssertionGroup, PhaseName, RunPlan, ScenarioDefinition } from "./types.ts";

const PHASES: PhaseName[] = ["environment", "onboarding", "runtime"];

function groupsForPhase(scenario: ScenarioDefinition, phase: PhaseName): AssertionGroup[] {
  return scenario.assertionGroups.filter((group) => group.phase === phase);
}

export function compileRunPlans(scenarioIds: string[]): RunPlan[] {
  return requireScenarios(scenarioIds).map((scenario) => ({
    scenarioId: scenario.id,
    status: "skeleton",
    note: "not-yet-implemented skeleton plan; live execution lands in later phases",
    manifestPath: scenario.manifestPath,
    phases: PHASES.map((phase) => ({
      name: phase,
      actions: [`${phase}: skeleton`],
      assertionGroups: groupsForPhase(scenario, phase),
    })),
    runnerRequirements: scenario.runnerRequirements ?? [],
    skippedCapabilities: scenario.skippedCapabilities ?? [],
    expectedFailure: scenario.expectedFailure,
  }));
}

export function renderPlanText(plans: RunPlan[]): string {
  const lines = ["Hybrid scenario run plan", ""];
  for (const plan of plans) {
    lines.push(`Scenario: ${plan.scenarioId}`);
    lines.push(`Status: ${plan.status}`);
    lines.push(`Note: ${plan.note ?? ""}`);
    lines.push(`Manifest: ${plan.manifestPath ?? "not-yet-defined"}`);
    for (const phase of plan.phases) {
      lines.push(`Phase: ${phase.name}`);
      for (const group of phase.assertionGroups) {
        lines.push(`  Group: ${group.id}`);
        for (const step of group.steps) {
          lines.push(`    Step: ${step.id}`);
        }
      }
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
