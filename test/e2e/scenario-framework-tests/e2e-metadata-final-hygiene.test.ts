// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { compileRunPlans } from "../scenarios/compiler.ts";
import { listScenarios } from "../scenarios/registry.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const E2E_DIR = path.join(REPO_ROOT, "test/e2e");
const README_PATH = path.join(E2E_DIR, "docs", "README.md");

describe("hybrid scenario metadata hygiene", () => {
  it("e2e_readme_should_document_typed_scenario_runner", () => {
    expect(fs.existsSync(README_PATH)).toBe(true);
    const raw = fs.readFileSync(README_PATH, "utf8");
    expect(raw).toMatch(/scenario/i);
    expect(raw).toMatch(/manifest|NemoClawInstance/i);
    expect(raw).toMatch(/assertion/i);
    expect(raw).toMatch(/test\/e2e\/scenarios\/run\.ts/);
  });

  it("all_typed_scenarios_should_compile_with_phase_coverage", () => {
    const problems: string[] = [];
    for (const scenario of listScenarios()) {
      try {
        const [plan] = compileRunPlans([scenario.id]);
        for (const phase of ["environment", "onboarding", "runtime"]) {
          if (!plan.phases.some((entry) => entry.name === phase && entry.assertionGroups.length > 0)) {
            problems.push(`${scenario.id}: missing ${phase} assertions`);
          }
        }
      } catch (err) {
        problems.push(`${scenario.id}: ${(err as Error).message}`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("should_not_reference_yaml_first_runtime_resolver", () => {
    const activeFiles = [
      path.join(E2E_DIR, "scenarios", "run.ts"),
      path.join(E2E_DIR, "runtime", "resolver", "index.ts"),
      path.join(E2E_DIR, "runtime", "coverage-report.sh"),
      path.join(REPO_ROOT, ".github", "workflows", "e2e-scenarios.yaml"),
    ];
    const offenders = activeFiles.filter((file) => /resolver\/plan|loadMetadataFromDir|setup_scenarios|test_plans/.test(fs.readFileSync(file, "utf8")));

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
