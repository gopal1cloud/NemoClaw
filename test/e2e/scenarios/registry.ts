// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { ubuntuRepoCloudOpenClawScenario } from "./scenarios/baseline.ts";
import type { ScenarioDefinition } from "./types.ts";

const canonicalScenarios = [ubuntuRepoCloudOpenClawScenario()];

export function listScenarios(): ScenarioDefinition[] {
  return [...canonicalScenarios].sort((a, b) => a.id.localeCompare(b.id));
}

export function getScenario(id: string): ScenarioDefinition | undefined {
  return canonicalScenarios.find((scenario) => scenario.id === id);
}

export function requireScenarios(ids: string[]): ScenarioDefinition[] {
  const availableIds = listScenarios().map((scenario) => scenario.id);
  const scenarios = ids.map((id) => {
    const found = getScenario(id);
    if (!found) {
      throw new Error(`Unknown scenario '${id}'. Available scenarios: ${availableIds.join(", ")}`);
    }
    return found;
  });
  return scenarios;
}
