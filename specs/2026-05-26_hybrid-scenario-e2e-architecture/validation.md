<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Validation Plan: Hybrid Scenario E2E Architecture

Generated from: `specs/2026-05-26_hybrid-scenario-e2e-architecture/spec.md`
Test Spec: `specs/2026-05-26_hybrid-scenario-e2e-architecture/tests.md`

## Overview

**Feature**: Convert the scenario-based E2E suite from YAML-first scenario composition to product-facing onboarding manifests plus typed scenario builders, assertion modules, a plan compiler, phase orchestrators, and compatibility entrypoints.

**Available Tools**: Bash, `npx tsx`, Vitest via `npm test`, YAML parsing through existing dependencies, GitHub workflow YAML inspection, filesystem checks.

## Coverage Summary

- Happy Paths: 12 scenarios
- Sad Paths: 12 scenarios
- Total: 24 scenarios

---

## Phase 1: Inventory Lock and Target Skeleton - Validation Scenarios

### Scenario 1.1: Registry skeleton lists known scenario IDs [STATUS: pending]
**Type**: Happy Path

**Given**: The new `test/e2e/scenarios/` skeleton exists with registry and runner entrypoint.
**When**: A maintainer runs `npx tsx test/e2e/scenarios/run.ts --list`.
**Then**: The command exits successfully and prints a stable list including at least `ubuntu-repo-cloud-openclaw`.

**Validation Steps**:
1. **Setup**: Bash: install dependencies already present in the worktree.
2. **Execute**: Bash: `npx tsx test/e2e/scenarios/run.ts --list`.
3. **Verify**: Bash: assert exit code 0 and output contains known scenario ID and no stack trace.

**Tools Required**: Bash, tsx.

### Scenario 1.2: Missing legacy inventory mapping fails clearly [STATUS: pending]
**Type**: Sad Path

**Given**: Legacy YAML contains setup scenarios, test plans, expected states, onboarding assertions, and validation suites.
**When**: A migration target is absent from migration inventory.
**Then**: The scenario-framework tests fail and identify the missing legacy key or script path.

**Validation Steps**:
1. **Setup**: Bash: create a temporary test fixture or use a controlled missing mapping test case.
2. **Execute**: Bash: run the targeted Vitest inventory test.
3. **Verify**: Bash: confirm the failure message lists the missing ID/path.

**Tools Required**: Bash, Vitest.

## Phase 2: Product-Facing Onboarding Manifests - Validation Scenarios

### Scenario 2.1: All manifests validate as product-facing NemoClawInstance YAML [STATUS: pending]
**Type**: Happy Path

**Given**: `test/e2e/manifests/*.yaml` contains migrated setup/onboarding desired state.
**When**: Manifest validation tests run.
**Then**: Every manifest validates with no assertion composition, suite IDs, or raw secrets.

**Validation Steps**:
1. **Setup**: Bash: ensure manifests exist for current test plan combinations.
2. **Execute**: Bash: `npm test -- --project cli test/e2e/scenario-framework-tests`.
3. **Verify**: Bash: check manifest validation tests pass.

**Tools Required**: Bash, Vitest.

### Scenario 2.2: Manifest with suite IDs or raw secrets is rejected [STATUS: pending]
**Type**: Sad Path

**Given**: A fixture manifest includes an E2E-only suite/assertion ID or literal token value.
**When**: The manifest loader validates the fixture.
**Then**: Validation fails before plan compilation with a clear separation/secret error.

**Validation Steps**:
1. **Setup**: Bash/Vitest fixture: construct invalid manifest data.
2. **Execute**: Vitest: call manifest validation.
3. **Verify**: Vitest: assert error mentions product-facing manifest boundaries or raw secret prohibition.

**Tools Required**: Vitest.

## Phase 3: Deterministic Scenario Builders and Registry - Validation Scenarios

### Scenario 3.1: Legacy scenario IDs compile through typed builders [STATUS: pending]
**Type**: Happy Path

**Given**: All current setup aliases and test plans are registered as typed scenarios or aliases.
**When**: A maintainer runs plan-only for `ubuntu-repo-cloud-openclaw` and another migrated ID.
**Then**: Each selected scenario compiles to a run plan with stable ID, manifest path, requirements, and expected metadata.

**Validation Steps**:
1. **Setup**: Bash: choose two known scenario IDs from the registry.
2. **Execute**: Bash: `npx tsx test/e2e/scenarios/run.ts --scenarios ubuntu-repo-cloud-openclaw,<second-id> --plan-only`.
3. **Verify**: Bash: inspect `.e2e/run-plan.json` or stdout for two scenario plans in stable order.

