// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const requireCache: Record<string, unknown> = require.cache as any;

// Regression: `nemoclaw share mount` once passed the sandbox name as a bare
// positional to the sandbox exec path, so the path probe always returned a
// non-zero exit code even when `/sandbox` existed. The gRPC transport keeps
// the sandbox identity out of the command argv entirely.
// See #3889 and #3954.
describe("buildShareCommandDeps().checkSandboxPathExists probe argv", () => {
  afterEach(() => {
    const grpcPath = require.resolve("../dist/lib/adapters/openshell/grpc");
    const shareDepsPath = require.resolve("../dist/lib/share-command-deps");
    delete require.cache[grpcPath];
    delete require.cache[shareDepsPath];
  });

  it("targets the sandbox name through the gRPC exec adapter", () => {
    const grpcPath = require.resolve("../dist/lib/adapters/openshell/grpc");
    const shareDepsPath = require.resolve("../dist/lib/share-command-deps");

    let recordedCall:
      | { sandboxName: string; argv: readonly string[]; opts: { timeoutMs?: number } }
      | undefined;
    requireCache[grpcPath] = {
      id: grpcPath,
      filename: grpcPath,
      loaded: true,
      exports: {
        execTextSync: (
          sandboxName: string,
          argv: readonly string[],
          opts: { timeoutMs?: number },
        ) => {
          recordedCall = { sandboxName, argv, opts };
          return { status: 0, stdout: "", stderr: "" };
        },
      },
    } as any;
    delete require.cache[shareDepsPath];

    const { buildShareCommandDeps } = require("../dist/lib/share-command-deps");
    const deps = buildShareCommandDeps();
    const exists = deps.checkSandboxPathExists("prachi-sbox", "/sandbox");

    expect(exists).toBe(true);
    expect(recordedCall?.sandboxName).toBe("prachi-sbox");
    expect(recordedCall?.argv).toEqual(["test", "-e", "/sandbox"]);
    expect(recordedCall?.opts.timeoutMs).toBeGreaterThan(0);
  });

  it("reports the path as missing when the probe exits non-zero", () => {
    const grpcPath = require.resolve("../dist/lib/adapters/openshell/grpc");
    const shareDepsPath = require.resolve("../dist/lib/share-command-deps");

    requireCache[grpcPath] = {
      id: grpcPath,
      filename: grpcPath,
      loaded: true,
      exports: {
        execTextSync: () => ({ status: 1, stdout: "", stderr: "" }),
      },
    } as any;
    delete require.cache[shareDepsPath];

    const { buildShareCommandDeps } = require("../dist/lib/share-command-deps");
    const deps = buildShareCommandDeps();
    expect(deps.checkSandboxPathExists("alpha", "/sandbox/missing")).toBe(false);
  });
});
