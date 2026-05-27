// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { getPhaseParityEntries } from "../runtime/resolver/parity-catalog.ts";
import { validateParityInventory } from "../runtime/resolver/parity.ts";

const phaseScripts: Record<number, string[]> = {
  8: ["test/e2e/test-credential-migration.sh", "test/e2e/test-credential-sanitization.sh", "test/e2e/test-network-policy.sh", "test/e2e/test-shields-config.sh"],
  9: ["test/e2e/test-sandbox-operations.sh", "test/e2e/test-sandbox-rebuild.sh", "test/e2e/test-sandbox-survival.sh", "test/e2e/test-snapshot-commands.sh", "test/e2e/test-state-backup-restore.sh", "test/e2e/test-skill-agent-e2e.sh"],
  10: ["test/e2e/test-rebuild-openclaw.sh", "test/e2e/test-rebuild-hermes.sh", "test/e2e/test-upgrade-stale-sandbox.sh", "test/e2e/test-openshell-gateway-upgrade.sh", "test/e2e/test-openshell-version-pin.sh", "test/e2e/test-overlayfs-autofix.sh", "test/e2e/test-openclaw-plugin-runtime-exdev.sh"],
  11: ["test/e2e/test-dashboard-remote-bind.sh", "test/e2e/test-device-auth-health.sh", "test/e2e/test-gateway-health-honest.sh", "test/e2e/test-gateway-drift-preflight.sh", "test/e2e/test-issue-2478-crash-loop-recovery.sh", "test/e2e/test-tunnel-lifecycle.sh", "test/e2e/test-openclaw-tui-chat-correlation.sh"],
  12: [],
};

const requiredAssertions: Record<number, string[]> = {
  8: ["security.credentials.migration-removes-plaintext", "security.credentials.sanitization-leak-scan", "security.policy.deny-preset-hot-reload-ssrf", "security.shields.up-down-audit-autorestore"],
  9: ["sandbox.operations.multi-sandbox-isolation-recovery", "sandbox.rebuild.marker-preservation-sanitized-backup", "sandbox.snapshot.timestamp-restore-sanitized", "sandbox.backup.destroy-recreate-restore", "sandbox.skill.agent-verification-token"],
  10: ["runtime.rebuild.old-sandbox-version-upgraded", "runtime.upgrade.stale-before-current-after", "runtime.installer.openshell-version-pin", "runtime.overlayfs.patched-image-optout", "runtime.exdev.plugin-runtime-replacement"],
  11: ["gateway.dashboard.binds-all-interfaces", "gateway.device-auth.health-root401-online", "gateway.health-honest.no-crash-healthy", "gateway.drift-preflight.fail-closed", "gateway.crash-loop.guard-chain-soak", "gateway.tunnel.start-status-serve-stop", "gateway.tui-chat-correlation.websocket"],
  12: ["cleanup.docs.contract-model", "cleanup.no-complete-metadata-only", "cleanup.fixture-obligations-documented"],
};

describe("Phase 8-12 parity inventory closeout", () => {
  for (const phase of [8, 9, 10, 11]) {
    it(`phase${phase}_inventory_is_complete_and_mapped`, () => {
      const entries = getPhaseParityEntries(phase);
      expect(entries.map((e) => e.legacyScript).sort()).toEqual(phaseScripts[phase].sort());
      const report = validateParityInventory({ entries, requiredLegacyScripts: phaseScripts[phase] });
      expect(report.errors).toEqual([]);
      expect(report.complete).toBe(true);
    });

    it(`phase${phase}_requires_domain_specific_assertions`, () => {
      const ids = getPhaseParityEntries(phase).flatMap((e) => e.contract?.assertions?.map((a) => a.assertionId) ?? []);
      expect(ids).toEqual(expect.arrayContaining(requiredAssertions[phase]));
    });
  }

  it("phase12_cleanup_is_documented_and_no_metadata_only_is_complete", () => {
    const entries = getPhaseParityEntries(12);
    const report = validateParityInventory({ entries });
    expect(report.errors).toEqual([]);
    expect(report.complete).toBe(true);
    expect(entries.flatMap((e) => e.contract?.assertions?.map((a) => a.assertionId) ?? [])).toEqual(expect.arrayContaining(requiredAssertions[12]));
  });
});
