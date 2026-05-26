// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCENARIOS_YAML = path.join(REPO_ROOT, "test/e2e/nemoclaw_scenarios/scenarios.yaml");
const RUNTIME_DIR = path.join(REPO_ROOT, "test/e2e/runtime");
const SCENARIO_RUNNER = path.join(REPO_ROOT, "test/e2e/scenarios/run.ts");
const E2E_WORKFLOW = path.join(REPO_ROOT, ".github/workflows/e2e-scenarios.yaml");

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function walkFiles(root: string, include: (filePath: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, include));
    } else if (include(full)) {
      out.push(full);
    }
  }
  return out.sort();
}

describe("Phase 9 YAML-first source retirement", () => {
  it("test_should_not_use_yaml_test_plans_or_setup_scenarios_in_live_path", () => {
    const runtimeSources = [SCENARIO_RUNNER, E2E_WORKFLOW, ...walkFiles(RUNTIME_DIR, (file) => /\.(ts|sh)$/.test(file))];
    const offenders = runtimeSources
      .filter((file) => !file.endsWith("run-scenario.sh"))
      .filter((file) => !file.includes(`${path.sep}runtime${path.sep}resolver${path.sep}`))
      .filter((file) => /setup_scenarios|test_plans|runtime\/resolver\/plan|loadMetadataFromDir\(/.test(readText(file)));
    expect(offenders, `live path should not use YAML scenario composition:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("test_should_remove_old_shell_entrypoint_and_inputs", () => {
    const oldEntrypoint = readText(path.join(RUNTIME_DIR, "run-scenario.sh"));
    expect(oldEntrypoint).toMatch(/retired/i);
    expect(oldEntrypoint).toMatch(/test\/e2e\/scenarios\/run\.ts/);

    const workflow = yaml.load(readText(E2E_WORKFLOW)) as { on?: unknown; jobs?: Record<string, unknown> };
    const on = (workflow.on ?? (workflow as Record<string, unknown>)["true"]) as { workflow_dispatch?: { inputs?: Record<string, unknown> } };
    const inputs = on.workflow_dispatch?.inputs ?? {};
    expect(Object.keys(inputs).sort()).toEqual(["scenarios"]);
    expect(JSON.stringify(workflow)).not.toContain("suite_filter");
    expect(JSON.stringify(workflow)).not.toContain("test/e2e/runtime/run-scenario.sh");
  });

  it("test_should_have_no_duplicate_suite_assertion_source_of_truth", () => {
    const scenarios = yaml.load(readText(SCENARIOS_YAML)) as Record<string, unknown>;
    expect(scenarios).not.toHaveProperty("setup_scenarios");
    expect(scenarios).not.toHaveProperty("test_plans");
    expect(scenarios).not.toHaveProperty("base_scenarios");
    expect(scenarios).not.toHaveProperty("onboarding_profiles");
    expect(scenarios).not.toHaveProperty("onboarding_assertions");
  });
});
