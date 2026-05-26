<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# NemoClaw E2E

End-to-end scenarios use the hybrid typed architecture as the runtime source of truth:

```text
typed scenario builder → NemoClawInstance manifest → phase-owned assertion modules → run plan
```

- **Scenario builders** in `test/e2e/scenarios/` are deterministic code builders that define canonical scenario IDs, environment families, expected states, runner requirements, secrets, skipped capabilities, expected failures, and assertion composition.
- **Product manifests** in `test/e2e/manifests/*.yaml` describe setup and
  onboarding desired state as `NemoClawInstance` resources. Manifests do not
  contain assertion IDs, suite IDs, or raw secrets.
- **Assertion modules** in `test/e2e/scenarios/assertions/` own environment,
  onboarding, and runtime checks. Each group has stable step IDs, evidence paths,
  and optional timeout/retry policy.
- **YAML** is limited to setup/onboarding desired state or historical reference data; it is not a scenario definition source of truth.

## How to run

```bash
npx tsx test/e2e/scenarios/run.ts --list
npx tsx test/e2e/scenarios/run.ts --scenarios ubuntu-repo-cloud-openclaw --plan-only
npx tsx test/e2e/scenarios/run.ts --scenarios ubuntu-repo-cloud-openclaw --dry-run
bash test/e2e/runtime/coverage-report.sh
```

`test/e2e/runtime/run-scenario.sh` is retired and fails fast with a pointer to
`test/e2e/scenarios/run.ts`.

## Runtime artifacts

Set `E2E_CONTEXT_DIR=<path>` to control where artifacts are written. The typed
runner emits:

- `.e2e/run-plan.json`
- `.e2e/plan.txt`
- `.e2e/environment.result.json`
- `.e2e/onboarding.result.json`
- `.e2e/runtime.result.json`

## Where things live

```text
test/e2e/
  scenarios/                         # typed builders, registry, compiler, runner
    run.ts
    registry.ts
    compiler.ts
    scenarios/baseline.ts
    assertions/                      # phase-owned assertion groups
    orchestrators/                   # environment/onboarding/runtime execution
  manifests/                         # product-facing NemoClawInstance desired state
  runtime/
    coverage-report.sh               # typed coverage report wrapper
    resolver/coverage.ts             # registry/manifest/assertion-aware reporting
    run-scenario.sh                  # retired compatibility shim
  docs/
    README.md
    MIGRATION.md
```

## Adding a scenario

1. Add or reuse a `NemoClawInstance` manifest in `test/e2e/manifests/`.
2. Add a typed scenario definition in `test/e2e/scenarios/scenarios/` or extend
   `baseline.ts` while IDs remain canonical and stable.
3. Compose assertion groups from `test/e2e/scenarios/assertions/`.
4. Run `npx tsx test/e2e/scenarios/run.ts --scenarios <id> --plan-only`.
5. Run `bash test/e2e/runtime/coverage-report.sh` to confirm coverage.

New legacy-style `test/e2e/test-*.sh` entrypoints are blocked by convention lint; add scenario coverage through typed builders and assertion modules instead.
