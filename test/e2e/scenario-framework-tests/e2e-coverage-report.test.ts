// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { renderCoverageReport, validateCoverage } from "../runtime/resolver/coverage.ts";
import { assertionRegistry } from "../scenarios/assertions/registry.ts";
import { listScenarios } from "../scenarios/registry.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

describe("typed scenario coverage report", () => {
  it("test_should_report_all_registry_scenarios_manifests_assertions_and_phases", () => {
    const scenarios = listScenarios();
    const md = renderCoverageReport();

    expect(md).toContain("# Hybrid Scenario E2E Coverage");
    expect(md).toMatch(/## Scenario Coverage/);
    expect(md).toMatch(/## Manifest Coverage/);
    expect(md).toMatch(/## Assertion Group Coverage/);
    expect(md).toMatch(/## Phase Coverage/);
    expect(md).toMatch(/## Runner, Secret, Skip, and Expected Failure Gates/);

    for (const scenario of scenarios) {
      expect(md).toContain(`| ${scenario.id} |`);
      expect(scenario.manifestPath, `${scenario.id} should have a manifest`).toBeTruthy();
      expect(md).toContain(scenario.manifestPath as string);
    }
    for (const group of assertionRegistry.groups) {
      expect(md).toContain(`| ${group.id} |`);
    }
    for (const phase of ["environment", "onboarding", "runtime"]) {
      expect(md).toMatch(new RegExp(`\\| ${phase} \\|\\s*\\d+\\s*\\|`));
    }
  });

  it("test_should_fail_when_manifest_or_assertion_coverage_missing", () => {
    const [scenario] = listScenarios();
    expect(() => validateCoverage([{ ...scenario, manifestPath: undefined }], assertionRegistry.groups)).toThrow(/manifest/i);
    expect(() => validateCoverage([{ ...scenario, assertionGroups: [] }], assertionRegistry.groups)).toThrow(/assertion/i);
  });

  it("test_should_not_depend_on_yaml_suites_as_source_of_truth", () => {
    const md = renderCoverageReport();
    expect(md).not.toContain("validation_suites/suites.yaml");
    expect(md).not.toContain("test/e2e/{scenarios,expected-states,suites}.yaml");
  });

  it("test_should_render_github_step_summary_coverage_sections", () => {
    const result = spawnSync("bash", ["test/e2e/runtime/coverage-report.sh"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: Number(process.env.E2E_SPAWN_TIMEOUT_MS ?? 60_000),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Scenarios:\s*\d+/);
    expect(result.stdout).toMatch(/Manifests:\s*\d+/);
    expect(result.stdout).toMatch(/Assertion groups:\s*\d+/);
    expect(result.stdout).toMatch(/Phases:\s*environment, onboarding, runtime/);
  });
});
