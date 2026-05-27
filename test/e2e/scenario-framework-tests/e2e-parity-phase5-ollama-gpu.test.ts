// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { getPhaseParityEntries } from "../runtime/resolver/parity-catalog.ts";
import { validateParityInventory } from "../runtime/resolver/parity.ts";

const SCRIPTS = ["test/e2e/test-gpu-e2e.sh", "test/e2e/test-gpu-double-onboard.sh", "test/e2e/test-ollama-auth-proxy-e2e.sh"];

describe("Phase 5 local GPU and Ollama parity", () => {
  it("phase5_inventory_is_complete_and_mapped", () => {
    const entries = getPhaseParityEntries(5);
    expect(entries.map((e) => e.legacyScript).sort()).toEqual(SCRIPTS.sort());
    const report = validateParityInventory({ entries, requiredLegacyScripts: SCRIPTS });
    expect(report.errors).toEqual([]);
    expect(report.complete).toBe(true);
  });

  it("requires_gpu_environment_and_ollama_proxy_token_assertions", () => {
    const gpu = getPhaseParityEntries(5).find((e) => e.legacyScript === "test/e2e/test-gpu-e2e.sh");
    expect(gpu?.contract?.environment?.requirements).toEqual(expect.arrayContaining(["docker-cdi", "nvidia-smi"]));
    expect(gpu?.contract?.assertions?.map((a) => a.assertionId)).toEqual(expect.arrayContaining([
      "ollama.gpu.sandbox-status-gpu-enabled",
      "ollama.gpu.install-log-proof-markers",
      "ollama.gpu.inference-local-chat",
    ]));

    const proxy = getPhaseParityEntries(5).find((e) => e.legacyScript === "test/e2e/test-ollama-auth-proxy-e2e.sh");
    expect(proxy?.contract?.noManifestReason).toMatch(/host-only/);
    expect(proxy?.contract?.assertions?.map((a) => a.assertionId)).toEqual(expect.arrayContaining([
      "ollama.proxy.rejects-unauthenticated-and-wrong-token",
      "ollama.proxy.accepts-persisted-token",
      "ollama.proxy.token-file-0600",
      "ollama.proxy.restart-stable-token",
    ]));
  });
});
