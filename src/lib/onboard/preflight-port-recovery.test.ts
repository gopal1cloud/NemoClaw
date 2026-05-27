// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import { recoverPreflightDashboardPort } from "../../../dist/lib/onboard/preflight-port-recovery";

describe("recoverPreflightDashboardPort", () => {
  it("reclaims a tracked gRPC dashboard bridge when gateway metadata is stale", async () => {
    const log = vi.fn();
    const checkPortAvailable = vi.fn(async () => ({ ok: true }));
    const stopTrackedGrpcForwardBridgeForPort = vi.fn(() => ({
      sandboxName: "old-sandbox",
      bind: "127.0.0.1",
      port: 18789,
      targetHost: "127.0.0.1",
      targetPort: 4000,
      pid: 4242,
      startedAt: "2026-05-27T00:00:00.000Z",
    }));

    const result = await recoverPreflightDashboardPort({
      port: 18789,
      label: "NemoClaw dashboard",
      gatewayReuseState: "stale",
      portCheck: { ok: false, process: "node", pid: 4242 },
      checkPortAvailable,
      captureProcessArgs: vi.fn(),
      run: vi.fn(),
      stopTrackedGrpcForwardBridgeForPort,
      log,
    });

    expect(result.ok).toBe(true);
    expect(stopTrackedGrpcForwardBridgeForPort).toHaveBeenCalledWith(18789, { pid: 4242 });
    expect(log).toHaveBeenCalledWith(
      "  Cleaning up stale gRPC dashboard bridge on port 18789 for sandbox 'old-sandbox'...",
    );
  });

  it("preserves the existing orphaned SSH forward cleanup behavior", async () => {
    const run = vi.fn();
    const sleep = vi.fn();
    const checkPortAvailable = vi.fn(async () => ({ ok: true }));

    const result = await recoverPreflightDashboardPort({
      port: 18789,
      label: "NemoClaw dashboard",
      gatewayReuseState: "healthy",
      portCheck: { ok: false, process: "ssh", pid: 1234 },
      checkPortAvailable,
      captureProcessArgs: vi.fn(() => "ssh -L 18789:localhost:4000 openshell"),
      run,
      sleep,
    });

    expect(result.ok).toBe(true);
    expect(run).toHaveBeenCalledWith(["kill", "1234"], { ignoreError: true });
    expect(sleep).toHaveBeenCalledWith(1);
  });
});
