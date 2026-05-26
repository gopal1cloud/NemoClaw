<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Test Specification: Hybrid Scenario E2E Architecture

Generated from: `specs/2026-05-26_hybrid-scenario-e2e-architecture/spec.md`

## Test Strategy

Use the existing root Vitest ESM/TypeScript patterns under `test/e2e/scenario-framework-tests/`. Tests should be deterministic unless explicitly validating a dry-run or plan-only process invocation. Do not call live NVIDIA, messaging, Brev, Docker, or provider APIs in unit/scenario-framework tests.

Primary test locations:

- `test/e2e/scenario-framework-tests/*.test.ts` for registry, compiler, manifest, inventory, workflow, and convention tests.
- `test/e2e/scenarios/**/*.test.ts` only if co-location becomes useful for pure TypeScript helpers.
- Existing shell assertions remain implementation fixtures; tests should validate references and dry-run behavior, not execute live E2E flows unless already covered by existing E2E workflows.

## Phase 1: Inventory Lock and Target Skeleton - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-legacy-assertion-inventory.test.ts`
  - Current behavior: Tracks legacy assertion/suite inventory.
  - Required changes: Assert every legacy key/script has migration metadata in `test/e2e/scenarios/migration-inventory.ts`.
- `test/e2e/scenario-framework-tests/e2e-scenario-first-migration.test.ts`
  - Current behavior: Transitional resolver/migration checks.
  - Required changes: Validate the new skeleton exports and skeleton CLI behavior.

**New Tests to Create:**

1. `test_should_fail_when_setup_scenario_missing_migration_target`
   - **Input**: Parsed `scenarios.yaml` setup scenario keys and migration inventory.
   - **Expected**: Any missing key produces a clear assertion failure listing the key.
   - **Covers**: Inventory lock acceptance criteria.

2. `test_should_fail_when_validation_suite_script_missing_migration_target`
   - **Input**: Parsed `validation_suites/suites.yaml` and referenced shell scripts.
   - **Expected**: Every suite and referenced script maps to a scenario assertion migration entry.
   - **Covers**: Suite conversion inventory.

3. `test_should_print_registry_skeleton_with_list_flag`
   - **Input**: `npx tsx test/e2e/scenarios/run.ts --list`.
   - **Expected**: Exit 0 and stable registry listing format.
   - **Covers**: Initial CLI shape.

4. `test_should_emit_skeleton_plan_for_known_id_in_plan_only_mode`
   - **Input**: `--scenarios ubuntu-repo-cloud-openclaw --plan-only`.
   - **Expected**: Exit 0 with not-yet-implemented/skeleton plan including scenario ID.
   - **Covers**: Plan-only skeleton.

**Test Implementation Notes:**

- Use `yaml` or `js-yaml` already present in the root package.
- Use existing process-spawn helper patterns and `E2E_SPAWN_TIMEOUT_MS` where applicable.

## Phase 2: Product-Facing Onboarding Manifests - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-scenario-schema.test.ts`
  - Add manifest schema validation cases.

**New Tests to Create:**

1. `test_should_validate_all_nemoclaw_instance_manifests`
   - **Input**: Every `test/e2e/manifests/*.yaml` file.
   - **Expected**: Valid `apiVersion`, `kind`, `metadata.name`, setup, onboarding, and state fields.
   - **Covers**: Manifest validation.

2. `test_should_reject_manifest_with_assertion_or_suite_ids`
   - **Input**: Fixture manifest containing `assertions`, `suites`, or legacy suite IDs.
   - **Expected**: Validation fails with a product-facing-only error.
   - **Covers**: YAML separation rule.

3. `test_should_reject_raw_secret_values_in_manifest`
   - **Input**: Fixture manifest with literal API key/token fields.
   - **Expected**: Validation fails; only credential refs are accepted.
   - **Covers**: Secret handling.

4. `test_should_map_every_current_test_plan_to_manifest`
   - **Input**: Current `test_plans` and manifest registry/mapping.
   - **Expected**: Every plan has a primary manifest or explicit composition path.
   - **Covers**: Complete manifest conversion.

**Test Implementation Notes:**

- Keep validation pure TypeScript and dependency-light.
- Fixtures should live under scenario-framework test fixtures or inline temp files.

