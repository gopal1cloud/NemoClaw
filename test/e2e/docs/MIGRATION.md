<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Hybrid Scenario E2E Migration Tracker

The hybrid typed architecture is the runtime source of truth for scenario-based
E2E. Typed scenario builders are deterministic code builders; product-facing
`NemoClawInstance` manifests describe setup/onboarding desired state; assertions
are phase-owned modules that define environment, onboarding, and runtime checks.

YAML describes setup/onboarding desired state or historical reference data; YAML
is not a scenario definition source of truth. Live scenario selection, assertion
composition, suite selection, coverage reporting, and workflow dispatch all use
the typed registry and compiler.

## Current Runtime Sources

| Layer | Runtime source | Notes |
|---|---|---|
| Scenario IDs | `test/e2e/scenarios/registry.ts` + `scenarios/baseline.ts` | Canonical IDs targeted by workflows and E2E advisor paths. |
| Manifests | `test/e2e/manifests/*.yaml` | Product-facing setup/onboarding state only; no assertion or suite metadata. |
| Assertions | `test/e2e/scenarios/assertions/*.ts` | Phase-owned modules with stable step IDs, evidence paths, timeout/retry policy. |
| Plans | `test/e2e/scenarios/compiler.ts` | Emits `.e2e/run-plan.json` and `.e2e/plan.txt`. |
| Coverage | `test/e2e/runtime/resolver/coverage.ts` | Reads typed registry/manifests/assertion modules. |
| Runtime entrypoint | `test/e2e/scenarios/run.ts` | `test/e2e/runtime/run-scenario.sh` is a retired fail-fast shim. |

## Coverage Status

Generate the current authoritative report with:

```bash
bash test/e2e/runtime/coverage-report.sh
```

The report tracks scenario IDs, manifests, environment/onboarding families,
assertion groups, phase coverage, runner requirements, required secrets, skipped
capabilities, and expected failures.

## Canonical Scenario Tracker

| Scenario ID | Manifest | Phase coverage | Status |
|---|---|---|---|
| `brev-launchable-cloud-openclaw` | `openclaw-nvidia-brev-launchable.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `gpu-repo-local-ollama-openclaw` | `openclaw-ollama-gpu.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `macos-repo-cloud-openclaw` | `openclaw-nvidia-macos.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-no-docker-preflight-negative` | `openclaw-nvidia-no-docker-negative.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-hermes` | `hermes-nvidia.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-hermes-discord` | `hermes-nvidia-discord.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-hermes-slack` | `hermes-nvidia-slack.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-openclaw` | `openclaw-nvidia.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-openclaw-brave` | `openclaw-nvidia-brave.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-openclaw-discord` | `openclaw-nvidia-discord.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-openclaw-double-provider-switch` | `openclaw-nvidia-double-provider-switch.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-openclaw-double-same-provider` | `openclaw-nvidia-double-same-provider.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-openclaw-repair` | `openclaw-nvidia-repair.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-openclaw-resume` | `openclaw-nvidia-resume.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-openclaw-slack` | `openclaw-nvidia-slack.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-openclaw-telegram` | `openclaw-nvidia-telegram.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-cloud-openclaw-token-rotation` | `openclaw-nvidia-token-rotation.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `ubuntu-repo-openai-compatible-openclaw` | `openclaw-openai-compatible.yaml` | environment, onboarding, runtime | ✅ typed runtime |
| `wsl-repo-cloud-openclaw` | `openclaw-nvidia-wsl.yaml` | environment, onboarding, runtime | ✅ typed runtime |

## Metadata Disposition

| Asset | Status | Runtime role |
|---|---|---|
| `test/e2e/nemoclaw_scenarios/scenarios.yaml` | Non-runtime marker file | None. |
| `test/e2e/nemoclaw_scenarios/expected-states.yaml` | Historical expected-state contract reference | None for scenario selection/composition. |
| `test/e2e/validation_suites/suites.yaml` | Historical suite reference consumed only by compatibility helper/tests | Not authoritative for typed runtime. |

## Assertion Domain Tracker

| Domain | Representative groups | Status |
|---|---|---|
| Environment | `environment.baseline` | ✅ covered |
| Onboarding | `onboarding.base-installed`, `onboarding.preflight-passed`, `onboarding.preflight-expected-failed` | ✅ covered |
| Smoke/runtime | `suite.smoke`, `suite.gateway-health`, `suite.sandbox-shell` | ✅ covered |
| Inference | `suite.inference`, `suite.local-ollama-inference`, `suite.openai-compatible-inference`, `suite.kimi-compatibility` | ✅ covered |
| Security | `suite.credentials`, `suite.security-policy`, `suite.security-shields`, `suite.security-injection` | ✅ covered |
| Messaging | `suite.messaging-telegram`, `suite.messaging-discord`, `suite.messaging-slack`, `suite.messaging-token-rotation` | ✅ covered |
| Lifecycle | `suite.sandbox-lifecycle`, `suite.rebuild`, `suite.upgrade`, `suite.snapshot` | ✅ covered |
| Platform | `suite.platform-macos`, `suite.platform-wsl` | ✅ covered |
| Negative | `runtime.expected-failure.no-side-effects` | ✅ covered |
