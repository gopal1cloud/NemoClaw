// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import {
  EXPECTED_FAILURE_ERROR_CLASSES,
  EXPECTED_FAILURE_PHASES,
  EXPECTED_FAILURE_SIDE_EFFECTS,
  type AnyRecord,
  type ExpectedFailure,
  type ExpectedFailureErrorClass,
  type ExpectedFailurePhase,
  type ExpectedFailureSideEffect,
} from "./schema.ts";

export interface ResolverInput {
  scenarios: AnyRecord;
  expectedStates: AnyRecord;
  suites: AnyRecord;
}

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireMapping(value: unknown, name: string): AnyRecord {
  if (!isRecord(value)) {
    throw new Error(`'${name}' must be a mapping`);
  }
  return value;
}

export function compileMessagePattern(pattern: string): RegExp {
  const inline = pattern.match(/^\(\?i\)(.*)$/s);
  return inline ? new RegExp(inline[1], "i") : new RegExp(pattern);
}

function validateExpectedFailure(block: unknown, context: string, partial = false): ExpectedFailure | Partial<ExpectedFailure> {
  const record = requireMapping(block, `${context}.expected_failure`);
  const allowed = new Set(["phase", "error_class", "message_pattern", "forbidden_side_effects"]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${context}.expected_failure unknown key '${key}'`);
  }

  const out: Partial<ExpectedFailure> = {};
  if (record.phase !== undefined) {
    if (!EXPECTED_FAILURE_PHASES.includes(record.phase as ExpectedFailurePhase)) {
      throw new Error(`${context}.expected_failure.phase must be one of ${EXPECTED_FAILURE_PHASES.join(", ")}`);
    }
    out.phase = record.phase as ExpectedFailurePhase;
  } else if (!partial) {
    throw new Error(`${context}.expected_failure.phase is required`);
  }

  if (record.error_class !== undefined) {
    if (!EXPECTED_FAILURE_ERROR_CLASSES.includes(record.error_class as ExpectedFailureErrorClass)) {
      throw new Error(`${context}.expected_failure.error_class must be one of ${EXPECTED_FAILURE_ERROR_CLASSES.join(", ")}`);
    }
    out.error_class = record.error_class as ExpectedFailureErrorClass;
  } else if (!partial) {
    throw new Error(`${context}.expected_failure.error_class is required`);
  }

  if (record.message_pattern !== undefined) {
    if (typeof record.message_pattern !== "string") {
      throw new Error(`${context}.expected_failure.message_pattern must be a string`);
    }
    try {
      compileMessagePattern(record.message_pattern);
    } catch (err) {
      throw new Error(`${context}.expected_failure.message_pattern is not a valid regex: ${(err as Error).message}`);
    }
    out.message_pattern = record.message_pattern;
  }

  if (record.forbidden_side_effects !== undefined) {
    if (!Array.isArray(record.forbidden_side_effects)) {
      throw new Error(`${context}.expected_failure.forbidden_side_effects must be a string array`);
    }
    out.forbidden_side_effects = record.forbidden_side_effects.map((entry) => {
      if (!EXPECTED_FAILURE_SIDE_EFFECTS.includes(entry as ExpectedFailureSideEffect)) {
        throw new Error(`${context}.expected_failure.forbidden_side_effects entry '${String(entry)}' is invalid`);
      }
      return entry as ExpectedFailureSideEffect;
    });
  }

  return out as ExpectedFailure;
}

function validateExpectedStates(doc: AnyRecord): void {
  const states = requireMapping(doc.expected_states, "expected_states");
  for (const [id, value] of Object.entries(states)) {
    const state = requireMapping(value, `expected_states.${id}`);
    if (state.expected_failure !== undefined) {
      validateExpectedFailure(state.expected_failure, `expected_states.${id}`);
    }
  }
}

function validateScenarioExpectedFailures(scenariosDoc: AnyRecord): void {
  const setup = isRecord(scenariosDoc.setup_scenarios) ? scenariosDoc.setup_scenarios : {};
  for (const [id, value] of Object.entries(setup)) {
    const scenario = requireMapping(value, `setup_scenarios.${id}`);
    if (scenario.expected_failure !== undefined) {
      validateExpectedFailure(scenario.expected_failure, `setup_scenarios.${id}`, true);
    }
  }
}

export function loadMetadataFromObjects(input: ResolverInput): ResolverInput {
  const scenarios = requireMapping(input.scenarios, "scenarios");
  const expectedStates = requireMapping(input.expectedStates, "expectedStates");
  const suites = requireMapping(input.suites, "suites");
  validateExpectedStates(expectedStates);
  validateScenarioExpectedFailures(scenarios);
  return { scenarios, expectedStates, suites };
}

function readYaml(filePath: string): AnyRecord {
  const doc = yaml.load(fs.readFileSync(filePath, "utf8"));
  return requireMapping(doc, filePath);
}

export function loadMetadataFromDir(root: string): ResolverInput {
  return loadMetadataFromObjects({
    scenarios: readYaml(path.join(root, "nemoclaw_scenarios", "scenarios.yaml")),
    expectedStates: readYaml(path.join(root, "nemoclaw_scenarios", "expected-states.yaml")),
    suites: readYaml(path.join(root, "validation_suites", "suites.yaml")),
  });
}

export function mergeExpectedFailure(
  stateBlock: unknown,
  scenarioBlock: unknown,
  context: string,
): ExpectedFailure | undefined {
  if (stateBlock === undefined) {
    if (scenarioBlock !== undefined) {
      throw new Error(`scenario declares expected_failure but expected_state '${context}' does not`);
    }
    return undefined;
  }
  const state = validateExpectedFailure(stateBlock, `expected_states.${context}`) as ExpectedFailure;
  const override = scenarioBlock === undefined ? {} : (validateExpectedFailure(scenarioBlock, `setup_scenarios.${context}`, true) as Partial<ExpectedFailure>);
  return { ...state, ...override };
}
