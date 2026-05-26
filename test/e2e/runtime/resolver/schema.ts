// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

export type AnyRecord = Record<string, unknown>;

export const EXPECTED_FAILURE_PHASES = [
  "preflight",
  "install",
  "onboard",
  "onboarding",
  "readiness",
  "suite",
] as const;
export type ExpectedFailurePhase = (typeof EXPECTED_FAILURE_PHASES)[number];

export const EXPECTED_FAILURE_ERROR_CLASSES = [
  "docker-missing",
  "credentials-missing",
  "gpu-missing",
  "unsupported-platform",
  "invalid-nvidia-api-key",
  "gateway-port-conflict",
] as const;
export type ExpectedFailureErrorClass = (typeof EXPECTED_FAILURE_ERROR_CLASSES)[number];

export const EXPECTED_FAILURE_SIDE_EFFECTS = [
  "sandbox-created",
  "gateway-started",
  "credentials-written",
] as const;
export type ExpectedFailureSideEffect = (typeof EXPECTED_FAILURE_SIDE_EFFECTS)[number];

export interface ExpectedFailure {
  phase: ExpectedFailurePhase;
  error_class: ExpectedFailureErrorClass;
  message_pattern?: string;
  forbidden_side_effects?: ExpectedFailureSideEffect[];
}

export interface DimensionRef {
  id: string;
  config: AnyRecord;
}

export interface ExpectedStateRef {
  id: string;
  config: AnyRecord;
}

export interface ResolvedSuite {
  id: string;
  requires_state?: Record<string, unknown>;
  steps?: Array<Record<string, unknown>>;
}

export interface ResolvedScenario {
  scenario_id: string;
  dimensions: {
    platform: DimensionRef;
    install: DimensionRef;
    runtime: DimensionRef;
    onboarding: DimensionRef;
  };
  expected_state: ExpectedStateRef;
  suites: ResolvedSuite[];
  runner_requirements?: string[];
  required_secrets?: string[];
  expected_failure?: ExpectedFailure;
}
