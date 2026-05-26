<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Current E2E Reliability Inventory

Generated: 2026-05-26

This inventory maps the current E2E suite to the lightweight reliability treatment needed during migration to the hybrid scenario architecture. It is practical rather than exhaustive: each current test is classified at a high level so assertion-step conversion can preserve existing timeout/retry behavior without blindly retrying deterministic checks.

## Classification values

| Classification | Meaning |
|---|---|
| `deterministic-no-retry` | Pure config/schema/file/content behavior. Should fail fast. |
| `bounded-timeout-only` | Operation can hang or be slow, but retrying would not add signal. |
| `retryable-transient` | Operation crosses readiness, network, provider, model, Docker, SSH, or remote service boundaries. Retry only on named classifiers. |
| `expected-failure` | Negative/regression scenario where the intended result is a specific failure. |
| `external-skip-classified` | Requires a capability, secret, external service, or host feature that may be unavailable. Skip must be explicit and classified. |
| `needs-manual-classification` | Existing behavior is unclear enough that conversion should not proceed without inspection. |

## Current shell E2E tests

| Test | Main step-level needs | Classification | Existing knobs/helpers |
|---|---|---|---|
| `test/e2e/test-brave-search-e2e.sh` | Secret gate external-skip; install/onboard readiness retry; Brave API call transient; config assertions deterministic. | `retryable-transient` + `external-skip-classified` | `NEMOCLAW_E2E_DEFAULT_TIMEOUT`, `run_with_timeout`, skip handling |
| `test/e2e/test-channels-stop-start.sh` | Onboard/bridge lifecycle readiness transient; live channel removal may depend on provider/secrets. | `retryable-transient` + `external-skip-classified` | shared timeout/helper, provider env gates |
| `test/e2e/test-cloud-inference-e2e.sh` | Install bounded; chat completions transient; skill FS deterministic; missing migrated skills skip. | `retryable-transient` | `E2E_PHASE_5B_MAX_ATTEMPTS`, `E2E_PHASE_5B_RETRY_SLEEP_SEC`, per-command 120s timeout |
| `test/e2e/test-cloud-onboard-e2e.sh` | Public installer/network transient; check scripts mostly deterministic; cleanup skip classified. | `retryable-transient` + `external-skip-classified` | workflow timeout, skips interactive/no checks/cleanup |
| `test/e2e/test-credential-migration.sh` | Filesystem/storage checks deterministic after install; install bounded. | `bounded-timeout-only` | `NEMOCLAW_E2E_DEFAULT_TIMEOUT=2400` |
| `test/e2e/test-credential-sanitization.sh` | Security negative/content checks deterministic; sandbox install bounded. | `bounded-timeout-only` | ad hoc `timeout`, skip counters |
| `test/e2e/test-dashboard-remote-bind.sh` | Remote host/bind depends on environment; assertions deterministic once host set. | `needs-manual-classification` | `NEMOCLAW_E2E_REMOTE_HOST` |
| `test/e2e/test-device-auth-health.sh` | Device-auth HTTP readiness transient; assertions deterministic. | `retryable-transient` | `NEMOCLAW_E2E_DEFAULT_TIMEOUT`, attempts/sleep |
| `test/e2e/test-diagnostics.sh` | Install bounded; diagnostics command deterministic; external API/network inputs possible. | `bounded-timeout-only` | `NEMOCLAW_E2E_TIMEOUT_SECONDS`, `NEMOCLAW_E2E_NO_TIMEOUT` |
| `test/e2e/test-docs-validation.sh` | CLI/doc parity deterministic; remote links external. | `deterministic-no-retry` + `external-skip-classified` | `CHECK_DOC_LINKS_REMOTE` |
| `test/e2e/test-double-onboard.sh` | Sandbox/gateway readiness and probes transient; reuse assertions deterministic. | `retryable-transient` | `NEMOCLAW_E2E_PHASE_TIMEOUT`, probe attempts/delay/timeouts |
| `test/e2e/test-full-e2e.sh` | Installer/onboard bounded; NVIDIA API/inference/agent reply transient/LLM nondeterministic. | `retryable-transient` | ad hoc retry/attempts, `timeout`/`gtimeout` |
| `test/e2e/test-gateway-drift-preflight.sh` | Fake gateway/preflight classification deterministic. | `deterministic-no-retry` | fake env inputs |
| `test/e2e/test-gateway-health-honest.sh` | Fake gateway health polling bounded; expected failure on broken product. | `expected-failure` | `NEMOCLAW_HEALTH_POLL_COUNT`, interval |
| `test/e2e/test-gpu-double-onboard.sh` | GPU/Ollama/proxy startup transient; hardware skip. | `retryable-transient` + `external-skip-classified` | shared timeout, attempts, GPU/provider env |
| `test/e2e/test-gpu-e2e.sh` | GPU/Ollama install/pull/inference transient; hardware skip. | `retryable-transient` + `external-skip-classified` | attempts/sleep, Ollama ports |
| `test/e2e/test-hermes-discord-e2e.sh` | Onboard/health transient; Discord live credential/API external; schema deterministic. | `retryable-transient` + `external-skip-classified` | `run_with_timeout`, attempts, skip |
| `test/e2e/test-hermes-e2e.sh` | Hermes onboard/health/inference transient; config deterministic. | `retryable-transient` | attempts/sleep, timeout |
| `test/e2e/test-hermes-inference-switch.sh` | Switch command bounded; inference/health transient. | `retryable-transient` | attempts/sleep |
| `test/e2e/test-hermes-slack-e2e.sh` | Slack API external skip; Hermes health transient; policy deterministic. | `retryable-transient` + `external-skip-classified` | health attempts, Slack timeout skip |
| `test/e2e/test-inference-routing.sh` | Positive cloud routes transient; invalid provider/transport negative expected. | `retryable-transient` + `expected-failure` | shared timeout/helper |
| `test/e2e/test-issue-2478-crash-loop-recovery.sh` | Soak/recovery polling transient; temporary regression guard. | `retryable-transient` | crash cycle/soak timeout envs |
| `test/e2e/test-kimi-inference-compat.sh` | Hermetic mock deterministic; sandbox route readiness transient. | `retryable-transient` | shared timeout/helper |
| `test/e2e/test-launchable-smoke.sh` | Launchable bootstrap/SSH/API transient; install artifacts deterministic. | `retryable-transient` | shared timeout/helper, retries |
| `test/e2e/test-messaging-compatible-endpoint.sh` | Mock endpoint deterministic; sandbox/onboard/SSH transient; live Telegram skip. | `retryable-transient` + `external-skip-classified` | `NEMOCLAW_E2E_DEFAULT_TIMEOUT=1800`, socket attempts, skips |
| `test/e2e/test-messaging-providers.sh` | Fake providers mostly deterministic; sandbox/onboard/bridge readiness transient; live credentials skip. | `retryable-transient` + `external-skip-classified` | timeout/attempts/skips |
| `test/e2e/test-model-router-provider-routed-inference.sh` | Regression guard expected red on main-equivalent HTTP 503; live route transient after fix. | `expected-failure` + `retryable-transient` | `TIMEOUT_CMD`, 1500s onboard |
| `test/e2e/test-network-policy.sh` | Network denial/allow assertions deterministic; sandbox readiness and live inference transient. | `retryable-transient` | shared timeout/helper |
| `test/e2e/test-ollama-auth-proxy-e2e.sh` | Real Ollama install/pull/inference transient; proxy auth deterministic. | `retryable-transient` | workflow timeout, ad hoc sleeps |
| `test/e2e/test-onboard-inference-smoke.sh` | Explicit expected RED before fix; local mock behavior deterministic. | `expected-failure` | `NEMOCLAW_ONBOARD_INFERENCE_SMOKE_E2E` |
| `test/e2e/test-onboard-repair.sh` | Resume/repair state deterministic; sandbox create/delete bounded. | `bounded-timeout-only` | sandbox deletion wait loop |
| `test/e2e/test-onboard-resume.sh` | Interrupted/resume state deterministic; install bounded. | `bounded-timeout-only` | shared timeout 600s |
| `test/e2e/test-openclaw-inference-switch.sh` | Switch/config deterministic; live inference transient. | `retryable-transient` | `run_with_timeout`, attempts |
| `test/e2e/test-openshell-gateway-upgrade.sh` | Upgrade/download/gateway survivor readiness transient; macOS fake path deterministic. | `retryable-transient` | wait loops, env-pinned versions |
| `test/e2e/test-openshell-version-pin.sh` | Fake OpenShell install/version guard deterministic expected fail on old code. | `expected-failure` | regression workflow timeout |
| `test/e2e/test-overlayfs-autofix.sh` | Host Docker feature external skip; positive bounded; negative timeout may skip if bug not reproduced. | `external-skip-classified` + `expected-failure` + `bounded-timeout-only` | shared timeout 1500s, `NEMOCLAW_OVERLAYFS_E2E_NEGATIVE_TIMEOUT` |
| `test/e2e/test-rebuild-hermes.sh` | Docker builds/rebuild readiness transient; marker/version checks deterministic. | `retryable-transient` | workflow timeout, ad hoc timeout |
| `test/e2e/test-rebuild-openclaw.sh` | Docker builds/rebuild readiness transient; marker/policy/credential checks deterministic. | `retryable-transient` | workflow timeout |
| `test/e2e/test-runtime-overrides.sh` | Container config patch assertions deterministic after image build. | `bounded-timeout-only` | workflow timeout |
| `test/e2e/test-sandbox-operations.sh` | Sandbox/gateway/SSH recovery transient; command assertions deterministic. | `retryable-transient` | shared timeout, `run_with_timeout`, job overrides |
| `test/e2e/test-sandbox-rebuild.sh` | Rebuild lifecycle bounded; marker/registry checks deterministic. | `bounded-timeout-only` | `NEMOCLAW_E2E_TIMEOUT_SECONDS` |
| `test/e2e/test-sandbox-survival.sh` | Gateway restart/SSH/inference transient; persistence deterministic. | `retryable-transient` | shared timeout, retries/attempts |
| `test/e2e/test-shields-config.sh` | Mutable/immutable/config assertions deterministic; auto-restore timer bounded. | `bounded-timeout-only` | shared timeout 900s |
| `test/e2e/test-skill-agent-e2e.sh` | LLM response nondeterministic; retry allowed; setup bounded. | `retryable-transient` | `E2E_SKILL_AGENT_MAX_ATTEMPTS`, sleep |
| `test/e2e/test-snapshot-commands.sh` | Snapshot create/list/restore deterministic after sandbox setup. | `bounded-timeout-only` | workflow timeout |
| `test/e2e/test-spark-install.sh` | Spark hardware/platform external; install bounded. | `external-skip-classified` | `NEMOCLAW_E2E_PUBLIC_INSTALL`, Spark-only |
| `test/e2e/test-state-backup-restore.sh` | Backup/restore deterministic; sandbox/SSH transient. | `retryable-transient` | shared timeout 3600s |
| `test/e2e/test-telegram-injection.sh` | Injection payload assertions deterministic; sandbox SSH bounded. | `bounded-timeout-only` | `timeout 90 ssh`, fake bridge path |
| `test/e2e/test-token-rotation.sh` | Rotation/rebuild detection deterministic; provider token env skip. | `external-skip-classified` + `bounded-timeout-only` | shared timeout 2400s, token skip gates |
| `test/e2e/test-tunnel-lifecycle.sh` | Cloudflared tunnel URL external/transient; status assertions deterministic. | `retryable-transient` | shared timeout 3600s |
| `test/e2e/test-upgrade-stale-sandbox.sh` | Docker build/rebuild transient; stale-version assertions deterministic. | `retryable-transient` | workflow timeout |

