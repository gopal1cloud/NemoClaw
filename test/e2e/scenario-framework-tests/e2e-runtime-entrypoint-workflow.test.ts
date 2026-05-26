// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { listScenarios } from "../scenarios/registry.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const WORKFLOW_PATH = path.join(REPO_ROOT, ".github/workflows/e2e-scenarios.yaml");
const OLD_RUN_SCENARIO = path.join(REPO_ROOT, "test/e2e/runtime/run-scenario.sh");

type AnyRecord = Record<string, unknown>;
type WorkflowStep = { name?: string; run?: string; uses?: string; with?: AnyRecord; if?: string };

function loadWorkflow(): AnyRecord {
  return yaml.load(fs.readFileSync(WORKFLOW_PATH, "utf8")) as AnyRecord;
}

function workflowInputs(workflow: AnyRecord): AnyRecord {
  const on = (workflow.on ?? workflow[true as unknown as string]) as AnyRecord;
  return ((on.workflow_dispatch as AnyRecord).inputs ?? {}) as AnyRecord;
}

function job(workflow: AnyRecord, id: string): AnyRecord {
  return ((workflow.jobs as AnyRecord)[id] ?? {}) as AnyRecord;
}

function steps(workflow: AnyRecord, id: string): WorkflowStep[] {
  return (job(workflow, id).steps ?? []) as WorkflowStep[];
}

function step(workflow: AnyRecord, id: string, name: string): WorkflowStep {
  const found = steps(workflow, id).find((candidate) => candidate.name === name);
  expect(found, `missing ${name}`).toBeTruthy();
  return found ?? {};
}

describe("runtime entrypoint and workflow migration", () => {
  it("test_should_delete_or_fail_fast_old_shell_entrypoint", () => {
    if (!fs.existsSync(OLD_RUN_SCENARIO)) {
      expect(fs.existsSync(OLD_RUN_SCENARIO)).toBe(false);
      return;
    }

    const result = spawnSync("bash", [OLD_RUN_SCENARIO, "ubuntu-repo-cloud-openclaw", "--plan-only"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: Number(process.env.E2E_SPAWN_TIMEOUT_MS ?? 60_000),
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/npx tsx test\/e2e\/scenarios\/run\.ts/);
  });

  it("test_should_accept_comma_separated_scenarios_workflow_input", () => {
    const workflow = loadWorkflow();
    const inputs = workflowInputs(workflow);

    expect(inputs).toHaveProperty("scenarios");
    expect(inputs).not.toHaveProperty("scenario");
    expect(inputs).not.toHaveProperty("suite_filter");
    expect(JSON.stringify(inputs.scenarios)).toMatch(/comma-separated|comma separated|id1,id2/i);
  });

  it("test_should_preserve_wsl_and_macos_routing_metadata", () => {
    const workflow = loadWorkflow();
    const pick = step(workflow, "resolve-runner", "Resolve typed scenario runners");
    const scenarioIds = listScenarios().map((scenario) => scenario.id);

    expect(scenarioIds).toContain("macos-repo-cloud-openclaw");
    expect(scenarioIds).toContain("wsl-repo-cloud-openclaw");
    expect(pick.run).toContain("macos-repo-cloud-openclaw");
    expect(pick.run).toContain("macos-26");
    expect(pick.run).toContain("wsl-repo-cloud-openclaw");
    expect(pick.run).toContain("windows-latest");
  });

  it("test_should_upload_plan_phase_results_summary_and_logs", () => {
    const workflow = loadWorkflow();
    const run = step(workflow, "run-scenario", "Run typed scenarios");
    const summary = step(workflow, "run-scenario", "Append plan summary");
    const upload = step(workflow, "run-scenario", "Upload scenario artifacts");

    expect(run.run).toContain("npx tsx test/e2e/scenarios/run.ts");
    expect(run.run).toContain("--scenarios");
    expect(summary.run).toContain(".e2e/plan.txt");
    expect(upload.with?.path).toContain(".e2e/run-plan.json");
    expect(upload.with?.path).toContain(".e2e/environment.result.json");
    expect(upload.with?.path).toContain(".e2e/onboarding.result.json");
    expect(upload.with?.path).toContain(".e2e/runtime.result.json");
    expect(upload.with?.path).toContain("test/e2e/logs/");
  });
});
