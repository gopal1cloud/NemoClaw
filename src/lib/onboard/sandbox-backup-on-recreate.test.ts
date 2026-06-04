// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import type { BackupResult } from "../../../dist/lib/state/sandbox";
import {
  backupSandboxBeforeRecreate,
  containerPresenceFromReuseState,
  shouldSkipPreRecreateBackup,
} from "../../../dist/lib/onboard/sandbox-backup-on-recreate";

function makeBackup(overrides: Partial<BackupResult> = {}): BackupResult {
  return {
    success: true,
    backedUpDirs: ["workspace", "skills"],
    failedDirs: [],
    backedUpFiles: ["UPGRADE_MARKER.md"],
    failedFiles: [],
    manifest: {
      backupPath: "/tmp/backups/x",
      timestamp: "2026-05-25T00:00:00Z",
    } as BackupResult["manifest"],
    ...overrides,
  };
}

describe("backupSandboxBeforeRecreate", () => {
  it("returns ok with backup result on success", () => {
    const backup = makeBackup();
    const backupImpl = vi.fn().mockReturnValue(backup);
    const log = vi.fn();
    const result = backupSandboxBeforeRecreate({
      sandboxName: "my-assistant",
      backupImpl,
      log,
      errorLog: vi.fn(),
    });
    expect(result.ok).toBe(true);
    expect(result.backup).toBe(backup);
    expect(result.failureKind).toBe("none");
    expect(backupImpl).toHaveBeenCalledWith("my-assistant");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("State backed up"));
  });

  it("returns ok:false with failureKind=partial when some entries failed", () => {
    const backup = makeBackup({
      success: false,
      backedUpDirs: ["workspace"],
      failedDirs: ["skills"],
      backedUpFiles: [],
      failedFiles: ["bad.bin"],
    });
    const errorLog = vi.fn();
    const result = backupSandboxBeforeRecreate({
      sandboxName: "my-assistant",
      backupImpl: () => backup,
      log: vi.fn(),
      errorLog,
    });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe("partial");
    expect(result.backup).toBe(backup);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("Partial backup"));
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("Aborting recreate"));
  });

  it("rejects backup result missing manifest backupPath", () => {
    const backup = makeBackup({ manifest: undefined });
    const errorLog = vi.fn();
    const result = backupSandboxBeforeRecreate({
      sandboxName: "my-assistant",
      backupImpl: () => backup,
      log: vi.fn(),
      errorLog,
    });
    expect(result.ok).toBe(false);
  });

  it("returns ok:false with failureKind=empty when nothing was backed up", () => {
    const backup = makeBackup({
      success: false,
      backedUpDirs: [],
      failedDirs: ["workspace"],
      backedUpFiles: [],
      failedFiles: [],
    });
    const errorLog = vi.fn();
    const result = backupSandboxBeforeRecreate({
      sandboxName: "my-assistant",
      backupImpl: () => backup,
      errorLog,
      log: vi.fn(),
    });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe("empty");
    expect(result.backup).toBeNull();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("aborting recreate"));
  });

  it("skips backup and proceeds when the sandbox container is already gone", () => {
    // Repro for #4757: a non-atomic update destroys the container before
    // `onboard --resume` runs. There is nothing left in the container to back
    // up, so the pre-recreate backup must short-circuit instead of aborting.
    // Mirrors backupSandboxState's return when the container is gone and the
    // SSH download cannot run: success=false, nothing backed up, all failed.
    const backupImpl = vi.fn().mockReturnValue(
      makeBackup({
        success: false,
        backedUpDirs: [],
        failedDirs: ["workspace"],
        backedUpFiles: [],
        failedFiles: [],
      }),
    );
    const log = vi.fn();
    const errorLog = vi.fn();
    const result = backupSandboxBeforeRecreate({
      sandboxName: "my-assistant",
      containerPresence: "absent",
      backupImpl,
      log,
      errorLog,
    });
    expect(result.ok).toBe(true);
    expect(result.failureKind).toBe("no-container");
    expect(result.backup).toBeNull();
    // Nothing to back up from a destroyed container — don't even try.
    expect(backupImpl).not.toHaveBeenCalled();
    // Must not emit the data-loss abort warning.
    expect(errorLog).not.toHaveBeenCalledWith(expect.stringContaining("aborting recreate"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("already gone"));
  });

  it("still aborts on an empty backup when container presence is unknown", () => {
    // Safety: a transient probe error must not be mistaken for "container
    // gone". Only a confirmed-absent container skips the backup.
    const backup = makeBackup({
      success: false,
      backedUpDirs: [],
      failedDirs: ["workspace"],
      backedUpFiles: [],
      failedFiles: [],
    });
    const errorLog = vi.fn();
    const result = backupSandboxBeforeRecreate({
      sandboxName: "my-assistant",
      containerPresence: "unknown",
      backupImpl: () => backup,
      errorLog,
      log: vi.fn(),
    });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe("empty");
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("aborting recreate"));
  });

  it("returns ok:false with failureKind=threw when backup throws", () => {
    const errorLog = vi.fn();
    const result = backupSandboxBeforeRecreate({
      sandboxName: "my-assistant",
      backupImpl: () => {
        throw new Error("disk full");
      },
      errorLog,
      log: vi.fn(),
    });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe("threw");
    expect(result.errorMessage).toBe("disk full");
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("State backup threw"));
  });
});

describe("containerPresenceFromReuseState", () => {
  // #4757: only a positively-confirmed missing sandbox (OpenShell `sandbox get`
  // returns "sandbox not found") is safe to treat as "absent" and skip backup.
  it("maps a confirmed-missing sandbox to absent", () => {
    expect(containerPresenceFromReuseState("missing")).toBe("absent");
  });

  it("maps a ready sandbox to present", () => {
    expect(containerPresenceFromReuseState("ready")).toBe("present");
  });

  it("maps an indeterminate state to unknown (fail safe)", () => {
    // not_ready covers stale-Ready, Provisioning, Error, and transport errors —
    // none of which positively confirm the container is gone, so never skip.
    expect(containerPresenceFromReuseState("not_ready")).toBe("unknown");
    expect(containerPresenceFromReuseState("anything-else")).toBe("unknown");
  });
});

describe("shouldSkipPreRecreateBackup", () => {
  it("returns true when NEMOCLAW_RECREATE_WITHOUT_BACKUP=1", () => {
    expect(shouldSkipPreRecreateBackup({ NEMOCLAW_RECREATE_WITHOUT_BACKUP: "1" })).toBe(true);
  });

  it("returns false for any other value", () => {
    expect(shouldSkipPreRecreateBackup({})).toBe(false);
    expect(shouldSkipPreRecreateBackup({ NEMOCLAW_RECREATE_WITHOUT_BACKUP: "0" })).toBe(false);
    expect(shouldSkipPreRecreateBackup({ NEMOCLAW_RECREATE_WITHOUT_BACKUP: "true" })).toBe(false);
  });
});
