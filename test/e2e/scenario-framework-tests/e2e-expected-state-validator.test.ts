// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  validateExpectedState,
  type ProbeResults,
  type ExpectedStateConfig,
  type ResolvedSuite,
} from "../runtime/resolver/validator.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const RUN_SCENARIO = path.join(REPO_ROOT, "test/e2e/runtime/run-scenario.sh");

function cloudOpenclawReady(): ExpectedStateConfig {
  return {
    cli: { installed: true },
    gateway: { expected: "present", health: "healthy" },
    sandbox: { expected: "present", status: "running", agent: "openclaw" },
    inference: {
      expected: "available",
      provider: "nvidia",
      route: "inference-local",
      mode: "gateway-routed",
    },
    credentials: { expected: "present", storage: "gateway-managed" },
  };
}

function passingProbes(): ProbeResults {
  return {
    "cli.installed": true,
    "gateway.health": "healthy",
    "gateway.expected": "present",
    "sandbox.status": "running",
    "sandbox.expected": "present",
    "sandbox.agent": "openclaw",
    "inference.expected": "available",
    "inference.provider": "nvidia",
    "inference.route": "inference-local",
    "inference.mode": "gateway-routed",
    "credentials.expected": "present",
    "credentials.storage": "gateway-managed",
  };
}

describe("expected state validator", () => {
  it("should_validate_matching_state", () => {
    const report = validateExpectedState({
      stateId: "cloud-openclaw-ready",
      state: cloudOpenclawReady(),
      probes: passingProbes(),
      suites: [],
    });
    expect(report.ok).toBe(true);
    expect(report.checks.every((c) => c.ok)).toBe(true);
  });

  it("should_fail_when_gateway_expected_but_unhealthy", () => {
    const probes = passingProbes();
    probes["gateway.health"] = "unhealthy";
    const report = validateExpectedState({
      stateId: "cloud-openclaw-ready",
      state: cloudOpenclawReady(),
      probes,
      suites: [],
    });
    expect(report.ok).toBe(false);
    const failing = report.checks.find((c) => c.key === "gateway.health");
    expect(failing?.ok).toBe(false);
    expect(failing?.expected).toBe("healthy");
    expect(failing?.actual).toBe("unhealthy");
  });

  it("should_fail_when_sandbox_expected_but_absent", () => {
    const probes = passingProbes();
    probes["sandbox.status"] = "absent";
    probes["sandbox.expected"] = "absent";
    const report = validateExpectedState({
      stateId: "cloud-openclaw-ready",
      state: cloudOpenclawReady(),
      probes,
      suites: [],
    });
    expect(report.ok).toBe(false);
    expect(report.checks.some((c) => c.key === "sandbox.status" && !c.ok)).toBe(true);
  });

  it("should_fail_when_suite_requires_state_unmet_at_runtime", () => {
    // Expected state claims inference.expected=available, but the probe
    // reports unavailable; the smoke suite happens to pass but an inference
    // suite's requires_state should trigger a runtime failure before
    // execution.
    const state = cloudOpenclawReady();
    const probes = passingProbes();
    probes["inference.expected"] = "unavailable";
    const inferenceSuite: ResolvedSuite = {
      id: "inference",
      requires_state: { "inference.expected": "available" },
      steps: [{ id: "models-health", script: "suites/inference/cloud/00-models-health.sh" }],
    };
    const report = validateExpectedState({
      stateId: "cloud-openclaw-ready",
      state,
      probes,
      suites: [inferenceSuite],
    });
    expect(report.ok).toBe(false);
    const msg = report.checks
      .filter((c) => !c.ok)
      .map((c) => `${c.key}=${c.actual ?? "<missing>"} (wanted ${c.expected})`)
      .join("; ");
    expect(msg).toMatch(/inference\.expected/);
    expect(msg).toMatch(/available/);
    expect(msg).toMatch(/unavailable/);
    // Should also reference the suite that made the requirement.
    expect(report.checks.some((c) => c.suite === "inference" && !c.ok)).toBe(true);
  });
});

describe("typed runner dry-run phase artifacts", () => {
  it("runs phase orchestrators and writes phase artifacts", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-es-"));
    try {
      const r = spawnSync(
        "npx",
        ["tsx", "test/e2e/scenarios/run.ts", "--scenarios", "ubuntu-repo-cloud-openclaw", "--dry-run"],
        {
          env: { ...process.env, E2E_CONTEXT_DIR: tmp },
          encoding: "utf8",
          timeout: Number(process.env.E2E_SPAWN_TIMEOUT_MS ?? 60_000),
          cwd: REPO_ROOT,
        },
      );
      expect(r.status, r.stderr).toBe(0);
      for (const artifact of ["environment.result.json", "onboarding.result.json", "runtime.result.json"]) {
        expect(fs.existsSync(path.join(tmp, ".e2e", artifact)), `missing ${artifact}`).toBe(true);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1.F — --validate-only flag on run-scenario.sh
// ─────────────────────────────────────────────────────────────────────────────

describe("typed runner --validate-only flag", () => {
  it("compiles plans without running phase artifacts", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-validate-only-"));
    try {
      const r = spawnSync(
        "npx",
        ["tsx", "test/e2e/scenarios/run.ts", "--scenarios", "ubuntu-repo-cloud-openclaw", "--validate-only"],
        {
          env: { ...process.env, E2E_CONTEXT_DIR: tmp },
          encoding: "utf8",
          timeout: Number(process.env.E2E_SPAWN_TIMEOUT_MS ?? 60_000),
          cwd: REPO_ROOT,
        },
      );
      expect(r.status, r.stderr).toBe(0);
      expect(fs.existsSync(path.join(tmp, ".e2e", "run-plan.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmp, ".e2e", "runtime.result.json"))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("is_mutually_exclusive_with_plan_only", () => {
    const r = spawnSync(
      "npx",
      ["tsx", "test/e2e/scenarios/run.ts", "--scenarios", "ubuntu-repo-cloud-openclaw", "--validate-only", "--plan-only"],
      { encoding: "utf8", timeout: 15_000, cwd: REPO_ROOT },
    );
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/mutually.exclusive|cannot.*both|--plan-only.*--validate-only|--validate-only.*--plan-only/i);
  });
});
