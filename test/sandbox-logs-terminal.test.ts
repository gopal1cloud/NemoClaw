// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { showSandboxLogsWithDeps } from "../dist/lib/actions/sandbox/logs.js";

describe("sandbox logs for terminal agents", () => {
  it("skips the OpenClaw gateway log source but keeps OpenShell audit logs", () => {
    const calls: string[] = [];
    let exitCode: number | null = null;

    try {
      showSandboxLogsWithDeps(
        "deepagents-code",
        { follow: false, lines: "20", since: null },
        {
          getSessionAgent: () =>
            ({
              runtime: { kind: "terminal" },
            }) as never,
          isDockerRuntimeDown: () => false,
          runOpenshell: (args) => {
            calls.push(args.join(" "));
            return {
              status: 0,
              stdout: args[0] === "logs" ? "openshell audit line\n" : "",
              stderr: "",
            };
          },
          writeStdout: () => undefined,
          exit: ((code: number): never => {
            exitCode = code;
            throw new Error("exit");
          }) as never,
        },
      );
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("exit");
    }

    expect(exitCode).toBe(0);
    expect(calls).toContain("settings set deepagents-code --key ocsf_json_enabled --value true");
    expect(calls).toContain("logs deepagents-code -n 20 --source all");
    expect(calls.some((call) => call.includes("/tmp/gateway.log"))).toBe(false);
  });
});
