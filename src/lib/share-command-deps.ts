// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execTextSync } from "./adapters/openshell/grpc";
import { OPENSHELL_PROBE_TIMEOUT_MS } from "./adapters/openshell/timeouts";
import { CLI_NAME } from "./cli/branding";
import { G, R } from "./cli/terminal-style";

export interface ShareCommandDeps {
  /** Ensure the sandbox is live, exit process if not. */
  ensureLive: (sandboxName: string) => Promise<void>;
  /**
   * Check whether `remotePath` exists inside the sandbox via gRPC exec.
   * Returns true when the path exists; false when it is missing, when the
   * sandbox is unreachable, or when the exec itself fails.
   */
  checkSandboxPathExists: (sandboxName: string, remotePath: string) => boolean;
  /** NVIDIA-green ANSI code (empty string if color disabled). */
  colorGreen: string;
  /** ANSI reset code (empty string if color disabled). */
  colorReset: string;
  /** CLI executable name for user-facing messages (supports alias launchers). */
  cliName: string;
}

export function buildShareCommandDeps(): ShareCommandDeps {
  const { ensureLiveSandboxOrExit } = require("./actions/sandbox/gateway-state") as {
    ensureLiveSandboxOrExit: (sandboxName: string) => Promise<unknown>;
  };

  return {
    ensureLive: async (sandboxName: string) => {
      await ensureLiveSandboxOrExit(sandboxName);
    },
    checkSandboxPathExists: (sandboxName: string, remotePath: string) => {
      try {
        const result = execTextSync(sandboxName, ["test", "-e", remotePath], {
          timeoutMs: OPENSHELL_PROBE_TIMEOUT_MS,
        });
        return result.status === 0;
      } catch {
        return false;
      }
    },
    colorGreen: G,
    colorReset: R,
    cliName: CLI_NAME,
  };
}
