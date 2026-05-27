// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../adapters/openshell/client.js", () => ({
  parseVersionFromText: (value = "") => {
    const match = String(value).match(/([0-9]+\.[0-9]+\.[0-9]+)/);
    return match ? match[1] : null;
  },
  versionGte: (left = "0.0.0", right = "0.0.0") => {
    const lhs = String(left).split(".").map((p) => parseInt(p, 10) || 0);
    const rhs = String(right).split(".").map((p) => parseInt(p, 10) || 0);
    const length = Math.max(lhs.length, rhs.length);
    for (let i = 0; i < length; i++) {
      const a = lhs[i] || 0;
      const b = rhs[i] || 0;
      if (a > b) return true;
      if (a < b) return false;
    }
    return true;
  },
}));

vi.mock("../adapters/openshell/grpc.js", () => ({
  execTextSync: vi.fn(),
}));

vi.mock("../agent/defs.js", () => ({
  loadAgent: vi.fn((name: string) => ({
    name,
    displayName: name === "openclaw" ? "OpenClaw" : "Hermes Agent",
    versionCommand: name === "openclaw" ? "openclaw --version" : "hermes --version",
    expectedVersion: name === "openclaw" ? "2026.5.22" : "2026.5.16",
    stateDirs: [],
    configPaths: { dir: "/sandbox/.openclaw" },
  })),
}));

import { execTextSync } from "../adapters/openshell/grpc.js";
import { OPENSHELL_PROBE_TIMEOUT_MS } from "../adapters/openshell/timeouts.js";
import * as registry from "../state/registry.js";
import { checkAgentVersion, formatStalenessWarning } from "./version.js";

describe("checkAgentVersion", () => {
  let tmpDir: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sandbox-ver-test-"));
    process.env.HOME = tmpDir;
    mkdirSync(join(tmpDir, ".nemoclaw"), { recursive: true });
    writeFileSync(
      join(tmpDir, ".nemoclaw", "sandboxes.json"),
      JSON.stringify({ sandboxes: {}, defaultSandbox: null }),
    );
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("fast path: uses cached agentVersion from registry", () => {
    registry.registerSandbox({
      name: "test-sb",
      agent: null,
      agentVersion: "2026.5.22",
    });

    const result = checkAgentVersion("test-sb");
    expect(result.detectionMethod).toBe("registry");
    expect(result.sandboxVersion).toBe("2026.5.22");
    expect(result.isStale).toBe(false);
  });

  it("fast path: detects stale version from registry", () => {
    registry.registerSandbox({
      name: "test-sb",
      agent: null,
      agentVersion: "2026.3.11",
    });

    const result = checkAgentVersion("test-sb");
    expect(result.detectionMethod).toBe("registry");
    expect(result.sandboxVersion).toBe("2026.3.11");
    expect(result.isStale).toBe(true);
  });

  it("fast path: same version is not stale", () => {
    registry.registerSandbox({
      name: "test-sb",
      agent: null,
      agentVersion: "2026.5.22",
    });

    const result = checkAgentVersion("test-sb");
    expect(result.isStale).toBe(false);
  });

  it("slow path: probes via gRPC when no cached version", () => {
    registry.registerSandbox({ name: "test-sb", agent: null });

    vi.mocked(execTextSync).mockReturnValue({
      status: 0,
      stdout: "OpenClaw 2026.5.22 (abc123)\n",
      stderr: "",
    });

    const result = checkAgentVersion("test-sb");
    expect(result.detectionMethod).toBe("grpc-exec");
    expect(result.sandboxVersion).toBe("2026.5.22");
    expect(result.isStale).toBe(false);
    expect(execTextSync).toHaveBeenCalledWith(
      "test-sb",
      ["sh", "-c", "openclaw --version"],
      { timeoutMs: OPENSHELL_PROBE_TIMEOUT_MS },
    );

    // Should have cached the version in registry
    const updated = registry.getSandbox("test-sb");
    expect(updated?.agentVersion).toBe("2026.5.22");
  });

  it("returns unavailable when gRPC exec fails", () => {
    registry.registerSandbox({ name: "test-sb", agent: null });

    vi.mocked(execTextSync).mockImplementation(() => {
      throw new Error("gRPC unavailable");
    });

    const result = checkAgentVersion("test-sb");
    expect(result.detectionMethod).toBe("unavailable");
    expect(result.isStale).toBe(false);
  });

  it("can skip live probing when no cached version is available", () => {
    registry.registerSandbox({ name: "test-sb", agent: null });
    vi.mocked(execTextSync).mockClear();

    const result = checkAgentVersion("test-sb", { skipProbe: true });

    expect(result.detectionMethod).toBe("unavailable");
    expect(result.sandboxVersion).toBeNull();
    expect(result.isStale).toBe(false);
    expect(execTextSync).not.toHaveBeenCalled();
  });

  it("force probe bypasses cached version", () => {
    registry.registerSandbox({
      name: "test-sb",
      agent: null,
      agentVersion: "2026.3.11",
    });

    vi.mocked(execTextSync).mockReturnValue({
      status: 0,
      stdout: "OpenClaw 2026.5.22 (abc123)\n",
      stderr: "",
    });

    const result = checkAgentVersion("test-sb", { forceProbe: true });
    expect(result.detectionMethod).toBe("grpc-exec");
    expect(result.sandboxVersion).toBe("2026.5.22");
  });
});

describe("formatStalenessWarning", () => {
  let tmpDir: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sandbox-warn-test-"));
    process.env.HOME = tmpDir;
    mkdirSync(join(tmpDir, ".nemoclaw"), { recursive: true });
    writeFileSync(
      join(tmpDir, ".nemoclaw", "sandboxes.json"),
      JSON.stringify({ sandboxes: {}, defaultSandbox: null }),
    );
    registry.registerSandbox({ name: "my-sb", agent: null });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes sandbox name, versions, and rebuild hint", () => {
    const lines = formatStalenessWarning("my-sb", {
      sandboxVersion: "2026.3.11",
      expectedVersion: "2026.5.22",
      isStale: true,
      detectionMethod: "registry",
    });
    const joined = lines.join("\n");
    expect(joined).toContain("my-sb");
    expect(joined).toContain("2026.3.11");
    expect(joined).toContain("2026.5.22");
    expect(joined).toContain("rebuild");
  });
});
