// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Unit tests for the expected-failure schema, resolver merge, and matcher.
 *
 * Companion to NemoClaw issue #3608. The scenario-additional-families
 * suite covers the end-to-end plan shape; this file focuses on the new
 * code paths in isolation so failures point at a single layer.
 */

import { describe, it, expect } from "vitest";
import { compileRunPlans } from "../scenarios/compiler.ts";
import {
  EXPECTED_FAILURE_ERROR_CLASSES,
  EXPECTED_FAILURE_PHASES,
  EXPECTED_FAILURE_SIDE_EFFECTS,
  matchExpectedFailure,
  type ExpectedFailure,
  type ObservedFailure,
} from "../runtime/resolver/expected-failure.ts";

function validateExpectedFailure(block: Record<string, unknown>, partial = false): Partial<ExpectedFailure> {
  const allowed = new Set(["phase", "error_class", "message_pattern", "forbidden_side_effects"]);
  for (const key of Object.keys(block)) {
    if (!allowed.has(key)) throw new Error(`unknown key '${key}'`);
  }
  if (block.phase !== undefined && !EXPECTED_FAILURE_PHASES.includes(block.phase as never)) throw new Error("expected_failure.phase");
  if (block.error_class !== undefined && !EXPECTED_FAILURE_ERROR_CLASSES.includes(block.error_class as never)) throw new Error("expected_failure.error_class");
  if (!partial && block.phase === undefined) throw new Error("phase is required");
  if (!partial && block.error_class === undefined) throw new Error("error_class is required");
  if (typeof block.message_pattern === "string") new RegExp(block.message_pattern.replace(/^\(\?i\)/, ""));
  if (block.forbidden_side_effects !== undefined) {
    if (!Array.isArray(block.forbidden_side_effects)) throw new Error("forbidden_side_effects");
    for (const entry of block.forbidden_side_effects) {
      if (!EXPECTED_FAILURE_SIDE_EFFECTS.includes(entry as never)) throw new Error("forbidden_side_effects entry");
    }
  }
  return block as Partial<ExpectedFailure>;
}

describe("expected_failure: validation", () => {
  it("accepts a complete block", () => {
    const block = validateExpectedFailure({
      phase: "preflight",
      error_class: "docker-missing",
      message_pattern: "docker",
      forbidden_side_effects: ["sandbox-created"],
    });
    expect(block.phase).toBe("preflight");
    expect(block.error_class).toBe("docker-missing");
  });

  it("rejects unknown phase", () => {
    expect(() => validateExpectedFailure({ phase: "bogus", error_class: "docker-missing" })).toThrow(/expected_failure\.phase/);
  });

  it("rejects unknown error_class", () => {
    expect(() => validateExpectedFailure({ phase: "preflight", error_class: "moon-missing" })).toThrow(/expected_failure\.error_class/);
  });

  it("rejects invalid message_pattern regex", () => {
    expect(() => validateExpectedFailure({ phase: "preflight", error_class: "docker-missing", message_pattern: "(unclosed" })).toThrow();
  });

  it("rejects unknown forbidden_side_effects entry", () => {
    expect(() => validateExpectedFailure({ phase: "preflight", error_class: "docker-missing", forbidden_side_effects: ["paint-the-fence"] })).toThrow(/forbidden_side_effects entry/);
  });

  it("rejects unknown keys in the block", () => {
    expect(() => validateExpectedFailure({ phase: "preflight", error_class: "docker-missing", rogue: true })).toThrow(/unknown key 'rogue'/);
  });

  it("requires phase + error_class", () => {
    expect(() => validateExpectedFailure({ phase: "preflight" })).toThrow(/error_class is required/);
  });

  it("allows partial override blocks", () => {
    expect(validateExpectedFailure({ message_pattern: "(?i)daemon", forbidden_side_effects: ["gateway-started"] }, true)).toMatchObject({
      message_pattern: "(?i)daemon",
      forbidden_side_effects: ["gateway-started"],
    });
  });
});

describe("expected_failure: matcher", () => {
  const expected: ExpectedFailure = {
    phase: "preflight",
    error_class: "docker-missing",
    message_pattern: "(?i)docker|daemon",
    forbidden_side_effects: ["sandbox-created", "gateway-started"],
  };

  function obs(over: Partial<ObservedFailure>): ObservedFailure {
    return {
      phase: "preflight",
      error_class: "docker-missing",
      log: "Cannot connect to the Docker daemon",
      observed_side_effects: [],
      ...over,
    };
  }

  it("passes when phase, class, pattern, and side-effects all match", () => {
    const report = matchExpectedFailure(expected, obs({}));
    expect(report.ok).toBe(true);
    expect(report.checks.every((c) => c.ok)).toBe(true);
  });

  it("fails on phase mismatch", () => {
    const report = matchExpectedFailure(expected, obs({ phase: "install" }));
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === "phase")?.ok).toBe(false);
  });

  it("fails on error_class mismatch", () => {
    const report = matchExpectedFailure(expected, obs({ error_class: "gpu-missing" }));
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === "error_class")?.ok).toBe(false);
  });

  it("skips error_class check when observation is undefined", () => {
    const report = matchExpectedFailure(expected, obs({ error_class: undefined }));
    const classCheck = report.checks.find((c) => c.name === "error_class");
    expect(classCheck?.ok).toBe(true);
    expect(classCheck?.message).toMatch(/skipped/);
  });

  it("fails when message_pattern does not match the log", () => {
    const report = matchExpectedFailure(
      expected,
      obs({ log: "something else entirely" }),
    );
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === "message_pattern")?.ok).toBe(false);
  });

  it("fails when a forbidden side effect is observed", () => {
    const report = matchExpectedFailure(
      expected,
      obs({ observed_side_effects: ["sandbox-created"] }),
    );
    expect(report.ok).toBe(false);
    const sideCheck = report.checks.find((c) => c.name === "forbidden_side_effects");
    expect(sideCheck?.ok).toBe(false);
    expect(sideCheck?.message).toMatch(/sandbox-created/);
  });

  it("ignores non-forbidden observed side effects", () => {
    const trimmed: ExpectedFailure = {
      ...expected,
      forbidden_side_effects: ["gateway-started"],
    };
    const report = matchExpectedFailure(
      trimmed,
      obs({ observed_side_effects: ["sandbox-created"] }),
    );
    expect(report.ok).toBe(true);
  });
});

describe("expected_failure: typed scenario metadata", () => {
  it("loads structurally for ubuntu-no-docker-preflight-negative", () => {
    const [plan] = compileRunPlans(["ubuntu-no-docker-preflight-negative"]);
    expect(plan.expectedFailure).toBeTruthy();
    expect(plan.expectedFailure?.forbiddenSideEffects).toContain("sandbox-created");
  });
});
