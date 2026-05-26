// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { compileRunPlans } from "../scenarios/compiler.ts";
import { loadManifest, loadManifestsFromDir, validateManifest } from "../scenarios/manifests.ts";
import { migrationInventory } from "../scenarios/migration-inventory.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const E2E_DIR = path.join(REPO_ROOT, "test/e2e");
const MANIFEST_DIR = path.join(E2E_DIR, "manifests");
const SCENARIOS_PATH = path.join(E2E_DIR, "nemoclaw_scenarios", "scenarios.yaml");

type AnyRecord = Record<string, unknown>;

function loadYaml(filePath: string): AnyRecord {
  const doc = yaml.load(fs.readFileSync(filePath, "utf8"));
  if (!doc || typeof doc !== "object") {
    throw new Error(`${filePath} did not parse to an object`);
  }
  return doc as AnyRecord;
}

describe("NemoClawInstance manifests", () => {
  it("test_should_validate_all_nemoclaw_instance_manifests", () => {
    const manifests = loadManifestsFromDir(MANIFEST_DIR);

    expect(manifests.length).toBeGreaterThanOrEqual(19);
    for (const manifest of manifests) {
      expect(() => validateManifest(manifest.document, manifest.filePath)).not.toThrow();
    }
  });

  it("test_should_reject_manifest_with_assertion_or_suite_ids", () => {
    const badManifest = {
      apiVersion: "nemoclaw.io/v1",
      kind: "NemoClawInstance",
      metadata: { name: "bad" },
      spec: {
        setup: { install: { source: "repo-current" } },
        onboarding: { agent: "openclaw", provider: "nvidia" },
        assertions: ["runtime.smoke"],
        suites: ["smoke"],
      },
    };

    expect(() => validateManifest(badManifest, "bad.yaml")).toThrow(/assertion|suite|product-facing/i);
  });

  it("test_should_reject_raw_secret_values_in_manifest", () => {
    const badManifest = {
      apiVersion: "nemoclaw.io/v1",
      kind: "NemoClawInstance",
      metadata: { name: "bad-secret" },
      spec: {
        setup: { install: { source: "repo-current" } },
        onboarding: { agent: "openclaw", provider: "nvidia", apiKey: "nvapi-literal-secret" },
        state: { credentialRefs: ["NVIDIA_API_KEY"] },
      },
    };

    expect(() => validateManifest(badManifest, "bad-secret.yaml")).toThrow(/raw secret|credentialRefs/i);
  });

  it("test_should_cover_or_delete_every_old_test_plan_manifest_need", () => {
    const scenarios = loadYaml(SCENARIOS_PATH);
    const oldTestPlans = Object.keys(scenarios.test_plans as AnyRecord).sort();
    const coveredPlans = new Set(migrationInventory.testPlans.map((entry) => entry.id));
    const missingPlans = oldTestPlans.filter((id) => !coveredPlans.has(id));
    const manifestOwners = new Set(
      migrationInventory.onboardingProfiles
        .map((entry) => entry.newOwner)
        .filter((owner) => owner.startsWith("manifest:"))
        .map((owner) => owner.replace(/^manifest:/, "")),
    );
    const manifestNames = new Set(
      loadManifestsFromDir(MANIFEST_DIR).map((manifest) => manifest.document.metadata.name),
    );
    const missingManifests = Array.from(manifestOwners).filter((id) => !manifestNames.has(id));

    expect(missingPlans, `missing test plan manifest coverage: ${missingPlans.join(", ")}`).toEqual([]);
    expect(missingManifests, `missing manifest files: ${missingManifests.join(", ")}`).toEqual([]);
  });

  it("plan_only_output_should_show_resolved_manifest_setup_and_onboarding_choices", () => {
    const [plan] = compileRunPlans(["ubuntu-repo-cloud-openclaw"]);

    expect(plan.manifestPath).toBe("test/e2e/manifests/openclaw-nvidia.yaml");
    expect(plan.manifest).toEqual(loadManifest(path.join(REPO_ROOT, plan.manifestPath)).document);
    expect(plan.manifest?.spec.setup.install.source).toBe("repo-current");
    expect(plan.manifest?.spec.onboarding.agent).toBe("openclaw");
    expect(plan.manifest?.spec.onboarding.provider).toBe("nvidia");
  });
});