**Tools Required**: Bash, tsx.

### Scenario 3.2: Unknown scenario ID returns actionable error [STATUS: pending]
**Type**: Sad Path

**Given**: The scenario registry is populated.
**When**: A maintainer requests `--scenarios does-not-exist --plan-only`.
**Then**: The command exits non-zero and prints available scenario IDs.

**Validation Steps**:
1. **Setup**: Bash: no special setup.
2. **Execute**: Bash: run the command with an unknown ID.
3. **Verify**: Bash: assert non-zero exit and output includes `does-not-exist` plus available IDs.

**Tools Required**: Bash, tsx.

## Phase 4: Assertion Modules and Existing Suite Conversion - Validation Scenarios

### Scenario 4.1: Plan preview shows expanded assertion groups and steps by phase [STATUS: pending]
**Type**: Happy Path

**Given**: Onboarding assertions and validation suites are represented by assertion modules.
**When**: A maintainer runs plan-only for a baseline cloud OpenClaw scenario.
**Then**: The preview shows environment, onboarding, and runtime assertion groups with stable step IDs and evidence paths.

**Validation Steps**:
1. **Setup**: Bash: ensure assertion modules are registered.
2. **Execute**: Bash: `npx tsx test/e2e/scenarios/run.ts --scenarios ubuntu-repo-cloud-openclaw --plan-only`.
3. **Verify**: Bash: assert human summary includes all three phases and expanded steps.

**Tools Required**: Bash, tsx.

### Scenario 4.2: Invalid assertion reliability metadata fails validation [STATUS: pending]
**Type**: Sad Path

**Given**: An assertion step declares `attempts > 1` without a named retry classifier.
**When**: Assertion module validation runs.
**Then**: Validation fails and identifies the assertion step ID.

**Validation Steps**:
1. **Setup**: Vitest fixture: create invalid assertion step metadata.
2. **Execute**: Vitest: call assertion registry validation.
3. **Verify**: Vitest: assert failure names the step and classifier requirement.

**Tools Required**: Vitest.

### Scenario 4.3: Missing referenced shell script blocks migration completion [STATUS: pending]
**Type**: Sad Path

**Given**: An assertion step references a shell script path that does not exist.
**When**: Assertion registry tests run.
**Then**: Tests fail with the missing path and assertion ID.

**Validation Steps**:
1. **Setup**: Vitest fixture or controlled invalid registry entry.
2. **Execute**: Vitest: run assertion reference validation.
3. **Verify**: Vitest: assert failure includes missing script path.

**Tools Required**: Vitest, filesystem.

## Phase 5: Plan Compiler and Plan-Only Preview - Validation Scenarios

### Scenario 5.1: Plan-only writes machine-readable and human-readable artifacts [STATUS: pending]
**Type**: Happy Path

**Given**: `E2E_CONTEXT_DIR` points to a temporary directory.
**When**: A maintainer runs plan-only for a known scenario.
**Then**: The compiler writes `run-plan.json` and a readable plan summary under the context directory.

**Validation Steps**:
1. **Setup**: Bash: `export E2E_CONTEXT_DIR=$(mktemp -d)`.
2. **Execute**: Bash: `npx tsx test/e2e/scenarios/run.ts --scenarios ubuntu-repo-cloud-openclaw --plan-only`.
3. **Verify**: Bash: validate artifact files exist and contain scenario ID, manifest, phases, assertions, requirements, and reliability policy.

**Tools Required**: Bash, tsx, filesystem.

### Scenario 5.2: Incompatible scenario and manifest combination is rejected before execution [STATUS: pending]
**Type**: Sad Path

**Given**: A scenario is paired with an incompatible manifest override or fixture.
**When**: The plan compiler runs.
**Then**: Compilation fails before any environment/onboarding/runtime action runs.

**Validation Steps**:
1. **Setup**: Bash/Vitest: provide incompatible manifest fixture.
2. **Execute**: Bash or Vitest: compile the plan.
3. **Verify**: Assert non-zero/error and no phase result artifacts were created.

**Tools Required**: Bash or Vitest, tsx.

## Phase 6: Shared Clients and Phase Orchestrators - Validation Scenarios

### Scenario 6.1: Dry-run execution produces phase result artifacts [STATUS: pending]
**Type**: Happy Path

**Given**: The runner and phase orchestrators are implemented with dry-run support.
**When**: A maintainer runs a baseline scenario in dry-run mode.
**Then**: Environment, onboarding, and runtime phase result artifacts are emitted with per-step status, attempts, duration, classifier, and evidence fields where applicable.

