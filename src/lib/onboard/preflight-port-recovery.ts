// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { GatewayReuseState } from "../state/gateway";
import type { CheckPortOpts, PortProbeResult } from "./preflight";
import { DASHBOARD_PORT } from "../core/ports";
import { sleepSeconds } from "../core/wait";

import { stopTrackedGrpcForwardBridgeForPort } from "./forward-cleanup";

type CheckPortAvailable = (port?: number, opts?: CheckPortOpts) => Promise<PortProbeResult>;
type RunCommand = (args: string[], options: { ignoreError: true }) => unknown;

export interface RecoverPreflightDashboardPortOptions {
  port: number;
  label: string;
  gatewayReuseState: GatewayReuseState;
  portCheck: PortProbeResult;
  portCheckOptions?: CheckPortOpts;
  checkPortAvailable: CheckPortAvailable;
  captureProcessArgs: (pid: number) => string;
  run: RunCommand;
  stopTrackedGrpcForwardBridgeForPort?: typeof stopTrackedGrpcForwardBridgeForPort;
  log?: (message: string) => void;
  sleep?: (seconds: number) => void;
}

function canReclaimStaleGrpcBridge(gatewayReuseState: GatewayReuseState): boolean {
  return (
    gatewayReuseState === "stale" ||
    gatewayReuseState === "missing" ||
    gatewayReuseState === "active-unnamed"
  );
}

export async function recoverPreflightDashboardPort(
  options: RecoverPreflightDashboardPortOptions,
): Promise<PortProbeResult> {
  if (options.port !== DASHBOARD_PORT) return options.portCheck;

  const log = options.log ?? console.log;
  let portCheck = options.portCheck;
  if (canReclaimStaleGrpcBridge(options.gatewayReuseState)) {
    const stopBridge =
      options.stopTrackedGrpcForwardBridgeForPort ?? stopTrackedGrpcForwardBridgeForPort;
    const stoppedBridge = stopBridge(options.port, {
      pid: portCheck.pid,
    });
    if (stoppedBridge) {
      log(
        `  Cleaning up stale gRPC dashboard bridge on port ${options.port} for sandbox '${stoppedBridge.sandboxName}'...`,
      );
      portCheck = await options.checkPortAvailable(options.port, options.portCheckOptions);
      if (portCheck.ok) {
        log(`  ✓ Port ${options.port} available after stale gRPC bridge cleanup (${options.label})`);
        return portCheck;
      }
    }
  }

  if (portCheck.process === "ssh" && portCheck.pid) {
    const cmdline = options.captureProcessArgs(portCheck.pid);
    if (cmdline.includes("openshell")) {
      log(`  Cleaning up orphaned SSH port-forward on port ${options.port} (PID ${portCheck.pid})...`);
      options.run(["kill", String(portCheck.pid)], { ignoreError: true });
      (options.sleep ?? sleepSeconds)(1);
      portCheck = await options.checkPortAvailable(options.port, options.portCheckOptions);
      if (portCheck.ok) {
        log(`  ✓ Port ${options.port} available after orphaned forward cleanup (${options.label})`);
      }
    }
  }

  return portCheck;
}