## Current TypeScript and scenario-framework tests

| Test | Main step-level needs | Classification | Existing knobs/helpers |
|---|---|---|---|
| `test/e2e/brev-e2e.test.ts` | Brev provisioning, SSH, launchable readiness, remote install/onboard all transient; cleanup bounded. | `retryable-transient` + `external-skip-classified` | `BREV_CREATE_TIMEOUT_SECONDS`, SSH wait/poll loops, provisioning retry, remote command timeouts |
| `test/e2e-advisor-dispatch.test.ts` | Pure planner logic. | `deterministic-no-retry` | none |
| `test/http-proxy-fix-e2e.test.ts` | Local HTTPS mock deterministic; local OpenSSL skip classified, CI must not skip. | `deterministic-no-retry` + `external-skip-classified` | `it.skipIf(!opensslAvailable)`, request timeout 5s |
| `test/validate-e2e-coverage.test.ts` | YAML/config validation. | `deterministic-no-retry` | none |
| `test/e2e/scenario-framework-tests/*.test.ts` | Resolver/schema/lint/parity/dry-run runner tests; mostly deterministic file/process checks. | `deterministic-no-retry` | `E2E_SPAWN_TIMEOUT_MS` in spawn-based tests |
| `test/e2e/scenario-framework-tests/e2e-expected-state-validator.test.ts` | Expected-state failure should skip suites. | `expected-failure` + `deterministic-no-retry` | `E2E_VALIDATE_EXPECTED_STATE`, probe override envs |
| `test/e2e/scenario-framework-tests/e2e-scenario-additional-families.test.ts` | Metadata includes platform skips and no-docker negative. | `external-skip-classified` + `expected-failure` | scenario `skipped_capabilities`, `expected_failure` |