**Validation Steps**:
1. **Setup**: Bash: set temporary `E2E_CONTEXT_DIR`.
2. **Execute**: Bash: `npx tsx test/e2e/scenarios/run.ts --scenarios ubuntu-repo-cloud-openclaw --dry-run`.
3. **Verify**: Bash: inspect `environment.result.json`, `onboarding.result.json`, and `runtime.result.json`.

**Tools Required**: Bash, tsx, filesystem.

### Scenario 6.2: Client layer does not decide pass/fail or retry policy [STATUS: pending]
**Type**: Sad Path

**Given**: Clients should expose act/observe primitives only.
**When**: Static/client contract tests inspect client modules.
**Then**: Tests fail if clients encode assertion IDs, expected-failure policy, retry policy, or pass/fail semantics.

**Validation Steps**:
1. **Setup**: Vitest: load client modules or source text.
2. **Execute**: Vitest: run client separation tests.
3. **Verify**: Assert pass/fail and retry policy are only in assertions/orchestrators.

**Tools Required**: Vitest.

## Phase 7: Runtime Entry Point and Workflow Migration - Validation Scenarios

### Scenario 7.1: Legacy shell entrypoint delegates to new runner [STATUS: pending]
**Type**: Happy Path

**Given**: `test/e2e/runtime/run-scenario.sh` is a compatibility shim.
**When**: A maintainer runs `bash test/e2e/runtime/run-scenario.sh ubuntu-repo-cloud-openclaw --plan-only`.
**Then**: The shell entrypoint invokes the new TypeScript runner and emits the same plan artifacts.

**Validation Steps**:
1. **Setup**: Bash: set temporary `E2E_CONTEXT_DIR`.
2. **Execute**: Bash: run the legacy command.
3. **Verify**: Bash: assert plan artifacts match the new runner output shape.

**Tools Required**: Bash, tsx, filesystem.

### Scenario 7.2: Workflow supports multiple scenario IDs while preserving routing [STATUS: pending]
**Type**: Happy Path

**Given**: `.github/workflows/e2e-scenarios.yaml` is migrated.
**When**: Workflow YAML tests parse `workflow_dispatch` inputs and jobs.
**Then**: The workflow has a `scenarios` input, preserves single-scenario compatibility during transition, and retains WSL/macOS routing and artifact upload.

**Validation Steps**:
1. **Setup**: Vitest: parse workflow YAML.
2. **Execute**: Vitest: inspect inputs/jobs/artifact upload paths.
3. **Verify**: Assert expected inputs and routing metadata exist.

**Tools Required**: Vitest, YAML parser.

### Scenario 7.3: Workflow rejects or documents unsupported legacy filter behavior [STATUS: pending]
**Type**: Sad Path

**Given**: Suite filtering is compatibility-only.
**When**: A legacy `suite_filter` is supplied after assertion modules become authoritative.
**Then**: The plan visibly marks compatibility behavior or returns a documented replacement message; it does not silently hide required assertions.

**Validation Steps**:
1. **Setup**: Bash: set `E2E_SUITE_FILTER` or workflow input fixture.
2. **Execute**: Bash/Vitest: compile plan.
3. **Verify**: Assert output includes compatibility warning or documented replacement.

**Tools Required**: Bash or Vitest.

## Phase 8: Coverage, Reporting, and Migration Metadata - Validation Scenarios

### Scenario 8.1: Coverage report uses builder, manifest, assertion, and phase registries [STATUS: pending]
**Type**: Happy Path

**Given**: Coverage reporting has been migrated.
**When**: A maintainer runs `bash test/e2e/runtime/coverage-report.sh`.
**Then**: The report includes scenario ID, manifest, environment family, onboarding configuration, assertion group, phase, gate, and expected-failure coverage.

**Validation Steps**:
1. **Setup**: Bash: ensure registry metadata exists.
2. **Execute**: Bash: `bash test/e2e/runtime/coverage-report.sh`.
3. **Verify**: Bash: inspect report output for required sections and counts.

**Tools Required**: Bash, tsx if coverage script delegates to TypeScript.

### Scenario 8.2: Missing coverage dimension fails tests [STATUS: pending]
**Type**: Sad Path

**Given**: A scenario lacks manifest or assertion coverage metadata.
**When**: Coverage tests run.
**Then**: Tests fail with the missing scenario/manifest/assertion ID.

**Validation Steps**:
1. **Setup**: Vitest fixture or controlled missing metadata.
2. **Execute**: Vitest: run coverage completeness tests.
3. **Verify**: Assert missing IDs are listed.

**Tools Required**: Vitest.

## Phase 9: Remove YAML-First Scenario Resolver - Validation Scenarios

