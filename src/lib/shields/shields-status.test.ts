// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

vi.mock("../runner", () => ({
  run: vi.fn(() => ({ status: 0 })),
  runCapture: vi.fn(() => ""),
  validateName: vi.fn((name) => name),
  shellQuote: vi.fn((s) => `'${s}'`),
  redact: vi.fn((s) => s),
  ROOT: "/mock/root",
}));

vi.mock("../policy", () => ({
  buildPolicyGetCommand: vi.fn(() => ["openshell", "policy", "get"]),
  buildPolicySetCommand: vi.fn(() => ["openshell", "policy", "set"]),
  parseCurrentPolicy: vi.fn((raw) => raw || ""),
  PERMISSIVE_POLICY_PATH: "/mock/permissive.yaml",
  resolvePermissivePolicyPath: vi.fn(() => "/mock/permissive.yaml"),
}));

vi.mock("../sandbox/config", () => ({
  resolveAgentConfig: vi.fn(() => ({
    agentName: "openclaw",
    configPath: "/sandbox/.openclaw/openclaw.json",
    configDir: "/sandbox/.openclaw",
    format: "json",
    configFile: "openclaw.json",
  })),
}));

vi.mock("../adapters/docker/exec", () => ({
  dockerExecFileSync: vi.fn(() => ""),
}));

vi.mock("./audit", () => ({
  appendAuditEntry: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => ""),
  spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })),
  spawn: vi.fn(),
}));

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shields-status-test-"));
  vi.stubEnv("HOME", tmpDir);
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function loadShieldsModule(): Promise<typeof import("../../../dist/lib/shields/index")> {
  const distModulePath = path.join(
    process.cwd(),
    "dist",
    "lib",
    "shields",
    "index.js",
  );
  return import(distModulePath);
}

function stateDir(): string {
  return path.join(tmpDir, ".nemoclaw", "state");
}

function writeLockedState(sandboxName: string): void {
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(
    path.join(stateDir(), `shields-${sandboxName}.json`),
    JSON.stringify(
      {
        shieldsDown: false,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

describe("shieldsStatus surfaces drift returned by the verifier", () => {
  it("prints DRIFTED with the issue list and exits 2 when the verifier reports drift", async () => {
    const sandboxName = "openclaw";
    writeLockedState(sandboxName);
    const driftIssues = [
      "/sandbox/.openclaw/openclaw.json mode=660 (expected 444)",
      "/sandbox/.openclaw/openclaw.json owner=sandbox:sandbox (expected root:root)",
      "dir mode=2770 (expected 755)",
      "dir owner=sandbox:sandbox (expected root:root)",
    ];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`exit ${String(code)}`);
      });

    const { shieldsStatus } = await loadShieldsModule();
    expect(() =>
      shieldsStatus(sandboxName, true, {
        verifyLockState: () => ({ ok: false, issues: driftIssues }),
        resolveConfig: () => ({
          agentName: "openclaw",
          configPath: "/sandbox/.openclaw/openclaw.json",
          configDir: "/sandbox/.openclaw",
        }),
      }),
    ).toThrow("exit 2");

    expect(errorSpy).toHaveBeenCalledWith(
      "  Shields: UP (DRIFTED — declared locked but sandbox filesystem differs)",
    );
    expect(errorSpy).toHaveBeenCalledWith("  Drift:");
    for (const issue of driftIssues) {
      expect(errorSpy).toHaveBeenCalledWith(`    - ${issue}`);
    }
    expect(errorSpy).toHaveBeenCalledWith(
      `  Recovery: nemoclaw ${sandboxName} shields up   # re-lock and re-verify`,
    );
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it("prints a clean locked status when the verifier reports no drift", async () => {
    const sandboxName = "openclaw";
    writeLockedState(sandboxName);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { shieldsStatus } = await loadShieldsModule();
    shieldsStatus(sandboxName, true, {
      verifyLockState: () => ({ ok: true, issues: [] }),
      resolveConfig: () => ({
        agentName: "openclaw",
        configPath: "/sandbox/.openclaw/openclaw.json",
        configDir: "/sandbox/.openclaw",
      }),
    });

    expect(logSpy).toHaveBeenCalledWith("  Shields: UP (lockdown active)");
    expect(logSpy).toHaveBeenCalledWith("  Policy:  restrictive");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("treats a resolveConfig throw as drift so the locked status cannot mask a setup gap", async () => {
    const sandboxName = "openclaw";
    writeLockedState(sandboxName);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`exit ${String(code)}`);
      });

    const { shieldsStatus } = await loadShieldsModule();
    expect(() =>
      shieldsStatus(sandboxName, true, {
        verifyLockState: () => ({ ok: true, issues: [] }),
        resolveConfig: () => {
          throw new Error("agent config not found");
        },
      }),
    ).toThrow("exit 2");

    const allErrors = errorSpy.mock.calls.map((args) => args[0]).join("\n");
    expect(allErrors).toContain(
      "unable to resolve agent config target: agent config not found",
    );
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});
