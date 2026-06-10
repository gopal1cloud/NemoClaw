// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { mergeOpenClawRestoredConfig } from "../../../dist/lib/state/openclaw-config-merge";

describe("mergeOpenClawRestoredConfig", () => {
  it("keeps rebuilt runtime-owned config while restoring durable backup-only settings", () => {
    const merged = mergeOpenClawRestoredConfig(
      {
        gateway: undefined,
        models: {
          providers: {
            nvidia: { models: [{ id: "stale-model" }] },
            custom: { models: [{ id: "custom-model" }] },
          },
        },
        channels: {
          discord: { accounts: { default: { token: "openshell:resolve:env:v111_TOKEN" } } },
          slack: { accounts: { default: { botToken: "[STRIPPED_BY_MIGRATION]" } } },
          matrix: { accounts: { default: { room: "#ops" } } },
        },
        plugins: { entries: { discord: { enabled: false }, customPlugin: { enabled: true } } },
        mcpServers: { filesystem: { command: "npx" } },
        customAgents: { researcher: { prompt: "be thorough" } },
      },
      {
        gateway: { auth: { token: "fresh-token" } },
        diagnostics: { otel: true },
        models: { providers: { nvidia: { models: [{ id: "fresh-model" }] } } },
        channels: {
          discord: { accounts: { default: { token: "openshell:resolve:env:v222_TOKEN" } } },
          whatsapp: { accounts: { default: { enabled: true } } },
        },
        plugins: { entries: { discord: { enabled: true } } },
      },
    );

    expect(merged).toMatchObject({
      gateway: { auth: { token: "fresh-token" } },
      diagnostics: { otel: true },
      models: {
        providers: {
          nvidia: { models: [{ id: "fresh-model" }] },
          custom: { models: [{ id: "custom-model" }] },
        },
      },
      channels: {
        discord: { accounts: { default: { token: "openshell:resolve:env:v222_TOKEN" } } },
        whatsapp: { accounts: { default: { enabled: true } } },
        matrix: { accounts: { default: { room: "#ops" } } },
      },
      plugins: { entries: { discord: { enabled: true }, customPlugin: { enabled: true } } },
      mcpServers: { filesystem: { command: "npx" } },
      customAgents: { researcher: { prompt: "be thorough" } },
    });
    expect((merged as { channels: Record<string, unknown> }).channels.slack).toBeUndefined();
  });

  it("keeps the rebuilt gateway section — including the reload pin — over the backup's (#4710)", () => {
    // gateway.reload.mode="hot" is what keeps the in-sandbox gateway from
    // SIGUSR1-restarting itself out from under the nemoclaw-start respawn
    // loop. A backup taken before the pin existed (or carrying a different
    // mode) must not reintroduce restart-mode reloads on restore.
    const merged = mergeOpenClawRestoredConfig(
      {
        gateway: {
          auth: { token: "stale-token" },
          reload: { mode: "hybrid" },
          controlUi: { allowInsecureAuth: true },
        },
      },
      { gateway: { auth: { token: "fresh-token" }, reload: { mode: "hot" } } },
    ) as { gateway: unknown };

    expect(merged.gateway).toEqual({
      auth: { token: "fresh-token" },
      reload: { mode: "hot" },
    });
  });

  it("does not resurrect managed channels when the rebuilt config omits channels", () => {
    const merged = mergeOpenClawRestoredConfig(
      {
        channels: {
          telegram: { accounts: { default: { token: "openshell:resolve:env:v111_TOKEN" } } },
          matrix: { accounts: { default: { room: "#ops" } } },
        },
      },
      { gateway: { auth: { token: "fresh-token" } } },
    );

    expect(merged).toMatchObject({
      gateway: { auth: { token: "fresh-token" } },
      channels: { matrix: { accounts: { default: { room: "#ops" } } } },
    });
    expect((merged as { channels: Record<string, unknown> }).channels.telegram).toBeUndefined();
  });
});
