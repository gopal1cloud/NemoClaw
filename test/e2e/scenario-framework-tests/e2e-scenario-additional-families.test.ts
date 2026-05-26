// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Phase 9: Migrate Additional Scenario Families.
 * Verifies metadata for new scenarios (macOS, WSL, GPU local Ollama, Brev
 * launchable, Ubuntu cloud Hermes, and the no-docker negative preflight)
 * plus the deferred schema concepts (scenario-level overrides, negative
 * expected state).
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadMetadataFromDir } from "../runtime/resolver/load.ts";
import { resolveScenario } from "../runtime/resolver/plan.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const E2E_DIR = path.join(REPO_ROOT, "test/e2e");
function planOnly(scenarioId: string): { stdout: string; stderr: string; status: number | null; plan: Record<string, unknown> } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-p9-"));
  try {
    const r = spawnSync("npx", ["tsx", "test/e2e/scenarios/run.ts", "--scenarios", scenarioId, "--plan-only"], {
      env: { ...process.env, E2E_CONTEXT_DIR: tmp },
      encoding: "utf8",
      timeout: Number(process.env.E2E_SPAWN_TIMEOUT_MS ?? 60_000),
      cwd: REPO_ROOT,
    });
    let plan = {};
    const pj = path.join(tmp, ".e2e", "run-plan.json");
    if (fs.existsSync(pj)) {
      plan = JSON.parse(fs.readFileSync(pj, "utf8"))[0] ?? {};
    }
    return { stdout: r.stdout, stderr: r.stderr, status: r.status, plan };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe("Phase 9: additional scenario families - metadata", () => {
  it("resolver should resolve all new scenarios", () => {
    const meta = loadMetadataFromDir(E2E_DIR);
    const ids = [
      "macos-repo-cloud-openclaw",
      "wsl-repo-cloud-openclaw",
      "gpu-repo-local-ollama-openclaw",
      "brev-launchable-cloud-openclaw",
      "ubuntu-repo-cloud-hermes",
      "ubuntu-no-docker-preflight-negative",
    ];
    for (const id of ids) {
      const plan = resolveScenario(id, meta);
      expect(plan.scenario_id).toBe(id);
      expect(plan.expected_state.id).toBeTypeOf("string");
      expect(Array.isArray(plan.suites)).toBe(true);
    }
  });
});

describe("Phase 9: macOS / WSL plan-only", () => {
  it("macos scenario plan identifies macOS platform", () => {
    const { status, plan } = planOnly("macos-repo-cloud-openclaw");
    expect(status).toBe(0);
    const manifest = (plan as { manifest: { spec: { setup: { platform: { os?: string } } } } }).manifest;
    expect(manifest.spec.setup.platform.os).toBe("macos");
  });

  it("wsl scenario plan identifies WSL platform", () => {
    const { status, plan } = planOnly("wsl-repo-cloud-openclaw");
    expect(status).toBe(0);
    const manifest = (plan as { manifest: { spec: { setup: { platform: { os?: string } } } } }).manifest;
    expect(manifest.spec.setup.platform.os).toBe("wsl");
  });
});

describe("Phase 9: GPU local Ollama plan-only", () => {
  it("runtime indicates GPU/CDI and provider is ollama", () => {
    const { status, plan } = planOnly("gpu-repo-local-ollama-openclaw");
    expect(status).toBe(0);
    const manifest = (plan as { manifest: { spec: { setup: { runtime: { gpuRuntime?: string } }; onboarding: { provider?: string } } } }).manifest;
    expect(manifest.spec.setup.runtime.gpuRuntime).toBe("cdi");
    expect(manifest.spec.onboarding.provider).toBe("ollama");
  });
});

describe("Phase 9: Brev launchable scenario (overrides schema)", () => {
  it("should_support_scenario_overrides_on_brev_launchable", () => {
    const meta = loadMetadataFromDir(E2E_DIR);
    const plan = resolveScenario("brev-launchable-cloud-openclaw", meta);
    expect(plan.overrides).toBeTruthy();
    const overrides = plan.overrides as {
      onboarding?: { gateway?: { bind_address?: string } };
    };
    expect(overrides?.onboarding?.gateway?.bind_address).toBeTypeOf("string");
    expect(overrides?.onboarding?.gateway?.bind_address?.length).toBeGreaterThan(0);
  });

  it("plan shows remote target, launchable install, and gateway bind override", () => {
    const { status, stdout, plan } = planOnly("brev-launchable-cloud-openclaw");
    expect(status).toBe(0);
    const manifest = (plan as { manifest: { spec: { setup: { platform: { executionTarget?: string }; install: { source?: string } }; onboarding: { gateway?: { bindAddress?: string } } } } }).manifest;
    expect(manifest.spec.setup.platform.executionTarget).toBe("remote");
    expect(manifest.spec.setup.install.source).toBe("launchable");
    expect(stdout).toMatch(/gateway/i);
    expect(manifest.spec.onboarding.gateway?.bindAddress).toBe("0.0.0.0");
  });
});

describe("Phase 9: negative preflight", () => {
  it("should_define_preflight_failure_no_sandbox_state", () => {
    const meta = loadMetadataFromDir(E2E_DIR);
    const es = meta.expectedStates.expected_states["preflight-failure-no-sandbox"] as
      | {
          gateway?: { expected?: string };
          sandbox?: { expected?: string };
          failure?: { expected?: boolean };
        }
      | undefined;
    expect(es, "preflight-failure-no-sandbox should be defined").toBeTruthy();
    expect(es?.gateway?.expected).toBe("absent");
    expect(es?.sandbox?.expected).toBe("absent");
    expect(es?.failure?.expected).toBe(true);
  });

  it("negative scenario plan identifies docker missing and negative state", () => {
    const { status, plan } = planOnly("ubuntu-no-docker-preflight-negative");
    expect(status).toBe(0);
    const p = plan as {
      manifest: { spec: { setup: { runtime: { containerDaemon?: string } } } };
      expectedStateId: string;
    };
    expect(p.manifest.spec.setup.runtime.containerDaemon).toBe("missing");
    expect(p.expectedStateId).toBe("preflight-failure-no-sandbox");
  });
});
