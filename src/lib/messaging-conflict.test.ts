// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import type { SandboxEntry, SandboxMessagingState } from "./state/registry";
import type { SandboxMessagingPlan } from "./messaging/manifest";
import {
  backfillMessagingChannels,
  findAllOverlaps,
  findChannelConflicts,
  findChannelConflictsFromPlan,
} from "./messaging-conflict";
import { planToConflictChannelRequests, type MessagingConflictProbe } from "./messaging/applier";

type ProviderExists = MessagingConflictProbe["providerExists"];

function makeRegistry(sandboxes: SandboxEntry[]) {
  const store = new Map(sandboxes.map((s) => [s.name, { ...s }]));
  return {
    listSandboxes: () => ({
      sandboxes: Array.from(store.values()),
      defaultSandbox: sandboxes[0]?.name ?? null,
    }),
    updateSandbox: vi.fn((name: string, updates: Partial<SandboxEntry>) => {
      const entry = store.get(name);
      if (!entry) return false;
      Object.assign(entry, updates);
      return true;
    }),
  };
}

describe("findChannelConflicts", () => {
  it("returns unknown conflicts when another sandbox has the channel without hashes", () => {
    const registry = makeRegistry([
      { name: "alice", messagingChannels: ["telegram"] },
      { name: "bob", messagingChannels: [] },
    ]);
    expect(findChannelConflicts("bob", ["telegram"], registry)).toEqual([
      { channel: "telegram", sandbox: "alice", reason: "unknown-token" },
    ]);
  });

  it("returns conflicts only when the same channel credential hash matches", () => {
    const registry = makeRegistry([
      {
        name: "alice",
        messagingChannels: ["telegram"],
        providerCredentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" },
      },
      {
        name: "carol",
        messagingChannels: ["telegram"],
        providerCredentialHashes: { TELEGRAM_BOT_TOKEN: "hash-c" },
      },
    ]);
    expect(
      findChannelConflicts(
        "bob",
        [{ channel: "telegram", credentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" } }],
        registry,
      ),
    ).toEqual([{ channel: "telegram", sandbox: "alice", reason: "matching-token" }]);
  });

  it("allows multiple telegram sandboxes with distinct token hashes", () => {
    const registry = makeRegistry([
      {
        name: "alice",
        messagingChannels: ["telegram"],
        providerCredentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" },
      },
    ]);
    expect(
      findChannelConflicts(
        "bob",
        [{ channel: "telegram", credentialHashes: { TELEGRAM_BOT_TOKEN: "hash-b" } }],
        registry,
      ),
    ).toEqual([]);
  });

  it("excludes the current sandbox from its own conflicts", () => {
    const registry = makeRegistry([{ name: "alice", messagingChannels: ["telegram"] }]);
    expect(findChannelConflicts("alice", ["telegram"], registry)).toEqual([]);
  });

  it("skips entries with no messagingChannels field (pre-backfill)", () => {
    const registry = makeRegistry([{ name: "alice" }, { name: "bob", messagingChannels: [] }]);
    expect(findChannelConflicts("bob", ["telegram"], registry)).toEqual([]);
  });

  it("returns empty when no channels are enabled", () => {
    const registry = makeRegistry([{ name: "alice", messagingChannels: ["telegram"] }]);
    expect(findChannelConflicts("bob", [], registry)).toEqual([]);
  });

  it("ignores a stopped (disabled) channel — its credential is not in use (#3381)", () => {
    const registry = makeRegistry([
      {
        name: "alice",
        messagingChannels: ["telegram"],
        disabledChannels: ["telegram"],
        providerCredentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" },
      },
    ]);
    expect(
      findChannelConflicts(
        "bob",
        [{ channel: "telegram", credentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" } }],
        registry,
      ),
    ).toEqual([]);
  });
});

describe("findAllOverlaps", () => {
  it("reports each overlapping pair once", () => {
    const registry = makeRegistry([
      { name: "alice", messagingChannels: ["telegram"] },
      { name: "bob", messagingChannels: ["telegram"] },
      { name: "carol", messagingChannels: ["discord"] },
    ]);
    expect(findAllOverlaps(registry)).toEqual([
      { channel: "telegram", sandboxes: ["alice", "bob"], reason: "unknown-token" },
    ]);
  });

  it("reports all unknown pairs when three sandboxes share a channel without hashes", () => {
    const registry = makeRegistry([
      { name: "a", messagingChannels: ["telegram"] },
      { name: "b", messagingChannels: ["telegram"] },
      { name: "c", messagingChannels: ["telegram"] },
    ]);
    expect(findAllOverlaps(registry)).toEqual([
      { channel: "telegram", sandboxes: ["a", "b"], reason: "unknown-token" },
      { channel: "telegram", sandboxes: ["a", "c"], reason: "unknown-token" },
      { channel: "telegram", sandboxes: ["b", "c"], reason: "unknown-token" },
    ]);
  });

  it("does not report overlaps when same-channel credential hashes differ", () => {
    const registry = makeRegistry([
      {
        name: "alice",
        messagingChannels: ["telegram"],
        providerCredentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" },
      },
      {
        name: "bob",
        messagingChannels: ["telegram"],
        providerCredentialHashes: { TELEGRAM_BOT_TOKEN: "hash-b" },
      },
    ]);
    expect(findAllOverlaps(registry)).toEqual([]);
  });

  it("reports matching-token overlaps when same-channel credential hashes match", () => {
    const registry = makeRegistry([
      {
        name: "alice",
        messagingChannels: ["telegram"],
        providerCredentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" },
      },
      {
        name: "bob",
        messagingChannels: ["telegram"],
        providerCredentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" },
      },
    ]);
    expect(findAllOverlaps(registry)).toEqual([
      { channel: "telegram", sandboxes: ["alice", "bob"], reason: "matching-token" },
    ]);
  });

  it("returns empty when channels do not overlap", () => {
    const registry = makeRegistry([
      { name: "alice", messagingChannels: ["telegram"] },
      { name: "bob", messagingChannels: ["discord"] },
    ]);
    expect(findAllOverlaps(registry)).toEqual([]);
  });

  it("ignores stopped (disabled) channels so nemoclaw status does not report phantom overlaps (#3381)", () => {
    const registry = makeRegistry([
      {
        name: "alice",
        messagingChannels: ["telegram"],
        disabledChannels: ["telegram"],
        providerCredentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" },
      },
      {
        name: "bob",
        messagingChannels: ["telegram"],
        providerCredentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" },
      },
    ]);
    expect(findAllOverlaps(registry)).toEqual([]);
  });
});

describe("backfillMessagingChannels", () => {
  it("fills in missing messagingChannels by probing OpenShell", () => {
    const registry = makeRegistry([{ name: "alice" }]);
    const probe: MessagingConflictProbe = {
      providerExists: vi.fn<ProviderExists>((name) =>
        name === "alice-telegram-bridge" ? "present" : "absent",
      ),
    };
    backfillMessagingChannels(registry, probe);
    expect(registry.updateSandbox).toHaveBeenCalledWith("alice", {
      messagingChannels: ["telegram"],
    });
    expect(probe.providerExists).toHaveBeenCalledWith("alice-telegram-bridge");
    expect(probe.providerExists).toHaveBeenCalledWith("alice-discord-bridge");
    expect(probe.providerExists).toHaveBeenCalledWith("alice-slack-bridge");
    expect(probe.providerExists).toHaveBeenCalledWith("alice-wechat-bridge");
  });

  it("backfills wechat when only the wechat bridge provider is present", () => {
    // The probe-by-suffix mechanism relies on every channel having an entry
    // in PROVIDER_SUFFIXES; if wechat were ever dropped from that map, this
    // test starts catching the absent provider.
    const registry = makeRegistry([{ name: "alice" }]);
    const probe: MessagingConflictProbe = {
      providerExists: vi.fn<ProviderExists>((name) =>
        name === "alice-wechat-bridge" ? "present" : "absent",
      ),
    };
    backfillMessagingChannels(registry, probe);
    expect(registry.updateSandbox).toHaveBeenCalledWith("alice", {
      messagingChannels: ["wechat"],
    });
  });

  it("surfaces a wechat conflict when two sandboxes share the channel without hashes", () => {
    const registry = makeRegistry([
      { name: "alice", messagingChannels: ["wechat"] },
      { name: "bob", messagingChannels: [] },
    ]);
    expect(findChannelConflicts("bob", ["wechat"], registry)).toEqual([
      { channel: "wechat", sandbox: "alice", reason: "unknown-token" },
    ]);
  });

  it("leaves entries with existing messagingChannels alone", () => {
    const registry = makeRegistry([{ name: "alice", messagingChannels: ["telegram"] }]);
    const probe: MessagingConflictProbe = {
      providerExists: vi.fn<ProviderExists>(() => "present"),
    };
    backfillMessagingChannels(registry, probe);
    expect(registry.updateSandbox).not.toHaveBeenCalled();
    expect(probe.providerExists).not.toHaveBeenCalled();
  });

  it("writes an empty array when all probes return absent", () => {
    const registry = makeRegistry([{ name: "alice" }]);
    const probe: MessagingConflictProbe = {
      providerExists: vi.fn<ProviderExists>(() => "absent"),
    };
    backfillMessagingChannels(registry, probe);
    expect(registry.updateSandbox).toHaveBeenCalledWith("alice", { messagingChannels: [] });
  });

  it("does NOT persist when a probe returns error (retry on next call)", () => {
    // "error" is distinct from "absent": a transient gateway failure must not
    // be collapsed into "provider not attached" and persisted, because that
    // would prevent all future backfill retries and hide real overlaps.
    const registry = makeRegistry([{ name: "alice" }]);
    const probe: MessagingConflictProbe = {
      providerExists: vi.fn<ProviderExists>((name) => {
        if (name.endsWith("-telegram-bridge")) return "error";
        return name.endsWith("-discord-bridge") ? "present" : "absent";
      }),
    };
    backfillMessagingChannels(registry, probe);
    expect(registry.updateSandbox).not.toHaveBeenCalled();
  });

  it("also treats a thrown probe as error (defensive; callers should return 'error' instead)", () => {
    const registry = makeRegistry([{ name: "alice" }]);
    const probe: MessagingConflictProbe = {
      providerExists: vi.fn<ProviderExists>(() => {
        throw new Error("unexpected");
      }),
    };
    backfillMessagingChannels(registry, probe);
    expect(registry.updateSandbox).not.toHaveBeenCalled();
  });

  it("re-attempts backfill on a subsequent call after a prior error", () => {
    const registry = makeRegistry([{ name: "alice" }]);
    let firstPass = true;
    const probe: MessagingConflictProbe = {
      providerExists: vi.fn<ProviderExists>((name) => {
        if (name.endsWith("-telegram-bridge") && firstPass) {
          firstPass = false;
          return "error";
        }
        return name === "alice-telegram-bridge" ? "present" : "absent";
      }),
    };
    backfillMessagingChannels(registry, probe);
    expect(registry.updateSandbox).not.toHaveBeenCalled();
    backfillMessagingChannels(registry, probe);
    expect(registry.updateSandbox).toHaveBeenCalledWith("alice", {
      messagingChannels: ["telegram"],
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers for plan-driven tests
// ---------------------------------------------------------------------------

function makeMinimalPlan(
  sandboxName: string,
  overrides: Partial<SandboxMessagingPlan> = {},
): SandboxMessagingPlan {
  return {
    schemaVersion: 1,
    sandboxName,
    agent: "openclaw",
    workflow: "onboard",
    channels: [],
    disabledChannels: [],
    credentialBindings: [],
    networkPolicy: { presets: [], entries: [] },
    agentRender: [],
    buildSteps: [],
    stateUpdates: [],
    healthChecks: [],
    ...overrides,
  };
}

function makePlanEntry(sandboxName: string, plan: SandboxMessagingPlan): SandboxEntry {
  const state: SandboxMessagingState = { schemaVersion: 1, plan };
  return { name: sandboxName, messaging: state };
}

// ---------------------------------------------------------------------------
// planToConflictChannelRequests
// ---------------------------------------------------------------------------

describe("planToConflictChannelRequests", () => {
  it("returns one request per active channel with its credential hash", () => {
    const plan = makeMinimalPlan("alice", {
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "alice-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-tg" },
      ],
    });
    expect(planToConflictChannelRequests(plan)).toEqual([
      { channel: "telegram", credentialHashes: { TELEGRAM_BOT_TOKEN: "hash-tg" } },
    ]);
  });

  it("groups multiple bindings for the same channel (e.g. Slack bot + app tokens)", () => {
    const plan = makeMinimalPlan("alice", {
      channels: [{ channelId: "slack", displayName: "Slack", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "slack", credentialId: "slackBotToken", sourceInput: "botToken", providerName: "alice-slack-bridge", providerEnvKey: "SLACK_BOT_TOKEN", placeholder: "openshell:resolve:env:SLACK_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-bot" },
        { channelId: "slack", credentialId: "slackAppToken", sourceInput: "appToken", providerName: "alice-slack-bridge", providerEnvKey: "SLACK_APP_TOKEN", placeholder: "openshell:resolve:env:SLACK_APP_TOKEN", credentialAvailable: true, credentialHash: "hash-app" },
      ],
    });
    expect(planToConflictChannelRequests(plan)).toEqual([
      { channel: "slack", credentialHashes: { SLACK_BOT_TOKEN: "hash-bot", SLACK_APP_TOKEN: "hash-app" } },
    ]);
  });

  it("skips bindings without a credentialHash (credential not supplied)", () => {
    const plan = makeMinimalPlan("alice", {
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "alice-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: false },
      ],
    });
    expect(planToConflictChannelRequests(plan)).toEqual([]);
  });

  it("skips channels listed in disabledChannels (bridge is paused, not in use)", () => {
    const plan = makeMinimalPlan("alice", {
      disabledChannels: ["telegram"],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "alice-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-tg" },
      ],
    });
    expect(planToConflictChannelRequests(plan)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findChannelConflictsFromPlan
// ---------------------------------------------------------------------------

describe("findChannelConflictsFromPlan", () => {
  it("detects a matching-token conflict against a plan-backed registry entry", () => {
    const alicePlan = makeMinimalPlan("alice", {
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "alice-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-a" },
      ],
    });
    const bobPlan = makeMinimalPlan("bob", {
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "bob-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-a" },
      ],
    });
    const registry = makeRegistry([makePlanEntry("alice", alicePlan)]);
    expect(findChannelConflictsFromPlan("bob", bobPlan, registry)).toEqual([
      { channel: "telegram", sandbox: "alice", reason: "matching-token" },
    ]);
  });

  it("returns no conflict when credential hashes differ", () => {
    const alicePlan = makeMinimalPlan("alice", {
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "alice-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-a" },
      ],
    });
    const bobPlan = makeMinimalPlan("bob", {
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "bob-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-b" },
      ],
    });
    const registry = makeRegistry([makePlanEntry("alice", alicePlan)]);
    expect(findChannelConflictsFromPlan("bob", bobPlan, registry)).toEqual([]);
  });

  it("does not conflict with the current sandbox itself", () => {
    const plan = makeMinimalPlan("alice", {
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "alice-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-a" },
      ],
    });
    const registry = makeRegistry([makePlanEntry("alice", plan)]);
    expect(findChannelConflictsFromPlan("alice", plan, registry)).toEqual([]);
  });

  it("returns no conflict when the stored entry has the channel disabled", () => {
    const alicePlan = makeMinimalPlan("alice", {
      disabledChannels: ["telegram"],
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: false, selected: true, configured: true, disabled: true, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "alice-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-a" },
      ],
    });
    const bobPlan = makeMinimalPlan("bob", {
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "bob-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-a" },
      ],
    });
    const registry = makeRegistry([makePlanEntry("alice", alicePlan)]);
    expect(findChannelConflictsFromPlan("bob", bobPlan, registry)).toEqual([]);
  });

  it("returns no conflict when the incoming plan has no credential hashes", () => {
    const alicePlan = makeMinimalPlan("alice", {
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "alice-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-a" },
      ],
    });
    const bobPlan = makeMinimalPlan("bob", {
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "bob-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: false },
      ],
    });
    const registry = makeRegistry([makePlanEntry("alice", alicePlan)]);
    expect(findChannelConflictsFromPlan("bob", bobPlan, registry)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Plan-backed registry entries in findChannelConflicts / findAllOverlaps
// ---------------------------------------------------------------------------

describe("findChannelConflicts with plan-backed registry entries", () => {
  it("detects a conflict against a plan-only entry (no legacy messagingChannels field)", () => {
    const alicePlan = makeMinimalPlan("alice", {
      channels: [{ channelId: "discord", displayName: "Discord", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "discord", credentialId: "discordBotToken", sourceInput: "botToken", providerName: "alice-discord-bridge", providerEnvKey: "DISCORD_BOT_TOKEN", placeholder: "openshell:resolve:env:DISCORD_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-dc" },
      ],
    });
    const registry = makeRegistry([makePlanEntry("alice", alicePlan)]);
    expect(
      findChannelConflicts(
        "bob",
        [{ channel: "discord", credentialHashes: { DISCORD_BOT_TOKEN: "hash-dc" } }],
        registry,
      ),
    ).toEqual([{ channel: "discord", sandbox: "alice", reason: "matching-token" }]);
  });

  it("ignores a disabled channel in a plan-backed entry", () => {
    const alicePlan = makeMinimalPlan("alice", {
      disabledChannels: ["discord"],
      channels: [{ channelId: "discord", displayName: "Discord", authMode: "token-paste", active: false, selected: true, configured: true, disabled: true, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "discord", credentialId: "discordBotToken", sourceInput: "botToken", providerName: "alice-discord-bridge", providerEnvKey: "DISCORD_BOT_TOKEN", placeholder: "openshell:resolve:env:DISCORD_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-dc" },
      ],
    });
    const registry = makeRegistry([makePlanEntry("alice", alicePlan)]);
    expect(
      findChannelConflicts(
        "bob",
        [{ channel: "discord", credentialHashes: { DISCORD_BOT_TOKEN: "hash-dc" } }],
        registry,
      ),
    ).toEqual([]);
  });
});

describe("findAllOverlaps with plan-backed registry entries", () => {
  it("reports a matching-token overlap between two plan-backed entries", () => {
    const alicePlan = makeMinimalPlan("alice", {
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "alice-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-a" },
      ],
    });
    const bobPlan = makeMinimalPlan("bob", {
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "bob-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-a" },
      ],
    });
    const registry = makeRegistry([makePlanEntry("alice", alicePlan), makePlanEntry("bob", bobPlan)]);
    expect(findAllOverlaps(registry)).toEqual([
      { channel: "telegram", sandboxes: ["alice", "bob"], reason: "matching-token" },
    ]);
  });

  it("does not report an overlap when the shared channel is disabled in one plan", () => {
    const alicePlan = makeMinimalPlan("alice", {
      disabledChannels: ["telegram"],
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: false, selected: true, configured: true, disabled: true, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "alice-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-a" },
      ],
    });
    const bobPlan = makeMinimalPlan("bob", {
      channels: [{ channelId: "telegram", displayName: "Telegram", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
      credentialBindings: [
        { channelId: "telegram", credentialId: "telegramBotToken", sourceInput: "botToken", providerName: "bob-telegram-bridge", providerEnvKey: "TELEGRAM_BOT_TOKEN", placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN", credentialAvailable: true, credentialHash: "hash-a" },
      ],
    });
    const registry = makeRegistry([makePlanEntry("alice", alicePlan), makePlanEntry("bob", bobPlan)]);
    expect(findAllOverlaps(registry)).toEqual([]);
  });
});
