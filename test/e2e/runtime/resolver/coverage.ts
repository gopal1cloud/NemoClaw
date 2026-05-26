// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Render Markdown coverage for the hybrid scenario E2E architecture.
 *
 * The source of truth is the typed scenario registry, product-facing manifests,
 * and assertion modules. Legacy YAML suite/test-plan files are intentionally not
 * loaded here.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertionRegistry } from "../../scenarios/assertions/registry.ts";
import { compileRunPlans } from "../../scenarios/compiler.ts";
import { loadManifest } from "../../scenarios/manifests.ts";
import { listScenarios } from "../../scenarios/registry.ts";
import type { AssertionGroup, PhaseName, ScenarioDefinition } from "../../scenarios/types.ts";

export interface CoverageReportOptions {
  /** Optional map of scenario id -> last known run status. */
  lastRunStatus?: Record<string, string>;
}

export interface CoverageSummary {
  scenarios: number;
  manifests: number;
  assertionGroups: number;
  phases: PhaseName[];
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const PHASES: PhaseName[] = ["environment", "onboarding", "runtime"];

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function groupIdsFor(scenario: ScenarioDefinition): string[] {
  return uniqueSorted(scenario.assertionGroups.map((group) => group.id));
}

function phaseCounts(groups: AssertionGroup[]): Record<PhaseName, number> {
  return PHASES.reduce(
    (acc, phase) => {
      acc[phase] = groups.filter((group) => group.phase === phase).length;
      return acc;
    },
    {} as Record<PhaseName, number>,
  );
}

export function validateCoverage(
  scenarios: ScenarioDefinition[] = listScenarios(),
  groups: AssertionGroup[] = assertionRegistry.groups,
): void {
  if (scenarios.length === 0) {
    throw new Error("Coverage has no registered scenarios");
  }
  if (groups.length === 0) {
    throw new Error("Coverage has no registered assertion groups");
  }

  const coveredGroups = new Set<string>();
  const missingManifests: string[] = [];
  const missingAssertions: string[] = [];
  for (const scenario of scenarios) {
    if (!scenario.manifestPath) {
      missingManifests.push(scenario.id);
    }
    if (scenario.assertionGroups.length === 0) {
      missingAssertions.push(scenario.id);
    }
    for (const group of scenario.assertionGroups) {
      coveredGroups.add(group.id);
    }
  }
  if (missingManifests.length > 0) {
    throw new Error(`Scenarios missing manifest coverage: ${missingManifests.sort().join(", ")}`);
  }
  if (missingAssertions.length > 0) {
    throw new Error(`Scenarios missing assertion coverage: ${missingAssertions.sort().join(", ")}`);
  }

  const registeredIds = new Set(groups.map((group) => group.id));
  const unknownGroups = uniqueSorted([...coveredGroups].filter((id) => !registeredIds.has(id)));
  if (unknownGroups.length > 0) {
    throw new Error(`Scenarios reference unknown assertion groups: ${unknownGroups.join(", ")}`);
  }

  const uncoveredGroups = uniqueSorted([...registeredIds].filter((id) => !coveredGroups.has(id)));
  if (uncoveredGroups.length > 0) {
    throw new Error(`Registered assertion groups missing scenario coverage: ${uncoveredGroups.join(", ")}`);
  }

  for (const scenario of scenarios) {
    for (const phase of PHASES) {
      if (!scenario.assertionGroups.some((group) => group.phase === phase)) {
        throw new Error(`Scenario ${scenario.id} missing ${phase} phase coverage`);
      }
    }
  }
}

export function buildCoverageSummary(scenarios: ScenarioDefinition[] = listScenarios()): CoverageSummary {
  return {
    scenarios: scenarios.length,
    manifests: uniqueSorted(scenarios.map((scenario) => scenario.manifestPath).filter((value): value is string => Boolean(value))).length,
    assertionGroups: uniqueSorted(scenarios.flatMap((scenario) => groupIdsFor(scenario))).length,
    phases: PHASES,
  };
}

export function renderCoverageReport(_meta?: unknown, options: CoverageReportOptions = {}): string {
  const scenarios = listScenarios();
  const groups = assertionRegistry.groups;
  validateCoverage(scenarios, groups);
  const plans = compileRunPlans(scenarios);
  const summary = buildCoverageSummary(scenarios);
  const hasStatus = Boolean(options.lastRunStatus && Object.keys(options.lastRunStatus).length > 0);

  const lines: string[] = [];
  lines.push("# Hybrid Scenario E2E Coverage");
  lines.push("");
  lines.push("_Generated from typed scenario builders, product manifests, and assertion modules._");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Scenarios: ${summary.scenarios}`);
  lines.push(`- Manifests: ${summary.manifests}`);
  lines.push(`- Assertion groups: ${summary.assertionGroups}`);
  lines.push(`- Phases: ${summary.phases.join(", ")}`);
  lines.push("");

  lines.push("## Scenario Coverage");
  lines.push("");
  lines.push(hasStatus ? "| Scenario | Manifest | Environment | Expected state | Assertion groups | Last run |" : "| Scenario | Manifest | Environment | Expected state | Assertion groups |");
  lines.push(hasStatus ? "|---|---|---|---|---|---|" : "|---|---|---|---|---|");
  for (const scenario of scenarios) {
    const env = scenario.environment
      ? `platform=${scenario.environment.platform}<br>install=${scenario.environment.install}<br>runtime=${scenario.environment.runtime}<br>onboarding=${scenario.environment.onboarding}`
      : "_none_";
    const row = [
      scenario.id,
      scenario.manifestPath ?? "_missing_",
      env,
      scenario.expectedStateId ?? "_none_",
      groupIdsFor(scenario).join(", "),
    ];
    if (hasStatus) {
      row.push(options.lastRunStatus?.[scenario.id] ?? "_unknown_");
    }
    lines.push(`| ${row.join(" | ")} |`);
  }
  lines.push("");

  lines.push("## Manifest Coverage");
  lines.push("");
  lines.push("| Manifest | Scenarios | Agent | Provider | Route | Platform | Runtime |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const manifestPath of uniqueSorted(scenarios.map((scenario) => scenario.manifestPath).filter((value): value is string => Boolean(value)))) {
    const manifest = loadManifest(path.resolve(REPO_ROOT, manifestPath)).document;
    const users = scenarios.filter((scenario) => scenario.manifestPath === manifestPath).map((scenario) => scenario.id).sort();
    lines.push(
      `| ${manifestPath} | ${users.join(", ")} | ${manifest.spec.onboarding.agent} | ${manifest.spec.onboarding.provider} | ${manifest.spec.onboarding.modelRoute ?? "_none_"} | ${manifest.spec.setup.platform.os ?? "unknown"}/${manifest.spec.setup.platform.executionTarget ?? "unknown"} | ${manifest.spec.setup.runtime.containerEngine ?? "unknown"}/${manifest.spec.setup.runtime.containerDaemon ?? "unknown"} |`,
    );
  }
  lines.push("");

  lines.push("## Environment Family Coverage");
  lines.push("");
  lines.push("| Family | Values |");
  lines.push("|---|---|");
  lines.push(`| Platform | ${uniqueSorted(scenarios.map((scenario) => scenario.environment?.platform ?? "unknown")).join(", ")} |`);
  lines.push(`| Install | ${uniqueSorted(scenarios.map((scenario) => scenario.environment?.install ?? "unknown")).join(", ")} |`);
  lines.push(`| Runtime | ${uniqueSorted(scenarios.map((scenario) => scenario.environment?.runtime ?? "unknown")).join(", ")} |`);
  lines.push(`| Onboarding | ${uniqueSorted(scenarios.map((scenario) => scenario.environment?.onboarding ?? "unknown")).join(", ")} |`);
  lines.push("");

  lines.push("## Assertion Group Coverage");
  lines.push("");
  lines.push("| Assertion group | Phase | Source | Scenarios | Steps |");
  lines.push("|---|---|---|---|---:|");
  for (const group of [...groups].sort((a, b) => a.id.localeCompare(b.id))) {
    const users = scenarios.filter((scenario) => scenario.assertionGroups.some((entry) => entry.id === group.id)).map((scenario) => scenario.id).sort();
    lines.push(`| ${group.id} | ${group.phase} | ${group.suiteId ? `suite:${group.suiteId}` : group.onboardingAssertionId ? `onboarding:${group.onboardingAssertionId}` : "typed"} | ${users.join(", ")} | ${group.steps.length} |`);
  }
  lines.push("");

  lines.push("## Phase Coverage");
  lines.push("");
  lines.push("| Phase | Assertion groups | Scenario coverage |");
  lines.push("|---|---:|---:|");
  const counts = phaseCounts(groups);
  for (const phase of PHASES) {
    const scenarioCount = scenarios.filter((scenario) => scenario.assertionGroups.some((group) => group.phase === phase)).length;
    lines.push(`| ${phase} | ${counts[phase]} | ${scenarioCount}/${scenarios.length} |`);
  }
  lines.push("");

  lines.push("## Runner, Secret, Skip, and Expected Failure Gates");
  lines.push("");
  lines.push("| Scenario | Runner requirements | Required secrets | Skipped capabilities | Expected failure |");
  lines.push("|---|---|---|---|---|");
  for (const plan of plans) {
    lines.push(
      `| ${plan.scenarioId} | ${plan.runnerRequirements.join(", ") || "_none_"} | ${plan.requiredSecrets.join(", ") || "_none_"} | ${plan.skippedCapabilities.map((entry) => entry.id ?? "unnamed").join(", ") || "_none_"} | ${plan.expectedFailure ? JSON.stringify(plan.expectedFailure) : "_none_"} |`,
    );
  }
  lines.push("");

  lines.push("## Gaps");
  lines.push("");
  lines.push("_No gaps detected._");

  return `${lines.join("\n").trimEnd()}\n`;
}
