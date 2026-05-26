// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mergeExpectedFailure, type ResolverInput } from "./load.ts";
import type { AnyRecord, ResolvedScenario, ResolvedSuite } from "./schema.ts";

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function section(doc: AnyRecord, key: string): AnyRecord {
  const value = doc[key];
  return isRecord(value) ? value : {};
}

function requireEntry(sectionValue: AnyRecord, id: string, kind: string): AnyRecord {
  const value = sectionValue[id];
  if (!isRecord(value)) throw new Error(`Unknown ${kind}: ${id}`);
  return value;
}

function dimension(id: string, values: AnyRecord, kind: string) {
  return { id, config: requireEntry(values, id, kind) };
}

function suite(id: string, suites: AnyRecord): ResolvedSuite {
  const config = requireEntry(suites, id, "suite");
  return {
    id,
    requires_state: isRecord(config.requires_state) ? config.requires_state : undefined,
    steps: Array.isArray(config.steps) ? (config.steps as Array<Record<string, unknown>>) : undefined,
  };
}

export function resolveScenario(scenarioId: string, meta: ResolverInput): ResolvedScenario {
  const scenarios = meta.scenarios;
  const setupScenarios = section(scenarios, "setup_scenarios");
  const testPlans = section(scenarios, "test_plans");
  const platforms = section(scenarios, "platforms");
  const installs = section(scenarios, "installs");
  const runtimes = section(scenarios, "runtimes");
  const onboarding = { ...section(scenarios, "onboarding"), ...section(scenarios, "onboarding_profiles") };
  const suites = section(meta.suites, "suites");
  const expectedStates = section(meta.expectedStates, "expected_states");

  const legacy = requireEntry(setupScenarios, scenarioId, "scenario");
  const planId = typeof legacy.alias_for_plan === "string" ? legacy.alias_for_plan : undefined;
  const plan = planId && isRecord(testPlans[planId]) ? (testPlans[planId] as AnyRecord) : undefined;
  const dims = isRecord(legacy.dimensions) ? legacy.dimensions : {};
  const base = plan && typeof plan.base === "string" && isRecord(section(scenarios, "base_scenarios")[plan.base])
    ? (section(scenarios, "base_scenarios")[plan.base] as AnyRecord)
    : undefined;

  const platformId = String(dims.platform ?? base?.platform ?? "");
  const installId = String(dims.install ?? base?.install ?? "");
  const runtimeId = String(dims.runtime ?? base?.runtime ?? "");
  const onboardingId = String(dims.onboarding ?? plan?.onboarding ?? "");
  const expectedStateId = String(legacy.expected_state ?? plan?.expected_state ?? "");
  const suiteIds: unknown[] = Array.isArray(legacy.suites) ? legacy.suites : Array.isArray(plan?.suites) ? plan.suites : [];
  const expectedStateConfig = requireEntry(expectedStates, expectedStateId, "expected_state");

  return {
    scenario_id: scenarioId,
    dimensions: {
      platform: dimension(platformId, platforms, "platform"),
      install: dimension(installId, installs, "install"),
      runtime: dimension(runtimeId, runtimes, "runtime"),
      onboarding: dimension(onboardingId, onboarding, "onboarding"),
    },
    expected_state: { id: expectedStateId, config: expectedStateConfig },
    suites: suiteIds.map((id: unknown) => suite(String(id), suites)),
    runner_requirements: Array.isArray(legacy.runner_requirements) ? legacy.runner_requirements as string[] : undefined,
    required_secrets: Array.isArray(legacy.required_secrets) ? legacy.required_secrets as string[] : undefined,
    expected_failure: mergeExpectedFailure(expectedStateConfig.expected_failure, legacy.expected_failure, expectedStateId),
  };
}

export function formatPlan(plan: ResolvedScenario): string {
  return JSON.stringify(plan, null, 2);
}