## Migrated scenario/suite steps

| Step group | Step-level needs | Classification |
|---|---|---|
| `smoke/00-cli-available.sh`, `02-sandbox-listed.sh`, `03-sandbox-shell.sh` | CLI/list/shell deterministic once expected state says sandbox running; shell exec may need bounded timeout. | `deterministic-no-retry` / `bounded-timeout-only` |
| `smoke/01-gateway-health.sh`, `assert/gateway-alive.sh` | Gateway health HTTP can race startup; retry only during readiness window. | `retryable-transient` |
| `inference/cloud/00-models-health.sh` | External routed gateway model list; curl max time. | `retryable-transient` |
| `inference/cloud/01-chat-completion.sh` | Cloud LLM response; retry transient/5xx/empty only. | `retryable-transient` |
| `inference/cloud/02-inference-local-from-sandbox.sh` | Sandbox route/model list; route readiness transient. | `retryable-transient` |
| `inference/ollama-gpu/*` | Local Ollama model list/chat; GPU/Ollama daemon external. | `retryable-transient` + `external-skip-classified` |
| `inference/ollama-auth-proxy/00-proxy-reachable.sh` | Proxy live reachability proof. | `retryable-transient` |
| `platform/macos/00-macos-smoke.sh` | Platform smoke only; Docker-dependent suites intentionally skipped. | `external-skip-classified` |
| `onboarding_assertions/preflight/00-preflight-expected-failed.sh` | Negative preflight no-sandbox state. | `expected-failure` |
| `security/credentials/00-credentials-present.sh`, policy/credential asserts | Local state/content assertions. | `deterministic-no-retry` |