## Phase 3: Deterministic Scenario Builders and Registry - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-scenario-resolver.test.ts`
  - Add semantic comparisons between legacy IDs and builder registry IDs.
- `test/e2e/scenario-framework-tests/e2e-scenario-additional-families.test.ts`
  - Update to check platform/negative metadata from builders.

**New Tests to Create:**

1. `test_should_register_all_legacy_setup_aliases_and_test_plans`
   - **Input**: Legacy setup aliases and test plan IDs.
   - **Expected**: Registry lookup succeeds for all IDs.
   - **Covers**: Stable targeted execution.

2. `test_should_reject_duplicate_scenario_ids`
   - **Input**: Registry fixture with duplicate IDs.
   - **Expected**: Registry construction fails with duplicate ID list.
   - **Covers**: Registry integrity.

3. `test_should_return_actionable_unknown_scenario_error`
   - **Input**: `--scenarios does-not-exist --plan-only`.
   - **Expected**: Non-zero exit and available IDs in stderr/stdout.
   - **Covers**: CLI usability.

4. `test_should_compile_multiple_targeted_scenario_plans`
   - **Input**: `--scenarios id1,id2 --plan-only`.
   - **Expected**: Two run plans emitted in stable order.
   - **Covers**: Multi-ID workflow dispatch.

**Test Implementation Notes:**

- Do not execute live scenario actions.
- Compare semantic fields, not byte-identical legacy resolver JSON.

## Phase 4: Assertion Modules and Existing Suite Conversion - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-convention-lint.test.ts`
  - Block new top-level legacy `test/e2e/test-*.sh` entrypoints unless explicitly allowlisted.
- `test/e2e/scenario-framework-tests/e2e-suite-runner.test.ts`
  - Validate legacy scripts can be invoked through assertion module references.

**New Tests to Create:**

1. `test_should_map_every_onboarding_assertion_to_assertion_step`
   - **Input**: `onboarding_assertions` keys and scripts.
   - **Expected**: Assertion module contains stable step IDs and phase owner.
   - **Covers**: Onboarding assertion conversion.

2. `test_should_map_every_validation_suite_to_assertion_group_or_pending_entry`
   - **Input**: `validation_suites.suites` keys.
   - **Expected**: Each key maps to complete, pending, or retired metadata with rationale.
   - **Covers**: Suite conversion completeness.

3. `test_should_fail_when_assertion_step_references_missing_script`
   - **Input**: Assertion module registry.
   - **Expected**: Missing shell script path fails with assertion ID and path.
   - **Covers**: Reference integrity.

4. `test_should_fail_when_retry_attempts_lack_classifier`
   - **Input**: Assertion step with `attempts > 1` and empty `retry.on`.
   - **Expected**: Validation fails.
   - **Covers**: Reliability policy.

5. `test_should_block_complete_status_for_manual_classification_steps`
   - **Input**: Migration metadata referencing reliability inventory `needs-manual-classification`.
   - **Expected**: Complete assertion migration status fails.
   - **Covers**: Reliability inventory use.

**Test Implementation Notes:**

- Validate IDs are stable, unique, and phase-owned.
- Keep shell execution dry-run unless a current unit test already safely runs the script.

## Phase 5: Plan Compiler and Plan-Only Preview - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-context-helper.test.ts`
  - Update expected context/run-plan artifacts.
- `test/e2e/scenario-framework-tests/e2e-coverage-report.test.ts`
  - Add plan artifact coverage fields if reused by coverage reporting.

**New Tests to Create:**

1. `test_should_emit_machine_and_human_plan_artifacts_under_context_dir`
   - **Input**: Temp `E2E_CONTEXT_DIR`, known scenario, `--plan-only`.
   - **Expected**: `.e2e/run-plan.json` and human summary exist with expected fields.
   - **Covers**: Compiler artifacts.

2. `test_should_include_expanded_assertion_steps_by_phase`
   - **Input**: Compiled baseline scenario.
   - **Expected**: Environment, onboarding, runtime sections include groups and steps.
   - **Covers**: Plan visibility.

