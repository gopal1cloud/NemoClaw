// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import {
  clearInaccessibleGatewayDb,
  sqliteDbPathFromUrl,
} from "./docker-driver-gateway-db";

describe("sqliteDbPathFromUrl", () => {
  it("extracts the file path from a sqlite URL", () => {
    expect(sqliteDbPathFromUrl("sqlite:/home/u/.local/state/openshell.db")).toBe(
      "/home/u/.local/state/openshell.db",
    );
  });

  it("drops any sqlx query string", () => {
    expect(sqliteDbPathFromUrl("sqlite:/tmp/openshell.db?mode=rwc")).toBe(
      "/tmp/openshell.db",
    );
  });

  it("returns null for absent, non-sqlite, or in-memory URLs", () => {
    expect(sqliteDbPathFromUrl(undefined)).toBeNull();
    expect(sqliteDbPathFromUrl(null)).toBeNull();
    expect(sqliteDbPathFromUrl("postgres://localhost/db")).toBeNull();
    expect(sqliteDbPathFromUrl("sqlite::memory:")).toBeNull();
  });
});

describe("clearInaccessibleGatewayDb", () => {
  const dbUrl = "sqlite:/state/openshell.db";

  it("removes an existing db (and sidecars) the user cannot read/write", () => {
    const removed: string[] = [];
    const log = vi.fn();
    const result = clearInaccessibleGatewayDb(dbUrl, {
      exists: () => true,
      access: () => {
        throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      },
      rm: (filePath) => removed.push(filePath),
      log,
    });
    expect(result).toBe(true);
    expect(removed).toEqual([
      "/state/openshell.db",
      "/state/openshell.db-wal",
      "/state/openshell.db-shm",
      "/state/openshell.db-journal",
    ]);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("leaves an accessible db untouched", () => {
    const rm = vi.fn();
    const result = clearInaccessibleGatewayDb(dbUrl, {
      exists: () => true,
      access: () => {
        /* readable + writable */
      },
      rm,
    });
    expect(result).toBe(false);
    expect(rm).not.toHaveBeenCalled();
  });

  it("does nothing when the db does not exist yet", () => {
    const access = vi.fn();
    const rm = vi.fn();
    const result = clearInaccessibleGatewayDb(dbUrl, {
      exists: () => false,
      access,
      rm,
    });
    expect(result).toBe(false);
    expect(access).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
  });

  it("does nothing when the URL is not a sqlite database", () => {
    const exists = vi.fn();
    const result = clearInaccessibleGatewayDb(undefined, { exists });
    expect(result).toBe(false);
    expect(exists).not.toHaveBeenCalled();
  });
});
