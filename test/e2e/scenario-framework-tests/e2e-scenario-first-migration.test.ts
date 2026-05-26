// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Phase 1 hybrid scenario skeleton checks.
 * The old YAML-first resolver remains in the tree during migration, but new
 * scenario work starts from test/e2e/scenarios/run.ts and typed registry APIs.
 */

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { compileRunPlans } from "../scenarios/compiler.ts";
import { listScenarios } from "../scenarios/registry.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const RUN_SCENARIOS = path.join(REPO_ROOT, "test/e2e/scenarios/run.ts");
const TSX = path.join(REPO_ROOT, "node_modules/.bin/tsx");

function runScenarioCli(args: string[]) {
  return spawnSync(TSX, [RUN_SCENARIOS, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: Number(process.env.E2E_SPAWN_TIMEOUT_MS ?? 60_000),
  });
}

describe("Phase 1: hybrid scenario skeleton", () => {
  it("ubuntu_repo_cloud_openclaw_should_be_registered_in_typed_registry", () => {
    expect(listScenarios().map((scenario) => scenario.id)).toContain("ubuntu-repo-cloud-openclaw");
  });

  it("ubuntu_repo_cloud_openclaw_should_compile_to_skeleton_plan", () => {
    const [plan] = compileRunPlans(["ubuntu-repo-cloud-openclaw"]);

    expect(plan).toEqual(
      expect.objectContaining({
        scenarioId: "ubuntu-repo-cloud-openclaw",
        status: "compiled",
        manifestPath: "test/e2e/manifests/openclaw-nvidia.yaml",
      }),
    );
    expect(plan.phases.map((phase) => phase.name)).toEqual(["environment", "onboarding", "runtime"]);
  });

  it("typed_runner_should_list_initial_registry", () => {
    const result = runScenarioCli(["--list"]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("hybrid scenario registry");
    expect(result.stdout).toContain("ubuntu-repo-cloud-openclaw");
  });

  it("typed_runner_should_print_initial_plan_only_preview", () => {
    const result = runScenarioCli(["--scenarios", "ubuntu-repo-cloud-openclaw", "--plan-only"]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Scenario: ubuntu-repo-cloud-openclaw");
    expect(result.stdout).toContain("compiled plan-only preview");
  });
});
