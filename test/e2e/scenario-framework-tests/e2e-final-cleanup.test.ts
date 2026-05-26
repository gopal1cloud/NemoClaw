// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { compileRunPlans } from "../scenarios/compiler.ts";
import { listScenarios } from "../scenarios/registry.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const E2E_DIR = path.join(REPO_ROOT, "test/e2e");
const README = path.join(E2E_DIR, "docs", "README.md");
const MIGRATION = path.join(E2E_DIR, "docs", "MIGRATION.md");

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function walk(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

describe("Phase 10 final cleanup", () => {
  it("test_should_document_hybrid_architecture_as_default", () => {
    const combined = `${read(README)}\n${read(MIGRATION)}`;

    expect(combined).toMatch(/hybrid typed architecture.*runtime source of truth/i);
    expect(combined).toMatch(/YAML.*setup\/onboarding desired state.*not.*scenario definition/is);
    expect(combined).toMatch(/scenarios?.*deterministic.*code builders?/is);
    expect(combined).toMatch(/assertions?.*phase-owned.*modules?/is);
  });

  it("test_should_pass_final_plan_only_sweep_for_all_canonical_ids", () => {
    const problems: string[] = [];
    for (const scenario of listScenarios()) {
      try {
        const [plan] = compileRunPlans([scenario.id]);
        if (plan.scenarioId !== scenario.id) problems.push(`${scenario.id}: wrong plan id ${plan.scenarioId}`);
        if (!plan.manifestPath) problems.push(`${scenario.id}: missing manifest`);
        if (plan.phases.length !== 3) problems.push(`${scenario.id}: expected three phases`);
      } catch (err) {
        problems.push(`${scenario.id}: ${(err as Error).message}`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("test_should_have_no_unresolved_migration_todos", () => {
    const scanRoots = [path.join(E2E_DIR, "scenarios"), path.join(E2E_DIR, "runtime"), path.join(E2E_DIR, "docs")];
    const offenders = scanRoots
      .flatMap((root) => walk(root))
      .filter((file) => !file.endsWith("parity-map.yaml") && !file.endsWith("parity-inventory.generated.json"))
      .filter((file) => /TODO|Phase 9 removes|Phase 10 removes|transitional reference until Phase/i.test(read(file)))
      .map((file) => path.relative(REPO_ROOT, file));

    expect(offenders, `unresolved migration cleanup markers:\n${offenders.join("\n")}`).toEqual([]);
  });
});
