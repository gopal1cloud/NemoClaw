// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { getPhaseParityEntries } from "../runtime/resolver/parity-catalog.ts";
import { validateParityInventory } from "../runtime/resolver/parity.ts";

const SCRIPTS = ["test/e2e/test-hermes-discord-e2e.sh", "test/e2e/test-hermes-slack-e2e.sh", "test/e2e/test-openclaw-discord-pairing.sh", "test/e2e/test-openclaw-slack-pairing.sh"];

describe("Phase 7 messaging deep agent flow parity", () => {
  it("phase7_inventory_is_complete_and_mapped", () => {
    const entries = getPhaseParityEntries(7);
    expect(entries.map((e) => e.legacyScript).sort()).toEqual(SCRIPTS.sort());
    const report = validateParityInventory({ entries, requiredLegacyScripts: SCRIPTS });
    expect(report.errors).toEqual([]);
    expect(report.complete).toBe(true);
  });

  it("requires_hermes_gateway_capture_secret_absence_and_pairing_allowfrom", () => {
    const ids = getPhaseParityEntries(7).flatMap((e) => e.contract?.assertions?.map((a) => a.assertionId) ?? []);
    expect(ids).toEqual(expect.arrayContaining([
      "messaging.hermes.channel-health-config-env",
      "messaging.gateway.captures-host-token-not-placeholder",
      "messaging.secret-absent-config-env-process-files-logs",
      "messaging.pairing.pending-approve-allowfrom-failclosed",
    ]));
  });
});
