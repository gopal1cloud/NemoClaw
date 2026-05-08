// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findSelectionConfigPath,
  getSelectionDrift,
  readSandboxSelectionConfig,
} from "./selection-drift";

const tmpRoots: string[] = [];

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-selection-test-"));
  tmpRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("selection drift helpers", () => {
  it("finds nested config.json files", () => {
    const root = tmpRoot();
    const nested = path.join(root, "sandbox", ".nemoclaw");
    fs.mkdirSync(nested, { recursive: true });
    const configPath = path.join(nested, "config.json");
    fs.writeFileSync(configPath, "{}", "utf-8");

    expect(findSelectionConfigPath(root)).toBe(configPath);
  });

  it("returns null when the sandbox download fails", () => {
    const runOpenshell = vi.fn(() => ({ status: 1 }));

    expect(readSandboxSelectionConfig("alpha", { runOpenshell })).toBeNull();
    expect(runOpenshell).toHaveBeenCalledWith(
      [
        "sandbox",
        "download",
        "alpha",
        "/sandbox/.nemoclaw/config.json",
        expect.stringMatching(/nemoclaw-selection-.*\/$/),
      ],
      { ignoreError: true, stdio: ["ignore", "ignore", "ignore"] },
    );
  });

  it("reads a downloaded selection config and cleans up the temp directory", () => {
    let downloadedParent: string | null = null;
    const runOpenshell = vi.fn((args: string[]) => {
      downloadedParent = args[4];
      const targetDir = path.join(String(downloadedParent), "nested");
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, "config.json"),
        JSON.stringify({ provider: "compatible-endpoint", model: "model-a" }),
        "utf-8",
      );
      return { status: 0 };
    });

    expect(readSandboxSelectionConfig("alpha", { runOpenshell })).toEqual({
      provider: "compatible-endpoint",
      model: "model-a",
    });
    expect(downloadedParent).not.toBeNull();
    expect(fs.existsSync(String(downloadedParent))).toBe(false);
  });

  it("reports unknown drift when no readable selection config exists", () => {
    expect(
      getSelectionDrift("alpha", "compatible-endpoint", "model-a", {
        runOpenshell: () => ({ status: 1 }),
      }),
    ).toEqual({
      changed: true,
      providerChanged: false,
      modelChanged: false,
      existingProvider: null,
      existingModel: null,
      unknown: true,
    });
  });

  it("reports provider and model drift from the downloaded selection config", () => {
    const runOpenshell = vi.fn((args: string[]) => {
      const targetDir = String(args[4]);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, "config.json"),
        JSON.stringify({ provider: "old-provider", model: "old-model" }),
        "utf-8",
      );
      return { status: 0 };
    });

    expect(getSelectionDrift("alpha", "new-provider", "new-model", { runOpenshell })).toEqual({
      changed: true,
      providerChanged: true,
      modelChanged: true,
      existingProvider: "old-provider",
      existingModel: "old-model",
      unknown: false,
    });
  });
});