### Scenario 9.1: Existing scenario IDs still work after resolver retirement [STATUS: pending]
**Type**: Happy Path

**Given**: YAML-first resolver code is removed or demoted.
**When**: A maintainer runs plan-only for every legacy scenario ID through the compatibility shell entrypoint.
**Then**: Each ID works through the new runner or returns a documented replacement message.

**Validation Steps**:
1. **Setup**: Bash: collect legacy IDs from migration metadata.
2. **Execute**: Bash: loop over IDs with `bash test/e2e/runtime/run-scenario.sh <id> --plan-only`.
3. **Verify**: Bash: assert each command succeeds or emits approved replacement text.

**Tools Required**: Bash, tsx.

### Scenario 9.2: Active runtime path no longer reads YAML test plans or suite composition [STATUS: pending]
**Type**: Sad Path

**Given**: Builder/assertion modules are authoritative.
**When**: Final hygiene tests inspect imports and active entrypoints.
**Then**: Tests fail if live paths still use `setup_scenarios`, `test_plans`, or `validation_suites/suites.yaml` as source of truth.

**Validation Steps**:
1. **Setup**: Vitest: scan source/import graph or known entrypoints.
2. **Execute**: Vitest: run metadata final hygiene tests.
3. **Verify**: Assert no forbidden live-path dependencies remain.

**Tools Required**: Vitest, filesystem.

## Phase 10: Current Child Issue and PR Alignment - Validation Scenarios

### Scenario 10.1: Child issue alignment checklist is complete [STATUS: pending]
**Type**: Happy Path

**Given**: The migration includes documentation or metadata for child issues under #3588 and PR #4252.
**When**: A maintainer reviews the alignment checklist.
**Then**: Every listed issue/PR has an architecture target area and no item directs new YAML-first scenario metadata except as a temporary shim.

**Validation Steps**:
1. **Setup**: Bash/manual: open the committed alignment doc or migration notes.
2. **Execute**: Manual review: compare listed issue IDs against spec Phase 10.
3. **Verify**: Manual: confirm each has target area and follow-up path.

**Tools Required**: Manual review, optional Bash.

### Scenario 10.2: New child work bypassing builders/assertion modules is blocked [STATUS: pending]
**Type**: Sad Path

**Given**: A child issue/PR adds YAML-first `test_plans` or `suites.yaml` as source of truth.
**When**: Maintainer review or convention tests run.
**Then**: The work is flagged as incomplete unless explicitly marked as a temporary compatibility shim.

**Validation Steps**:
1. **Setup**: Manual/Vitest: inspect changed files or fixture.
2. **Execute**: Run convention checks or review checklist.
3. **Verify**: Confirm bypass is blocked or documented as transitional.

**Tools Required**: Manual review, Vitest if automated.

## Phase 11: Clean the House - Validation Scenarios

### Scenario 11.1: Hybrid architecture is documented as the default [STATUS: pending]
**Type**: Happy Path

**Given**: Docs and agent guidance are updated.
**When**: A maintainer reads `test/e2e/docs/README.md`, `MIGRATION.md`, and relevant repo guidance.
**Then**: Docs state YAML is setup/onboarding state, scenarios are typed builders, and assertions are phase-owned code modules.

**Validation Steps**:
1. **Setup**: Bash: ensure docs exist.
2. **Execute**: Bash/Vitest: run docs content checks or grep required phrases.
3. **Verify**: Assert required architecture guidance is present.

**Tools Required**: Bash or Vitest.

### Scenario 11.2: Final checks catch obsolete resolver, legacy shell entrypoints, and unresolved TODOs [STATUS: pending]
**Type**: Sad Path

**Given**: Cleanup is complete.
**When**: Final hygiene tests and repository scans run.
**Then**: Tests fail if obsolete active resolver code, new legacy `test/e2e/test-*.sh` entrypoints, or untracked migration TODOs remain.

**Validation Steps**:
1. **Setup**: Bash: no special setup.
2. **Execute**: Bash: run targeted scenario-framework tests and repository scans.
3. **Verify**: Assert no forbidden active paths or unresolved TODOs are reported.

**Tools Required**: Bash, Vitest.

## Summary

| Phase | Happy | Sad | Total | Passed | Failed | Pending |
|-------|-------|-----|-------|--------|--------|---------|
| Phase 1 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 2 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 3 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 4 | 1 | 2 | 3 | 0 | 0 | 3 |
| Phase 5 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 6 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 7 | 2 | 1 | 3 | 0 | 0 | 3 |
| Phase 8 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 9 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 10 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 11 | 1 | 1 | 2 | 0 | 0 | 2 |
| **Total** | **12** | **12** | **24** | **0** | **0** | **24** |
