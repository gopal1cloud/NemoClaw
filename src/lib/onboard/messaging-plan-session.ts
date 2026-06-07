// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { SandboxMessagingPlan } from "../messaging/manifest";

export function parseSandboxMessagingPlan(value: unknown): SandboxMessagingPlan | null {
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    typeof value.sandboxName !== "string" ||
    typeof value.agent !== "string" ||
    typeof value.workflow !== "string" ||
    !Array.isArray(value.channels) ||
    !Array.isArray(value.disabledChannels) ||
    !Array.isArray(value.credentialBindings) ||
    !isObject(value.networkPolicy) ||
    !Array.isArray(value.agentRender) ||
    !Array.isArray(value.buildSteps) ||
    !Array.isArray(value.stateUpdates) ||
    !Array.isArray(value.healthChecks)
  ) {
    return null;
  }
  return value as unknown as SandboxMessagingPlan;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