## Existing reliability mechanisms to preserve or migrate

| Area | Existing behavior |
|---|---|
| Shared shell timeout | `test/e2e/e2e-timeout.sh` self-wraps scripts with `timeout`/`gtimeout`; exports `run_with_timeout`; envs `NEMOCLAW_E2E_DEFAULT_TIMEOUT`, `NEMOCLAW_E2E_TIMEOUT_SECONDS`, `NEMOCLAW_E2E_NO_TIMEOUT`. |
| Workflow wall clocks | Nightly jobs mostly 30–60m; channels 120m; WSL 90m; branch validation 90m; regression guards 15–45m. |
| Teardown skip | `NEMOCLAW_E2E_KEEP_SANDBOX=1` skips sandbox destroy for debugging. |
| Brev E2E | `BREV_CREATE_TIMEOUT_SECONDS`, SSH wait/poll loops, provisioning retry/delete/recreate recovery, remote command timeouts. |
| Product-owned bounded operations | OAuth device-code polling/request timeout; WeChat QR bootstrap/poll timeouts; cluster image patch Docker inspect/pull/build timeouts; OpenShell probe/operation timeouts; blueprint inference profiles with `timeout_secs`; install script agent-forward restoration retries. |
| Product-owned retry-ish behavior | Messaging conflict detection retries after probe failure; WeChat QR poll treats transient transport/5xx as wait until deadline; Brev launchable script retries apt/download/install operations. |

## Migration guidance

- Do not retry deterministic assertions: config/file/security/schema/parity checks should fail fast with evidence.
- Retry readiness and external calls only on named classifiers: sandbox health, SSH, gateway health, Docker pulls/builds, Ollama, Brev, NVIDIA API, Slack/Discord/Telegram/Cloudflared, and LLM output checks.
- Model expected failures explicitly: no-Docker preflight, regression guards (`onboard-inference-smoke`, `model-router`, `openshell-version-pin`, `gateway-health-honest`), and overlayfs negative phase.
- Classify skips by capability: secrets, GPU, Spark, macOS Docker absence, provider API availability, and overlayfs host-feature non-reproduction should be first-class external skips, not silent passes.
- During conversion, a test should not be marked complete while any of its assertion steps remain `needs-manual-classification`.
