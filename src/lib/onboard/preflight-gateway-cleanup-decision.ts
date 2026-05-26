// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { GatewayReuseState } from "../state/gateway";

export type PreflightGatewayCleanupAction = "defer" | "destroy-legacy" | "noop";

export function preflightGatewayCleanupDecision(opts: {
  gatewayReuseState: GatewayReuseState;
  isDockerDriverGatewayEnabled: boolean;
}): PreflightGatewayCleanupAction {
  if (opts.gatewayReuseState !== "stale" && opts.gatewayReuseState !== "active-unnamed") {
    return "noop";
  }
  return opts.isDockerDriverGatewayEnabled ? "defer" : "destroy-legacy";
}
