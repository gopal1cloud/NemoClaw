// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { __grpcTestHooks, execBinaryStreamSync } from "./grpc";

function collect(events: unknown[]) {
  const stream = new EventEmitter() as EventEmitter & { cancel: () => void };
  stream.cancel = () => undefined;
  const result = __grpcTestHooks.collectExecStream(stream as any, "test exec", 0);
  queueMicrotask(() => {
    for (const event of events) stream.emit("data", event);
    stream.emit("end");
  });
  return result;
}

describe("OpenShell gRPC exec stream parsing", () => {
  it("parses keepCase exit_code events", async () => {
    await expect(
      collect([
        { stdout: { data: Buffer.from("ok\n") } },
        { exit: { exit_code: 0 } },
      ]),
    ).resolves.toMatchObject({
      status: 0,
      stdout: Buffer.from("ok\n"),
    });
  });

  it("parses camelCase exitCode events", async () => {
    await expect(
      collect([
        { stderr: { data: Buffer.from("boom\n") } },
        { exit: { exitCode: 42 } },
      ]),
    ).resolves.toMatchObject({
      status: 42,
      stderr: Buffer.from("boom\n"),
    });
  });

  it("keeps missing exit events non-successful so call sites must prove completion", async () => {
    await expect(collect([{ stdout: { data: Buffer.from("partial") } }])).resolves.toMatchObject({
      status: 1,
      stdout: Buffer.from("partial"),
    });
  });

  it("uses unary stdin for modest non-tty input so script uploads do not hang waiting for interactive EOF", () => {
    expect(__grpcTestHooks.shouldInlineExecInput(Buffer.alloc(1024), {})).toBe(true);
    expect(__grpcTestHooks.shouldInlineExecInput(Buffer.alloc(1024), { tty: true })).toBe(false);
    expect(__grpcTestHooks.shouldInlineExecInput(Buffer.alloc(16 * 1024 * 1024 + 1), {})).toBe(false);
  });

  it("preserves large sync-runner binary stdout without hitting spawnSync ENOBUFS", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-grpc-large-stdout-"));
    const oldEnv = {
      transport: process.env.NEMOCLAW_GRPC_TEST_TRANSPORT,
      legacy: process.env.NEMOCLAW_GRPC_TEST_LEGACY_FAKE_SSH,
      fakeSsh: process.env.NEMOCLAW_GRPC_TEST_FAKE_SSH_BIN,
    };
    try {
      const fakeSsh = path.join(fixture, "ssh");
      fs.writeFileSync(
        fakeSsh,
        `#!/usr/bin/env node
require("node:fs").writeSync(1, Buffer.alloc(2 * 1024 * 1024, 0x61));
process.exit(0);
`,
        { mode: 0o755 },
      );
      process.env.NEMOCLAW_GRPC_TEST_TRANSPORT = "1";
      process.env.NEMOCLAW_GRPC_TEST_LEGACY_FAKE_SSH = "1";
      process.env.NEMOCLAW_GRPC_TEST_FAKE_SSH_BIN = fakeSsh;

      const result = execBinaryStreamSync("alpha", ["cat", "/tmp/large"], { timeoutMs: 15_000 });
      expect(result.status).toBe(0);
      expect(result.stdout.length).toBe(2 * 1024 * 1024);
    } finally {
      if (oldEnv.transport === undefined) delete process.env.NEMOCLAW_GRPC_TEST_TRANSPORT;
      else process.env.NEMOCLAW_GRPC_TEST_TRANSPORT = oldEnv.transport;
      if (oldEnv.legacy === undefined) delete process.env.NEMOCLAW_GRPC_TEST_LEGACY_FAKE_SSH;
      else process.env.NEMOCLAW_GRPC_TEST_LEGACY_FAKE_SSH = oldEnv.legacy;
      if (oldEnv.fakeSsh === undefined) delete process.env.NEMOCLAW_GRPC_TEST_FAKE_SSH_BIN;
      else process.env.NEMOCLAW_GRPC_TEST_FAKE_SSH_BIN = oldEnv.fakeSsh;
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });
});
