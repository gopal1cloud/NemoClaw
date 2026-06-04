// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import * as sandboxState from "../state/sandbox";
import type { BackupResult } from "../state/sandbox";

export type SandboxBackupImpl = (sandboxName: string) => BackupResult;

/**
 * Whether the sandbox container backing `sandboxName` is still alive.
 *
 * - `"present"`  — the container exists; back it up as usual.
 * - `"absent"`   — the container is confirmed gone; nothing to back up.
 * - `"unknown"`  — presence could not be determined (e.g. a transient gateway
 *                  probe error). Treated like `"present"` so we fail safe and
 *                  never destroy live state on an inconclusive probe.
 */
export type SandboxContainerPresence = "present" | "absent" | "unknown";

export interface PreRecreateBackupOptions {
  sandboxName: string;
  /**
   * Result of probing whether the container still exists. When `"absent"`,
   * the pre-recreate backup is skipped because a destroyed container holds no
   * state left to preserve (see #4757). Defaults to `"unknown"` (fail safe).
   */
  containerPresence?: SandboxContainerPresence;
  backupImpl?: SandboxBackupImpl;
  log?: (msg: string) => void;
  errorLog?: (msg: string) => void;
}

export type PreRecreateBackupFailureKind =
  | "none"
  | "partial"
  | "empty"
  | "threw"
  | "no-container";

export interface PreRecreateBackupResult {
  ok: boolean;
  backup: BackupResult | null;
  failureKind: PreRecreateBackupFailureKind;
  errorMessage?: string;
}

export function backupSandboxBeforeRecreate(
  opts: PreRecreateBackupOptions,
): PreRecreateBackupResult {
  const log = opts.log ?? ((m: string) => console.log(m));
  const errorLog = opts.errorLog ?? ((m: string) => console.error(m));
  const backupImpl = opts.backupImpl ?? sandboxState.backupSandboxState;

  // #4757: a non-atomic update/rebuild can destroy the container before
  // recovery runs. With the container confirmed gone there is nothing left to
  // back up (state is pulled out of the live container over SSH), so aborting
  // "to prevent data loss" would only block recovery of state that is already
  // gone. Skip the backup and let recreate rebuild from the host-side registry.
  // Only `"absent"` short-circuits; `"unknown"` falls through and fails safe.
  if (opts.containerPresence === "absent") {
    log("  Sandbox container is already gone — nothing to back up; proceeding with recreate.");
    return { ok: true, backup: null, failureKind: "no-container" };
  }

  try {
    const backup = backupImpl(opts.sandboxName);
    if (backup.success && backup.manifest?.backupPath) {
      log(
        `  ✓ State backed up (${backup.backedUpDirs.length} directories, ${backup.backedUpFiles.length} files)`,
      );
      return { ok: true, backup, failureKind: "none" };
    }
    if (backup.backedUpDirs.length > 0 || backup.backedUpFiles.length > 0) {
      errorLog(
        `  Partial backup: ${backup.backedUpDirs.length} dirs / ${backup.backedUpFiles.length} files saved; ${backup.failedDirs.length} dirs / ${backup.failedFiles.length} files failed.`,
      );
      errorLog("  Aborting recreate — failed entries would be lost on delete.");
      return { ok: false, backup, failureKind: "partial" };
    }
    errorLog("  State backup failed — aborting recreate to prevent data loss.");
    return { ok: false, backup: null, failureKind: "empty" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorLog(`  State backup threw: ${message} — aborting recreate.`);
    return { ok: false, backup: null, failureKind: "threw", errorMessage: message };
  }
}

export function shouldSkipPreRecreateBackup(env: NodeJS.ProcessEnv): boolean {
  return env.NEMOCLAW_RECREATE_WITHOUT_BACKUP === "1";
}

/**
 * Map a `getSandboxReuseState()` result to container presence for the
 * pre-recreate backup decision (#4757).
 *
 * Only `"missing"` — which `getSandboxStateFromOutputs` returns when OpenShell
 * `sandbox get` reports `sandbox not found` (gRPC NotFound) — is a positive
 * confirmation that the sandbox is gone, so it is the only state safe to skip
 * backup for. A gateway transport error maps to `"not_ready"`, and a stale
 * `Ready` entry whose container was destroyed maps to `"ready"`/`"not_ready"`;
 * neither confirms absence, so both fall through to `"unknown"` and keep the
 * fail-safe abort.
 */
export function containerPresenceFromReuseState(
  reuseState: string,
): SandboxContainerPresence {
  if (reuseState === "missing") return "absent";
  if (reuseState === "ready") return "present";
  return "unknown";
}
