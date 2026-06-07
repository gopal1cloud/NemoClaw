// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { SandboxMessagingPlan } from "../manifest";
import type { SandboxMessagingState } from "../../state/registry";
import {
  conflictReasonForPair,
  conflictReasonForRequest,
  detectAllOverlapsInEntries,
  findConflictsInEntries,
  getActiveChannelIdsFromPlan,
  getCredentialHashesFromPlan,
  hasStoredChannelInEntry,
  planToConflictChannelRequests,
  type ConflictRegistryEntry,
} from "./conflict-detection";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePlan(
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

function tgChannel(active = true, disabled = false) {
  return {
    channelId: "telegram" as const,
    displayName: "Telegram",
    authMode: "token-paste" as const,
    active,
    selected: true,
    configured: true,
    disabled,
    inputs: [],
    hooks: [],
  };
}

function tgBinding(hash?: string): SandboxMessagingPlan["credentialBindings"][number] {
  return {
    channelId: "telegram",
    credentialId: "telegramBotToken",
    sourceInput: "botToken",
    providerName: "sb-telegram-bridge",
    providerEnvKey: "TELEGRAM_BOT_TOKEN",
    placeholder: "openshell:resolve:env:TELEGRAM_BOT_TOKEN",
    credentialAvailable: hash !== undefined || true,
    ...(hash !== undefined ? { credentialHash: hash } : {}),
  };
}

function slackBindings(botHash?: string, appHash?: string) {
  return [
    {
      channelId: "slack" as const,
      credentialId: "slackBotToken",
      sourceInput: "botToken",
      providerName: "sb-slack-bridge",
      providerEnvKey: "SLACK_BOT_TOKEN",
      placeholder: "openshell:resolve:env:SLACK_BOT_TOKEN",
      credentialAvailable: true,
      ...(botHash ? { credentialHash: botHash } : {}),
    },
    {
      channelId: "slack" as const,
      credentialId: "slackAppToken",
      sourceInput: "appToken",
      providerName: "sb-slack-bridge",
      providerEnvKey: "SLACK_APP_TOKEN",
      placeholder: "openshell:resolve:env:SLACK_APP_TOKEN",
      credentialAvailable: true,
      ...(appHash ? { credentialHash: appHash } : {}),
    },
  ];
}

function planEntry(name: string, plan: SandboxMessagingPlan): ConflictRegistryEntry {
  const state: SandboxMessagingState = { schemaVersion: 1, plan };
  return { name, messaging: state };
}

// ---------------------------------------------------------------------------
// getActiveChannelIdsFromPlan
// ---------------------------------------------------------------------------

describe("getActiveChannelIdsFromPlan", () => {
  it("returns active channel ids", () => {
    const plan = makePlan("sb", { channels: [tgChannel(true, false)] });
    expect(getActiveChannelIdsFromPlan(plan)).toEqual(["telegram"]);
  });

  it("excludes channels in disabledChannels", () => {
    const plan = makePlan("sb", {
      disabledChannels: ["telegram"],
      channels: [tgChannel(true, false)],
    });
    expect(getActiveChannelIdsFromPlan(plan)).toEqual([]);
  });

  it("excludes channels where channel.disabled is true (#plan-filter parity)", () => {
    const plan = makePlan("sb", { channels: [tgChannel(false, true)] });
    expect(getActiveChannelIdsFromPlan(plan)).toEqual([]);
  });

  it("excludes channels where channel.active is false (#plan-filter parity)", () => {
    const plan = makePlan("sb", { channels: [tgChannel(false, false)] });
    expect(getActiveChannelIdsFromPlan(plan)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getCredentialHashesFromPlan
// ---------------------------------------------------------------------------

describe("getCredentialHashesFromPlan", () => {
  it("returns hashes keyed by providerEnvKey", () => {
    const plan = makePlan("sb", { credentialBindings: [tgBinding("hash-x")] });
    expect(getCredentialHashesFromPlan(plan)).toEqual({ TELEGRAM_BOT_TOKEN: "hash-x" });
  });

  it("scopes to a single channel when channelId is provided", () => {
    const plan = makePlan("sb", {
      credentialBindings: [tgBinding("hash-tg"), ...slackBindings("hash-bot", "hash-app")],
    });
    expect(getCredentialHashesFromPlan(plan, "telegram")).toEqual({
      TELEGRAM_BOT_TOKEN: "hash-tg",
    });
    expect(getCredentialHashesFromPlan(plan, "slack")).toEqual({
      SLACK_BOT_TOKEN: "hash-bot",
      SLACK_APP_TOKEN: "hash-app",
    });
  });

  it("omits bindings without a credentialHash", () => {
    const plan = makePlan("sb", { credentialBindings: [tgBinding()] });
    expect(getCredentialHashesFromPlan(plan)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// planToConflictChannelRequests
// ---------------------------------------------------------------------------

describe("planToConflictChannelRequests", () => {
  it("returns one request per active channel that has a credential available", () => {
    const plan = makePlan("sb", {
      channels: [tgChannel()],
      credentialBindings: [tgBinding("hash-tg")],
    });
    expect(planToConflictChannelRequests(plan)).toEqual([
      { channel: "telegram", credentialHashes: { TELEGRAM_BOT_TOKEN: "hash-tg" } },
    ]);
  });

  it("includes a channel with credentialAvailable=true but no hash (unknown-token fallback)", () => {
    const binding = { ...tgBinding(), credentialAvailable: true };
    const plan = makePlan("sb", { credentialBindings: [binding] });
    const requests = planToConflictChannelRequests(plan);
    expect(requests).toHaveLength(1);
    expect(requests[0].channel).toBe("telegram");
    expect(requests[0].credentialHashes).toEqual({});
  });

  it("groups multiple bindings for the same channel (Slack bot + app tokens)", () => {
    const plan = makePlan("sb", {
      credentialBindings: slackBindings("hash-bot", "hash-app"),
    });
    expect(planToConflictChannelRequests(plan)).toEqual([
      { channel: "slack", credentialHashes: { SLACK_BOT_TOKEN: "hash-bot", SLACK_APP_TOKEN: "hash-app" } },
    ]);
  });

  it("skips bindings where credentialAvailable is false", () => {
    const plan = makePlan("sb", {
      credentialBindings: [{ ...tgBinding("hash-tg"), credentialAvailable: false }],
    });
    expect(planToConflictChannelRequests(plan)).toEqual([]);
  });

  it("skips channels in disabledChannels (bridge is paused)", () => {
    const plan = makePlan("sb", {
      disabledChannels: ["telegram"],
      credentialBindings: [tgBinding("hash-tg")],
    });
    expect(planToConflictChannelRequests(plan)).toEqual([]);
  });

  it("WhatsApp — no-op: empty credentials produce no conflict requests (#4392)", () => {
    // WhatsApp uses in-sandbox-qr pairing; it has no host-side token provider
    // and therefore no credentialBindings. planToConflictChannelRequests must
    // not emit a request for it, so it never participates in token-backed
    // conflict detection or legacy provider probing.
    const plan = makePlan("sb", {
      channels: [
        {
          channelId: "whatsapp",
          displayName: "WhatsApp",
          authMode: "in-sandbox-qr",
          active: true,
          selected: true,
          configured: true,
          disabled: false,
          inputs: [],
          hooks: [],
        },
      ],
      credentialBindings: [],
    });
    expect(planToConflictChannelRequests(plan)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// hasStoredChannelInEntry
// ---------------------------------------------------------------------------

describe("hasStoredChannelInEntry", () => {
  it("returns true for an active channel in a plan-backed entry", () => {
    const entry = planEntry("sb", makePlan("sb", { channels: [tgChannel()] }));
    expect(hasStoredChannelInEntry(entry, "telegram")).toBe(true);
  });

  it("returns false when channel is in plan.disabledChannels", () => {
    const entry = planEntry(
      "sb",
      makePlan("sb", { disabledChannels: ["telegram"], channels: [tgChannel(false, true)] }),
    );
    expect(hasStoredChannelInEntry(entry, "telegram")).toBe(false);
  });

  it("returns false when channel.active is false", () => {
    const entry = planEntry("sb", makePlan("sb", { channels: [tgChannel(false, false)] }));
    expect(hasStoredChannelInEntry(entry, "telegram")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// conflictReasonForRequest — channel-scoped hash comparison
// ---------------------------------------------------------------------------

describe("conflictReasonForRequest (plan-backed entry)", () => {
  it("detects matching-token when same channel hash matches", () => {
    const entry = planEntry(
      "alice",
      makePlan("alice", {
        channels: [tgChannel()],
        credentialBindings: [tgBinding("hash-a")],
      }),
    );
    expect(
      conflictReasonForRequest(entry, {
        channel: "telegram",
        credentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" },
      }),
    ).toBe("matching-token");
  });

  it("returns null when same channel hash differs", () => {
    const entry = planEntry(
      "alice",
      makePlan("alice", {
        channels: [tgChannel()],
        credentialBindings: [tgBinding("hash-a")],
      }),
    );
    expect(
      conflictReasonForRequest(entry, {
        channel: "telegram",
        credentialHashes: { TELEGRAM_BOT_TOKEN: "hash-b" },
      }),
    ).toBeNull();
  });

  it("does not create false positives from unrelated-channel hashes in the same entry", () => {
    // alice has both Telegram (hash-tg-a) and Slack; bob checks Telegram with a
    // different hash (hash-tg-b). Slack's keys must not pollute the comparison
    // and cause a spurious unknown-token result.
    const entry = planEntry(
      "alice",
      makePlan("alice", {
        channels: [
          tgChannel(),
          { channelId: "slack", displayName: "Slack", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] },
        ],
        credentialBindings: [tgBinding("hash-tg-a"), ...slackBindings("hash-slack")],
      }),
    );
    expect(
      conflictReasonForRequest(entry, {
        channel: "telegram",
        credentialHashes: { TELEGRAM_BOT_TOKEN: "hash-tg-b" },
      }),
    ).toBeNull();
  });

  it("falls back to legacy providerCredentialHashes when plan has no hashes for the channel", () => {
    // During the migration window the plan may exist but carry no credentialHash yet.
    // The function must fall back to the legacy field so safety is preserved.
    const entry: ConflictRegistryEntry = {
      name: "alice",
      messaging: {
        plan: makePlan("alice", {
          channels: [tgChannel()],
          credentialBindings: [tgBinding()], // no credentialHash
        }),
      },
      providerCredentialHashes: { TELEGRAM_BOT_TOKEN: "hash-legacy" },
    };
    expect(
      conflictReasonForRequest(entry, {
        channel: "telegram",
        credentialHashes: { TELEGRAM_BOT_TOKEN: "hash-legacy" },
      }),
    ).toBe("matching-token");
  });

  it("returns unknown-token when plan has no hashes and no legacy hashes", () => {
    const entry = planEntry(
      "alice",
      makePlan("alice", {
        channels: [tgChannel()],
        credentialBindings: [tgBinding()], // no credentialHash
      }),
    );
    expect(
      conflictReasonForRequest(entry, {
        channel: "telegram",
        credentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" },
      }),
    ).toBe("unknown-token");
  });
});

// ---------------------------------------------------------------------------
// conflictReasonForPair — channel-scoped hash comparison
// ---------------------------------------------------------------------------

describe("conflictReasonForPair", () => {
  it("detects matching-token between two plan-backed entries", () => {
    const alice = planEntry(
      "alice",
      makePlan("alice", { channels: [tgChannel()], credentialBindings: [tgBinding("hash-a")] }),
    );
    const bob = planEntry(
      "bob",
      makePlan("bob", { channels: [tgChannel()], credentialBindings: [tgBinding("hash-a")] }),
    );
    expect(conflictReasonForPair("telegram", alice, bob)).toBe("matching-token");
  });

  it("returns null when same-channel hashes differ", () => {
    const alice = planEntry(
      "alice",
      makePlan("alice", { channels: [tgChannel()], credentialBindings: [tgBinding("hash-a")] }),
    );
    const bob = planEntry(
      "bob",
      makePlan("bob", { channels: [tgChannel()], credentialBindings: [tgBinding("hash-b")] }),
    );
    expect(conflictReasonForPair("telegram", alice, bob)).toBeNull();
  });

  it("scopes comparison to the requested channel, ignoring other channels", () => {
    // Both sandboxes have Telegram (different hashes) and Slack (same hash).
    // Checking Telegram must NOT produce a conflict from the shared Slack hash.
    const alice = planEntry(
      "alice",
      makePlan("alice", {
        channels: [tgChannel(), { channelId: "slack", displayName: "Slack", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
        credentialBindings: [tgBinding("hash-tg-a"), ...slackBindings("hash-slack")],
      }),
    );
    const bob = planEntry(
      "bob",
      makePlan("bob", {
        channels: [tgChannel(), { channelId: "slack", displayName: "Slack", authMode: "token-paste", active: true, selected: true, configured: true, disabled: false, inputs: [], hooks: [] }],
        credentialBindings: [tgBinding("hash-tg-b"), ...slackBindings("hash-slack")],
      }),
    );
    expect(conflictReasonForPair("telegram", alice, bob)).toBeNull();
    expect(conflictReasonForPair("slack", alice, bob)).toBe("matching-token");
  });
});

// ---------------------------------------------------------------------------
// findConflictsInEntries / detectAllOverlapsInEntries — plan-backed entries
// ---------------------------------------------------------------------------

describe("findConflictsInEntries (plan-backed entries)", () => {
  it("detects matching-token against a plan-only entry (no legacy messagingChannels)", () => {
    const alice = planEntry(
      "alice",
      makePlan("alice", { channels: [tgChannel()], credentialBindings: [tgBinding("hash-a")] }),
    );
    expect(
      findConflictsInEntries(
        "bob",
        [{ channel: "telegram", credentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" } }],
        [alice],
      ),
    ).toEqual([{ channel: "telegram", sandbox: "alice", reason: "matching-token" }]);
  });

  it("ignores a disabled channel in a plan-backed entry", () => {
    const alice = planEntry(
      "alice",
      makePlan("alice", {
        disabledChannels: ["telegram"],
        channels: [tgChannel(false, true)],
        credentialBindings: [tgBinding("hash-a")],
      }),
    );
    expect(
      findConflictsInEntries(
        "bob",
        [{ channel: "telegram", credentialHashes: { TELEGRAM_BOT_TOKEN: "hash-a" } }],
        [alice],
      ),
    ).toEqual([]);
  });
});

describe("detectAllOverlapsInEntries (plan-backed entries)", () => {
  it("reports matching-token overlap between two plan-backed entries", () => {
    const alice = planEntry(
      "alice",
      makePlan("alice", { channels: [tgChannel()], credentialBindings: [tgBinding("hash-a")] }),
    );
    const bob = planEntry(
      "bob",
      makePlan("bob", { channels: [tgChannel()], credentialBindings: [tgBinding("hash-a")] }),
    );
    expect(detectAllOverlapsInEntries([alice, bob])).toEqual([
      { channel: "telegram", sandboxes: ["alice", "bob"], reason: "matching-token" },
    ]);
  });

  it("does not report overlap when shared channel is disabled in one plan", () => {
    const alice = planEntry(
      "alice",
      makePlan("alice", {
        disabledChannels: ["telegram"],
        channels: [tgChannel(false, true)],
        credentialBindings: [tgBinding("hash-a")],
      }),
    );
    const bob = planEntry(
      "bob",
      makePlan("bob", { channels: [tgChannel()], credentialBindings: [tgBinding("hash-a")] }),
    );
    expect(detectAllOverlapsInEntries([alice, bob])).toEqual([]);
  });
});
