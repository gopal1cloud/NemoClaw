// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { compileRunPlans } from "../scenarios/compiler.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

describe("typed scenario compiler", () => {
  it("should_compile_valid_scenario", () => {
    const [plan] = compileRunPlans(["ubuntu-repo-cloud-openclaw"]);
    expect(plan.scenarioId).toBe("ubuntu-repo-cloud-openclaw");
    expect(plan.environment?.platform).toBe("ubuntu-local");
    expect(plan.environment?.install).toBe("repo-current");
    expect(plan.environment?.runtime).toBe("docker-running");
    expect(plan.environment?.onboarding).toBe("cloud-openclaw");
    expect(plan.expectedStateId).toBe("cloud-openclaw-ready");
    expect(plan.suiteIds).toEqual(["smoke", "inference", "credentials"]);
    expect(plan.phases.map((phase) => phase.name)).toEqual(["environment", "onboarding", "runtime"]);
    expect(plan.phases.flatMap((phase) => phase.assertionGroups).length).toBeGreaterThan(0);
  });

  it("should_resolve_onboard_negative_path_migration_scenarios", () => {
    const meta = realMetadata();
    const custom = resolveScenario("ubuntu-repo-cloud-openclaw-custom-policies", meta);
    expect(custom.dimensions.onboarding.id).toBe("cloud-openclaw-custom-policies");
    expect(custom.expected_state.id).toBe("cloud-openclaw-custom-policies-ready");
    expect(custom.suites.map((s) => s.id)).toContain("onboarding-state");

    const invalidKey = resolveScenario("ubuntu-invalid-nvidia-key-negative", meta);
    expect(invalidKey.expected_state.config.failure).toMatchObject({
      expected: true,
      stage: "onboarding",
      reason: "invalid-nvidia-api-key",
      exit_code: 1,
      no_stack_trace: true,
    });

    const portConflict = resolveScenario("ubuntu-gateway-port-conflict-negative", meta);
    expect(portConflict.expected_state.config.failure).toMatchObject({
      expected: true,
      stage: "onboarding",
      reason: "gateway-port-conflict",
      exit_code: 1,
      no_stack_trace: true,
    });
  });

  it("should_fail_for_unknown_scenario", () => {
    expect(() => compileRunPlans(["does-not-exist"])).toThrow(/does-not-exist/);
  });
});

describe("typed scenario runner --plan-only", () => {
  it("run_scenario_plan_only_should_print_plan", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-plan-"));
    try {
      const result = spawnSync(
        "npx",
        ["tsx", "test/e2e/scenarios/run.ts", "--scenarios", "ubuntu-repo-cloud-openclaw", "--plan-only"],
        {
          env: { ...process.env, E2E_CONTEXT_DIR: tmp },
          encoding: "utf8",
          timeout: Number(process.env.E2E_SPAWN_TIMEOUT_MS ?? 60_000),
          cwd: REPO_ROOT,
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("ubuntu-repo-cloud-openclaw");
      expect(result.stdout).toContain("cloud-openclaw-ready");
      expect(result.stdout).toContain("smoke");
      expect(result.stdout).toContain("inference");
      const planJsonPath = path.join(tmp, ".e2e", "run-plan.json");
      expect(fs.existsSync(planJsonPath)).toBe(true);
      const [doc] = JSON.parse(fs.readFileSync(planJsonPath, "utf8"));
      expect(doc.scenarioId).toBe("ubuntu-repo-cloud-openclaw");
      expect(doc.expectedStateId).toBe("cloud-openclaw-ready");
      expect(Array.isArray(doc.suiteIds)).toBe(true);
      expect(doc.suiteIds).toContain("smoke");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("run_scenario_plan_only_should_fail_for_unknown_scenario", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-plan-"));
    try {
      const result = spawnSync(
        "npx",
        ["tsx", "test/e2e/scenarios/run.ts", "--scenarios", "does-not-exist", "--plan-only"],
        {
          env: { ...process.env, E2E_CONTEXT_DIR: tmp },
          encoding: "utf8",
          timeout: Number(process.env.E2E_SPAWN_TIMEOUT_MS ?? 60_000),
          cwd: REPO_ROOT,
        },
      );
      expect(result.status).not.toBe(0);
      expect(`${result.stderr}${result.stdout}`).toMatch(/does-not-exist/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