3. `test_should_show_timeout_and_retry_policy_in_plan`
   - **Input**: Scenario with retryable transient step.
   - **Expected**: Plan includes attempts, timeout, and classifier.
   - **Covers**: Reliability preview.

4. `test_should_reject_incompatible_manifest_scenario_combination`
   - **Input**: Platform scenario with incompatible manifest fixture.
   - **Expected**: Compiler fails before execution.
   - **Covers**: Compatibility checks.

5. `test_should_preserve_legacy_suite_filter_only_as_visible_compatibility_shim`
   - **Input**: `E2E_SUITE_FILTER` with plan-only run.
   - **Expected**: Plan marks filter as compatibility behavior; required assertions are not silently hidden.
   - **Covers**: Simplified filter policy.

**Test Implementation Notes:**

- Validate JSON shape through TypeScript guards, not a new validation framework unless justified.

## Phase 6: Shared Clients and Phase Orchestrators - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-suite-runner.test.ts`
  - Route dry-run assertion execution through phase orchestrator paths.

**New Tests to Create:**

1. `test_should_execute_phase_assertions_from_phase_orchestrators_not_top_level_runner`
   - **Input**: Fake phases and fake assertion steps.
   - **Expected**: Top-level runner delegates; phase orchestrators execute assertions.
   - **Covers**: Phase ownership.

2. `test_should_record_step_status_attempts_duration_classifier_and_evidence`
   - **Input**: Fake assertion step that retries once then passes.
   - **Expected**: Phase result contains required per-step result fields.
   - **Covers**: Phase result contract.

3. `test_should_enforce_timeout_and_retry_policy_in_orchestrator`
   - **Input**: Fake step with timeout/retry metadata.
   - **Expected**: Orchestrator applies policy and records exhaustion/failure correctly.
   - **Covers**: Reliability enforcement.

4. `test_should_keep_clients_free_of_pass_fail_and_retry_semantics`
   - **Input**: Static import/source checks or fake client contract tests.
   - **Expected**: Clients expose act/observe results only; no assertion/retry policy fields.
   - **Covers**: Access-layer separation.

**Test Implementation Notes:**

- Use fake clients and fake shell commands; do not require Docker or network.

## Phase 7: Runtime Entry Point and Workflow Migration - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-scenarios-workflow.test.ts`
  - Validate new `scenarios` input and preserved compatibility inputs.
- `test/e2e/scenario-framework-tests/e2e-suite-runner.test.ts`
  - Validate `run-scenario.sh` delegates to `test/e2e/scenarios/run.ts`.

**New Tests to Create:**

1. `test_should_keep_single_scenario_shell_entrypoint_compatible`
   - **Input**: `bash test/e2e/runtime/run-scenario.sh ubuntu-repo-cloud-openclaw --plan-only`.
   - **Expected**: Delegates to new runner and emits plan.
   - **Covers**: Compatibility shim.

2. `test_should_accept_comma_separated_scenarios_workflow_input`
   - **Input**: Parsed workflow YAML.
   - **Expected**: `workflow_dispatch.inputs.scenarios` exists and is documented.
   - **Covers**: Multi-target workflow.

3. `test_should_preserve_wsl_and_macos_routing_metadata`
   - **Input**: Workflow YAML and scenario registry metadata.
   - **Expected**: Platform scenarios route as before.
   - **Covers**: Runner routing.

4. `test_should_upload_plan_phase_results_summary_and_logs`
   - **Input**: Workflow YAML.
   - **Expected**: Artifact upload includes plan and result paths.
   - **Covers**: Artifact continuity.

**Test Implementation Notes:**

- Workflow tests should parse YAML and inspect jobs/inputs rather than running Actions.

## Phase 8: Coverage, Reporting, and Migration Metadata - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-coverage-report.test.ts`
  - Switch source of truth from YAML suites to builder/manifest/assertion registries.
- `test/e2e/scenario-framework-tests/e2e-parity-map.test.ts`
  - Mark legacy parity assets as transitional if retained.

**New Tests to Create:**

1. `test_should_report_scenario_manifest_assertion_and_phase_coverage`
   - **Input**: New coverage implementation.
   - **Expected**: Report includes all required coverage dimensions.
   - **Covers**: Reporting requirements.

