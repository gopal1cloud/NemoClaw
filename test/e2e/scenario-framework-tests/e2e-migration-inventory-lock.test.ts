// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { migrationInventory } from "../scenarios/migration-inventory.ts";

const E2E_DIR = path.resolve(import.meta.dirname, "..");
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SPEC_DIR = path.resolve(REPO_ROOT, "specs/2026-05-26_hybrid-scenario-e2e-architecture");
const SCENARIOS_PATH = path.join(E2E_DIR, "nemoclaw_scenarios", "scenarios.yaml");
const EXPECTED_STATES_PATH = path.join(E2E_DIR, "nemoclaw_scenarios", "expected-states.yaml");
const SUITES_PATH = path.join(E2E_DIR, "validation_suites", "suites.yaml");

type AnyRecord = Record<string, unknown>;

function loadYaml(filePath: string): AnyRecord {
  const doc = yaml.load(fs.readFileSync(filePath, "utf8"));
  if (!doc || typeof doc !== "object") {
    throw new Error(`${filePath} did not parse to an object`);
  }
  return doc as AnyRecord;
}

function keysFrom(record: unknown): string[] {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return [];
  }
  return Object.keys(record as AnyRecord).sort();
}

function expectCovered(kind: keyof typeof migrationInventory, ids: string[]) {
  const mappedIds = new Set(migrationInventory[kind].map((entry) => entry.id));
  const missing = ids.filter((id) => !mappedIds.has(id));
  expect(missing, `missing ${kind} migration target(s): ${missing.join(", ")}`).toEqual([]);
}

describe("hybrid scenario migration inventory lock", () => {
  it("test_should_fail_when_old_setup_scenario_missing_new_owner_or_removal_rationale", () => {
    const scenarios = loadYaml(SCENARIOS_PATH);

    expectCovered("setupScenarios", keysFrom(scenarios.setup_scenarios));
    expectCovered("baseScenarios", keysFrom(scenarios.base_scenarios));
    expectCovered("onboardingProfiles", keysFrom(scenarios.onboarding_profiles));
    expectCovered("testPlans", keysFrom(scenarios.test_plans));
    expectCovered("onboardingAssertions", keysFrom(scenarios.onboarding_assertions));
  });

  it("should_fail_when_old_expected_state_missing_new_owner_or_removal_rationale", () => {
    const states = loadYaml(EXPECTED_STATES_PATH);

    expectCovered("expectedStates", keysFrom(states.expected_states));
  });

  it("test_should_fail_when_old_validation_suite_script_missing_new_owner_or_removal_rationale", () => {
    const suites = loadYaml(SUITES_PATH).suites as Record<string, { steps?: Array<{ script?: string }> }>;
    const suiteIds = keysFrom(suites);
    const scriptIds = Array.from(
      new Set(
        Object.values(suites)
          .flatMap((suite) => suite.steps ?? [])
          .map((step) => step.script)
          .filter((script): script is string => Boolean(script)),
      ),
    ).sort();

    expectCovered("validationSuites", suiteIds);
    expectCovered("validationSuiteScripts", scriptIds);
  });

  it("should_keep_migration_inventory_out_of_runtime_entrypoint", () => {
    const runSource = fs.readFileSync(path.join(E2E_DIR, "scenarios", "run.ts"), "utf8");

    expect(runSource).not.toContain("migration-inventory");
  });

  it("should_have_seed_reliability_inventory", () => {
    const inventoryPath = path.join(SPEC_DIR, "reliability-inventory.md");
    const contents = fs.readFileSync(inventoryPath, "utf8");

    expect(contents).toMatch(/retry[\s\S]*timeout[\s\S]*skip[\s\S]*classification/i);
  });
});
