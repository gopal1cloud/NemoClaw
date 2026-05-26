// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/** Expected-failure matcher for typed negative E2E scenarios. */

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

export interface ObservedFailure {
  phase: ExpectedFailurePhase;
  error_class?: ExpectedFailureErrorClass;
  log: string;
  observed_side_effects: ExpectedFailureSideEffect[];
}

export interface ExpectedFailureCheck {
  name: "phase" | "error_class" | "message_pattern" | "forbidden_side_effects";
  ok: boolean;
  expected: string;
  actual: string;
  message?: string;
}

export interface ExpectedFailureReport {
  ok: boolean;
  expected: ExpectedFailure;
  observed: ObservedFailure;
  checks: ExpectedFailureCheck[];
}

function compileMessagePattern(pattern: string): RegExp {
  const inline = pattern.match(/^\(\?i\)(.*)$/s);
  return inline ? new RegExp(inline[1], "i") : new RegExp(pattern);
}

export function matchExpectedFailure(
  expected: ExpectedFailure,
  observed: ObservedFailure,
): ExpectedFailureReport {
  const checks: ExpectedFailureCheck[] = [];

  const phaseOk = expected.phase === observed.phase;
  checks.push({
    name: "phase",
    ok: phaseOk,
    expected: expected.phase,
    actual: observed.phase,
    message: phaseOk ? undefined : `phase mismatch: expected '${expected.phase}' but observed '${observed.phase}'`,
  });

  if (observed.error_class !== undefined) {
    const classOk = expected.error_class === observed.error_class;
    checks.push({
      name: "error_class",
      ok: classOk,
      expected: expected.error_class,
      actual: observed.error_class,
      message: classOk ? undefined : `error_class mismatch: expected '${expected.error_class}' but observed '${observed.error_class}'`,
    });
  } else {
    checks.push({
      name: "error_class",
      ok: true,
      expected: expected.error_class,
      actual: "<unobserved>",
      message: "skipped: runner did not derive a structured error_class",
    });
  }

  if (expected.message_pattern) {
    let regex: RegExp;
    try {
      regex = compileMessagePattern(expected.message_pattern);
    } catch (err) {
      checks.push({
        name: "message_pattern",
        ok: false,
        expected: expected.message_pattern,
        actual: "<invalid regex>",
        message: `message_pattern is not a valid regex: ${(err as Error).message}`,
      });
      return finalize(expected, observed, checks);
    }
    const ok = regex.test(observed.log);
    checks.push({
      name: "message_pattern",
      ok,
      expected: expected.message_pattern,
      actual: ok ? "<match>" : "<no match>",
      message: ok ? undefined : `message_pattern '${expected.message_pattern}' did not match captured log`,
    });
  }

  if (expected.forbidden_side_effects?.length) {
    const observedSet = new Set(observed.observed_side_effects);
    const found = expected.forbidden_side_effects.filter((effect) => observedSet.has(effect));
    const ok = found.length === 0;
    checks.push({
      name: "forbidden_side_effects",
      ok,
      expected: expected.forbidden_side_effects.join(","),
      actual: observed.observed_side_effects.join(",") || "<none>",
      message: ok ? undefined : `forbidden side effects observed after failure: ${found.join(", ")}`,
    });
  }

  return finalize(expected, observed, checks);
}

function finalize(
  expected: ExpectedFailure,
  observed: ObservedFailure,
  checks: ExpectedFailureCheck[],
): ExpectedFailureReport {
  return { ok: checks.every((check) => check.ok), expected, observed, checks };
}

export function formatExpectedFailureReport(report: ExpectedFailureReport): string {
  const lines: string[] = [];
  lines.push(`expected-failure: ${report.ok ? "OK" : "FAILED"}`);
  for (const check of report.checks) {
    const status = check.ok ? "PASS" : "FAIL";
    lines.push(`  ${status} ${check.name} expected=${check.expected} actual=${check.actual}`);
    if (check.message) lines.push(`       ${check.message}`);
  }
  return lines.join("\n");
}
