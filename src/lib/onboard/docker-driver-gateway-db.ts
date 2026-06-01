// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Host-mode SQLite state hygiene for the Docker-driver gateway.
 *
 * On some hosts (notably Windows 11 + WSL2 + Docker Desktop, where the
 * previously installed openshell-gateway required a newer glibc than the
 * host), NemoClaw first runs the gateway inside a Docker compatibility
 * container. That container runs as root and creates `openshell.db` in the
 * user-owned state dir owned by root. A later `--fresh` onboarding that runs
 * the gateway in host mode does so as the unprivileged user, which then
 * cannot open the root-owned database and dies with SQLITE_CANTOPEN
 * ("unable to open database file", code 14) — see #4624.
 *
 * `clearInaccessibleGatewayDb` detects that exact case and removes the
 * unreadable database (plus its WAL/SHM/journal sidecars) so the host gateway
 * recreates a fresh, user-owned database. A database the current user can
 * read and write is left untouched, so healthy installs are never disturbed.
 */

import fs from "node:fs";

const SQLITE_SCHEME = "sqlite:";
// SQLite writes these sidecars next to the main database file depending on
// journal mode; all must be cleared so a stale root-owned WAL/SHM pair can't
// keep blocking the recreated database.
const SQLITE_SIDECAR_SUFFIXES = ["", "-wal", "-shm", "-journal"] as const;

export interface ClearInaccessibleGatewayDbDeps {
  /** Throws when the path is not accessible with the requested mode. */
  access?: (filePath: string, mode: number) => void;
  exists?: (filePath: string) => boolean;
  rm?: (filePath: string) => void;
  log?: (message: string) => void;
}

/**
 * Derive the on-disk SQLite file path from an `OPENSHELL_DB_URL` value, or
 * `null` when the URL is absent, not a sqlite URL, or an in-memory database.
 */
export function sqliteDbPathFromUrl(dbUrl: string | undefined | null): string | null {
  if (!dbUrl) return null;
  const trimmed = dbUrl.trim();
  if (!trimmed.startsWith(SQLITE_SCHEME)) return null;
  // Drop the scheme and any sqlx query string (e.g. `?mode=rwc`).
  const pathPart = trimmed.slice(SQLITE_SCHEME.length).split("?")[0];
  if (!pathPart || pathPart === ":memory:") return null;
  return pathPart;
}

/**
 * Remove a Docker-driver gateway SQLite database that exists but the current
 * process cannot read and write (typically a root-owned file left by a prior
 * container-mode gateway). Returns `true` when files were removed.
 */
export function clearInaccessibleGatewayDb(
  dbUrl: string | undefined | null,
  deps: ClearInaccessibleGatewayDbDeps = {},
): boolean {
  const dbPath = sqliteDbPathFromUrl(dbUrl);
  if (!dbPath) return false;

  const exists = deps.exists ?? ((filePath) => fs.existsSync(filePath));
  if (!exists(dbPath)) return false;

  const access = deps.access ?? ((filePath, mode) => fs.accessSync(filePath, mode));
  try {
    access(dbPath, fs.constants.R_OK | fs.constants.W_OK);
    return false; // Database is usable — leave it alone.
  } catch {
    // Inaccessible (wrong owner/permissions): fall through and clear it.
  }

  const rm = deps.rm ?? ((filePath) => fs.rmSync(filePath, { force: true }));
  const log = deps.log ?? ((message) => console.log(message));
  for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
    try {
      rm(`${dbPath}${suffix}`);
    } catch {
      // Best effort; the gateway launch surfaces any remaining failure.
    }
  }
  log(
    "  Removed an unreadable OpenShell gateway database left by a prior " +
      "container-mode gateway; the host gateway will recreate it.",
  );
  return true;
}
