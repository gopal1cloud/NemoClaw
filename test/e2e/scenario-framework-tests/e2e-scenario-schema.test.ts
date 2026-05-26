// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { loadManifest } from "../scenarios/manifests.ts";
import { listScenarios } from "../scenarios/registry.ts";

const E2E_DIR = path.resolve(import.meta.dirname, "..");
const SCENARIOS_PATH = path.join(E2E_DIR, "nemoclaw_scenarios", "scenarios.yaml");
const STATES_PATH = path.join(E2E_DIR, "nemoclaw_scenarios", "expected-states.yaml");
const SUITES_PATH = path.join(E2E_DIR, "validation_suites", "suites.yaml");
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

type AnyRecord = Record<string, unknown>;

function loadYaml(p: string): AnyRecord {
  const raw = fs.readFileSync(p, "utf8");
  const doc = yaml.load(raw);
  if (!doc || typeof doc !== "object") {
    throw new Error(`YAML file ${p} did not parse to an object`);
  }
  return doc as AnyRecord;
}

describe("hybrid scenario metadata schema", () => {
  it("should_parse_transitional_reference_files", () => {
    expect(fs.existsSync(SCENARIOS_PATH)).toBe(true);
    expect(fs.existsSync(STATES_PATH)).toBe(true);
    expect(fs.existsSync(SUITES_PATH)).toBe(true);
    expect(() => loadYaml(SCENARIOS_PATH)).not.toThrow();
    expect(() => loadYaml(STATES_PATH)).not.toThrow();
    expect(() => loadYaml(SUITES_PATH)).not.toThrow();
  });

  it("scenarios_yaml_should_not_define_runtime_scenario_composition", () => {
    const scenarios = loadYaml(SCENARIOS_PATH);
    expect(scenarios).not.toHaveProperty("setup_scenarios");
    expect(scenarios).not.toHaveProperty("test_plans");
    expect(scenarios).not.toHaveProperty("base_scenarios");
    expect(scenarios).not.toHaveProperty("onboarding_profiles");
    expect(scenarios).not.toHaveProperty("onboarding_assertions");
  });

  it("typed_registry_should_define_initial_required_scenarios", () => {
    const ids = listScenarios().map((scenario) => scenario.id);
    expect(ids).toContain("ubuntu-repo-cloud-openclaw");
    expect(ids).toContain("ubuntu-repo-cloud-hermes");
    expect(ids).toContain("gpu-repo-local-ollama-openclaw");
  });

  it("expected_states_remain_transitional_contract_reference", () => {
    const states = loadYaml(STATES_PATH);
    const es = states.expected_states as AnyRecord;
    for (const id of [
      "cloud-openclaw-ready",
      "cloud-hermes-ready",
      "local-ollama-openclaw-ready",
      "preflight-failure-no-sandbox",
    ]) {
      expect(es, `expected state ${id} should be defined`).toHaveProperty(id);
    }
  });

  it("typed_scenarios_should_reference_valid_manifests_and_platform_runner_requirements", () => {
    for (const scenario of listScenarios()) {
      expect(scenario.manifestPath, `${scenario.id} missing manifest`).toBeTruthy();
      expect(() => loadManifest(path.join(REPO_ROOT, scenario.manifestPath as string))).not.toThrow();
      if (["macos-repo-cloud-openclaw", "wsl-repo-cloud-openclaw", "gpu-repo-local-ollama-openclaw", "brev-launchable-cloud-openclaw"].includes(scenario.id)) {
        expect(scenario.runnerRequirements, `${scenario.id} missing runner requirements`).toEqual(expect.arrayContaining([expect.any(String)]));
      }
    }
  });

  it("validation_suites_yaml_is_transitional_reference_only", () => {
    const suites = loadYaml(SUITES_PATH);
    expect(suites).toHaveProperty("suites");
    expect(fs.readFileSync(path.join(E2E_DIR, "scenarios", "run.ts"), "utf8")).not.toContain("validation_suites/suites.yaml");
  });
});
