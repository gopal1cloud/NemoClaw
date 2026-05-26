// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { assertionRegistry } from "../scenarios/assertions/registry.ts";
import { migrationInventory } from "../scenarios/migration-inventory.ts";
import { listScenarios } from "../scenarios/registry.ts";

const E2E_DIR = path.resolve(import.meta.dirname, "..");
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
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
  it("old_scenarios_yaml_should_be_non_runtime_reference_only", () => {
    const scenarios = loadYaml(SCENARIOS_PATH);

    expect(scenarios.metadata).toMatchObject({ status: "non-runtime-reference-only" });
    for (const removed of ["setup_scenarios", "base_scenarios", "onboarding_profiles", "test_plans", "onboarding_assertions"]) {
      expect(scenarios).not.toHaveProperty(removed);
    }
  });

  it("typed_registry_should_cover_inventory_targets", () => {
    const scenarioIds = new Set(listScenarios().map((scenario) => scenario.id));
    const missingScenarios = migrationInventory.setupScenarios
      .map((entry) => entry.newOwner.replace(/^scenario:/, ""))
      .filter((owner) => !scenarioIds.has(owner));

    expect(missingScenarios, `missing scenario owners: ${missingScenarios.join(", ")}`).toEqual([]);
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
    const assertionSuiteIds = new Set(assertionRegistry.groups.map((group) => group.suiteId).filter((suiteId): suiteId is string => Boolean(suiteId)));
    const missingAssertionGroups = suiteIds.filter((suiteId) => !assertionSuiteIds.has(suiteId));

    expectCovered("validationSuites", suiteIds);
    expectCovered("validationSuiteScripts", scriptIds);
    expect(missingAssertionGroups, `missing assertion groups: ${missingAssertionGroups.join(", ")}`).toEqual([]);
  });

  it("should_keep_migration_inventory_out_of_runtime_entrypoint", () => {
    const runSource = fs.readFileSync(path.join(E2E_DIR, "scenarios", "run.ts"), "utf8");

    expect(runSource).not.toContain("migration-inventory");
  });

  it("should_have_seed_reliability_inventory", () => {
    const reliabilityExamples = assertionRegistry.groups.flatMap((group) => group.steps.map((step) => step.reliability).filter(Boolean));

    expect(reliabilityExamples.some((entry) => entry?.retry && entry.timeoutSeconds)).toBe(true);
  });
});
