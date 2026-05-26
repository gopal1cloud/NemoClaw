// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { scenario } from "../builder.ts";
import { environmentBaseline } from "../assertions/environment.ts";
import { onboardingBaseline } from "../assertions/onboarding.ts";
import { runtimeSmokeSkeleton } from "../assertions/runtime.ts";
import type { ScenarioDefinition } from "../types.ts";

export function ubuntuRepoCloudOpenClawScenario(): ScenarioDefinition {
  return scenario("ubuntu-repo-cloud-openclaw")
    .description("Phase 1 skeleton for the canonical Ubuntu repo + cloud OpenClaw scenario.")
    .manifest("test/e2e/manifests/openclaw-nvidia.yaml")
    .environment({ platform: "ubuntu-local", install: "repo-current", runtime: "docker-running" })
    .assertions([environmentBaseline(), onboardingBaseline(), runtimeSmokeSkeleton()])
    .build();
}
