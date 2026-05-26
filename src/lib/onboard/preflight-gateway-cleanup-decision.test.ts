// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { preflightGatewayCleanupDecision } from "./preflight-gateway-cleanup-decision";

describe("preflightGatewayCleanupDecision (#4235)", () => {
  it("defers destructive recreation when state is stale and Docker-driver gateway is enabled", () => {
    expect(
      preflightGatewayCleanupDecision({
        gatewayReuseState: "stale",
        isDockerDriverGatewayEnabled: true,
      }),
    ).toBe("defer");
  });

  it("defers destructive recreation when state is active-unnamed and Docker-driver gateway is enabled", () => {
    expect(
      preflightGatewayCleanupDecision({
        gatewayReuseState: "active-unnamed",
        isDockerDriverGatewayEnabled: true,
      }),
    ).toBe("defer");
  });

  it("destroys legacy gateway in preflight when Docker-driver gateway is not enabled", () => {
    expect(
      preflightGatewayCleanupDecision({
        gatewayReuseState: "stale",
        isDockerDriverGatewayEnabled: false,
      }),
    ).toBe("destroy-legacy");
    expect(
      preflightGatewayCleanupDecision({
        gatewayReuseState: "active-unnamed",
        isDockerDriverGatewayEnabled: false,
      }),
    ).toBe("destroy-legacy");
  });

  it("returns noop for non-stale states regardless of driver", () => {
    for (const state of ["healthy", "missing", "foreign-active"] as const) {
      expect(
        preflightGatewayCleanupDecision({
          gatewayReuseState: state,
          isDockerDriverGatewayEnabled: true,
        }),
      ).toBe("noop");
      expect(
        preflightGatewayCleanupDecision({
          gatewayReuseState: state,
          isDockerDriverGatewayEnabled: false,
        }),
      ).toBe("noop");
    }
  });
});