2. `test_should_fail_when_manifest_or_assertion_coverage_missing`
   - **Input**: Coverage fixture with missing manifest/assertion mapping.
   - **Expected**: Test fails with missing IDs.
   - **Covers**: Coverage completeness.

3. `test_should_not_depend_on_yaml_suites_as_source_of_truth`
   - **Input**: Coverage module imports/source inspection.
   - **Expected**: Does not load `validation_suites/suites.yaml` as authoritative metadata.
   - **Covers**: YAML-first retirement path.

4. `test_should_render_github_step_summary_coverage_sections`
   - **Input**: Coverage report dry run.
   - **Expected**: Summary includes scenario, manifest, assertion, and phase counts.
   - **Covers**: Maintainer visibility.

## Phase 9: Remove YAML-First Scenario Resolver - Test Guide

**Existing Tests to Modify:**

- Remove or replace old resolver tests in `test/e2e/scenario-framework-tests/e2e-scenario-resolver.test.ts` after builder/compiler parity is complete.
- Update `e2e-metadata-final-hygiene.test.ts` to assert no active live path reads YAML test plans or suite composition.

**New Tests to Create:**

1. `test_should_not_use_yaml_test_plans_or_setup_scenarios_in_live_path`
   - **Input**: Runtime entrypoint and scenario runner source/import graph.
   - **Expected**: No active dependency on legacy YAML scenario composition.
   - **Covers**: Source-of-truth retirement.

2. `test_should_keep_existing_id_plan_only_compatibility_or_replacement_message`
   - **Input**: Every legacy scenario ID through `run-scenario.sh --plan-only`.
   - **Expected**: Works via new runner or returns documented replacement.
   - **Covers**: User compatibility.

3. `test_should_have_no_duplicate_suite_assertion_source_of_truth`
   - **Input**: Repository metadata files.
   - **Expected**: Assertion modules are authoritative; legacy files are absent or marked transitional.
   - **Covers**: Cleanup acceptance criteria.

## Phase 10: Current Child Issue and PR Alignment - Test Guide

**Existing Tests to Modify:**

- None required unless issue-alignment metadata is stored in-repo.

**New Tests to Create:**

1. `test_should_track_child_issue_alignment_notes_if_metadata_is_committed`
   - **Input**: Optional migration issue metadata/doc.
   - **Expected**: Listed child issues have architecture-aligned target area.
   - **Covers**: Coordination checklist.

**Test Implementation Notes:**

- Prefer documentation/checklist review over product-code tests for this phase.
- Do not require GitHub API access in unit tests.

## Phase 11: Clean the House - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-metadata-final-hygiene.test.ts`
  - Assert obsolete resolver/YAML suite composition is gone from active paths.
- `test/e2e/scenario-framework-tests/e2e-convention-lint.test.ts`
  - Keep blocking new legacy top-level E2E shell entrypoints.

**New Tests to Create:**

1. `test_should_document_hybrid_architecture_as_default`
   - **Input**: `test/e2e/docs/README.md`, `MIGRATION.md`, and relevant agent docs.
   - **Expected**: Docs state YAML is setup/onboarding state, scenarios are builders, assertions are phase-owned modules.
   - **Covers**: Documentation acceptance criteria.

2. `test_should_pass_final_plan_only_sweep_for_all_current_ids`
   - **Input**: Registry IDs through plan-only compiler.
   - **Expected**: Every current scenario ID produces a plan or documented replacement.
   - **Covers**: Final migration confidence.

3. `test_should_have_no_unresolved_migration_todos`
   - **Input**: New scenario framework files and docs.
   - **Expected**: No migration TODO remains except explicit tracked follow-ups.
   - **Covers**: Cleanup completeness.

## Validation Commands

Use targeted commands during implementation phases:

```bash
npm test -- --project cli test/e2e/scenario-framework-tests
npx tsx test/e2e/scenarios/run.ts --list
npx tsx test/e2e/scenarios/run.ts --scenarios ubuntu-repo-cloud-openclaw --plan-only
bash test/e2e/runtime/run-scenario.sh ubuntu-repo-cloud-openclaw --plan-only
```

Before final completion, run the broader checks requested by the spec when feasible:

```bash
npm test
npx prek run --all-files
```
