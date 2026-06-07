// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { SandboxMessagingPlan } from "../manifest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProbeResult = "present" | "absent" | "error";
export type ConflictReason = "matching-token" | "unknown-token";

export interface MessagingConflictProbe {
  // Tri-state — "error" is distinct from "absent" so a transient gateway
  // failure does not get collapsed into "provider not attached" and then
  // persisted as a bogus empty messagingChannels.
  providerExists: (name: string) => ProbeResult;
}

export interface MessagingConflictProbeGatewayDeps {
  /** Run `openshell sandbox list`; return true if the gateway answered. */
  checkGatewayLiveness: () => boolean;
  /** Check if the named OpenShell provider exists; assumes gateway is alive. */
  providerExists: (name: string) => boolean;
}

export interface ConflictRequest {
  readonly channel: string;
  readonly credentialHashes?: Record<string, string | null | undefined>;
}

export interface ConflictMatch {
  readonly channel: string;
  readonly sandbox: string;
  readonly reason: ConflictReason;
}

/**
 * Minimal shape of a registry entry that conflict detection needs.
 * Satisfied by `SandboxEntry` from `./state/registry`.
 */
export interface ConflictRegistryEntry {
  readonly name: string;
  readonly messaging?: { readonly plan: SandboxMessagingPlan } | null;
  readonly messagingChannels?: readonly string[] | null;
  readonly disabledChannels?: readonly string[] | null;
  readonly providerCredentialHashes?: Record<string, string> | null;
}

// ---------------------------------------------------------------------------
// Constants — provider name suffixes for legacy probe-based backfill.
// NemoClaw attaches one OpenShell provider per messaging channel per sandbox.
// When a sandbox predates the messagingChannels registry field, probing the
// live gateway by known provider name is the only record of its channels.
// ---------------------------------------------------------------------------

export const PROVIDER_SUFFIXES: Record<string, string> = {
  telegram: "-telegram-bridge",
  discord: "-discord-bridge",
  slack: "-slack-bridge",
  wechat: "-wechat-bridge",
};

export const KNOWN_CHANNEL_IDS: readonly string[] = Object.keys(PROVIDER_SUFFIXES);

// ---------------------------------------------------------------------------
// Probe factory
// ---------------------------------------------------------------------------

/**
 * Build a tri-state `MessagingConflictProbe` from plain openshell runner deps.
 *
 * The liveness result is cached so the `sandbox list` call is issued at most
 * once per probe instance. A transient gateway failure (`checkGatewayLiveness`
 * returns false) causes all subsequent `providerExists` calls to return "error"
 * rather than "absent", preventing a flaky gateway from being mis-recorded as
 * "no providers" and permanently suppressing future backfill retries.
 */
export function createMessagingConflictProbe(
  deps: MessagingConflictProbeGatewayDeps,
): MessagingConflictProbe {
  let alive: boolean | null = null;
  return {
    providerExists: (name) => {
      if (alive === null) alive = deps.checkGatewayLiveness();
      if (!alive) return "error";
      return deps.providerExists(name) ? "present" : "absent";
    },
  };
}

// ---------------------------------------------------------------------------
// Plan-to-request helpers
// ---------------------------------------------------------------------------

/**
 * Return the channel IDs that are active (not disabled) in a compiled plan.
 */
export function getActiveChannelIdsFromPlan(plan: SandboxMessagingPlan): string[] {
  const disabled = new Set(plan.disabledChannels);
  return plan.channels.filter((c) => !disabled.has(c.channelId)).map((c) => c.channelId);
}

/**
 * Return credential hashes keyed by providerEnvKey from a compiled plan.
 * Only bindings that have a `credentialHash` (i.e. the credential was present
 * when the plan was compiled) are included.
 */
export function getCredentialHashesFromPlan(plan: SandboxMessagingPlan): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const b of plan.credentialBindings) {
    if (b.credentialHash) hashes[b.providerEnvKey] = b.credentialHash;
  }
  return hashes;
}

/**
 * Build a `ConflictRequest[]` from a compiled plan's credential bindings.
 *
 * Groups bindings by channelId (e.g. Slack has SLACK_BOT_TOKEN and
 * SLACK_APP_TOKEN) and excludes:
 *   - channels in `plan.disabledChannels` (bridge is paused, not in use)
 *   - bindings without a `credentialHash` (credential was not supplied)
 *
 * The result feeds directly into `findConflictsInEntries`.
 */
export function planToConflictChannelRequests(plan: SandboxMessagingPlan): ConflictRequest[] {
  const disabledSet = new Set(plan.disabledChannels);
  const byChannel = new Map<string, Record<string, string>>();

  for (const binding of plan.credentialBindings) {
    if (disabledSet.has(binding.channelId) || !binding.credentialHash) continue;
    const hashes = byChannel.get(binding.channelId) ?? {};
    hashes[binding.providerEnvKey] = binding.credentialHash;
    byChannel.set(binding.channelId, hashes);
  }

  return Array.from(byChannel.entries()).map(([channel, credentialHashes]) => ({
    channel,
    credentialHashes,
  }));
}

// ---------------------------------------------------------------------------
// Entry resolution — plan-preferred, legacy-fallback
// ---------------------------------------------------------------------------

/**
 * Return the active (non-disabled) channel IDs for a registry entry.
 * Prefers `entry.messaging.plan` data; falls back to the legacy
 * `messagingChannels`/`disabledChannels` flat fields for entries that predate
 * the plan architecture. Returns `null` when the entry has neither.
 */
export function resolveActiveChannelsFromEntry(
  entry: ConflictRegistryEntry,
): string[] | null {
  if (entry.messaging?.plan) {
    return getActiveChannelIdsFromPlan(entry.messaging.plan);
  }
  if (!Array.isArray(entry.messagingChannels)) return null;
  const disabled = new Set(Array.isArray(entry.disabledChannels) ? entry.disabledChannels : []);
  return (entry.messagingChannels as string[]).filter((c) => !disabled.has(c));
}

/**
 * Return credential hashes keyed by providerEnvKey for a registry entry.
 * Prefers `entry.messaging.plan` credential bindings; falls back to the legacy
 * `providerCredentialHashes` flat field.
 */
export function resolveCredentialHashesFromEntry(
  entry: ConflictRegistryEntry,
): Record<string, string> {
  if (entry.messaging?.plan) return getCredentialHashesFromPlan(entry.messaging.plan);
  return (entry.providerCredentialHashes as Record<string, string>) ?? {};
}

// ---------------------------------------------------------------------------
// Detection — pure functions operating on ConflictRegistryEntry
// ---------------------------------------------------------------------------

/**
 * True when `channel` is active (present and not disabled) in `entry`.
 * Disabled channels must not block another sandbox from claiming the same
 * token — the bridge is paused so the credential is not in use.
 */
export function hasStoredChannelInEntry(
  entry: ConflictRegistryEntry,
  channel: string,
): boolean {
  return resolveActiveChannelsFromEntry(entry)?.includes(channel) ?? false;
}

/**
 * Determine the conflict reason between `entry`'s stored state and a new
 * channel request, or `null` if there is no conflict.
 *
 * Comparison keys are derived from stored hashes first (authoritative), then
 * from requested hashes if stored is empty (legacy entries with no hashes).
 * This removes the need for concrete channel-constant lookups.
 */
export function conflictReasonForRequest(
  entry: ConflictRegistryEntry,
  request: ConflictRequest,
): ConflictReason | null {
  if (!hasStoredChannelInEntry(entry, request.channel)) return null;
  const requestedHashes = request.credentialHashes ?? {};
  const storedHashes = resolveCredentialHashesFromEntry(entry);
  const keys =
    Object.keys(storedHashes).length > 0
      ? Object.keys(storedHashes)
      : Object.keys(requestedHashes);
  if (keys.length === 0) return "unknown-token";

  let sawUnknown = false;
  for (const key of keys) {
    const rh = (requestedHashes[key] as string | null | undefined) ?? null;
    const sh = storedHashes[key] ?? null;
    if (rh && sh) {
      if (rh === sh) return "matching-token";
      continue;
    }
    sawUnknown = true;
  }
  return sawUnknown ? "unknown-token" : null;
}

/**
 * Determine the conflict reason between two registry entries sharing `channel`,
 * or `null` if there is no conflict. Returns each pair at most once (the
 * caller is responsible for ordered iteration).
 */
export function conflictReasonForPair(
  channel: string,
  left: ConflictRegistryEntry,
  right: ConflictRegistryEntry,
): ConflictReason | null {
  if (!hasStoredChannelInEntry(left, channel) || !hasStoredChannelInEntry(right, channel)) {
    return null;
  }
  const lh = resolveCredentialHashesFromEntry(left);
  const rh = resolveCredentialHashesFromEntry(right);
  const keys = [...new Set([...Object.keys(lh), ...Object.keys(rh)])];
  if (keys.length === 0) return "unknown-token";

  let sawUnknown = false;
  for (const key of keys) {
    const l = lh[key] ?? null;
    const r = rh[key] ?? null;
    if (l && r) {
      if (l === r) return "matching-token";
      continue;
    }
    sawUnknown = true;
  }
  return sawUnknown ? "unknown-token" : null;
}

/**
 * Return every (channel, other-sandbox) pair where another entry already has
 * one of the requested channels in use with either a matching credential hash
 * or insufficient hash metadata to prove it differs.
 */
export function findConflictsInEntries(
  currentSandbox: string | null,
  requests: readonly ConflictRequest[],
  entries: readonly ConflictRegistryEntry[],
): ConflictMatch[] {
  const others = entries.filter(
    (e) =>
      e.name !== currentSandbox &&
      (Array.isArray(e.messagingChannels) || e.messaging?.plan != null),
  );
  return requests.flatMap((request) =>
    others.flatMap((entry) => {
      const reason = conflictReasonForRequest(entry, request);
      return reason ? [{ channel: request.channel, sandbox: entry.name, reason }] : [];
    }),
  );
}

/**
 * Detect overlaps across all entries, returning each pair at most once.
 * Used by `nemoclaw status` to surface sandboxes that already share a token.
 */
export function detectAllOverlapsInEntries(
  entries: readonly ConflictRegistryEntry[],
): Array<{ channel: string; sandboxes: [string, string]; reason: ConflictReason }> {
  const byChannel = new Map<string, ConflictRegistryEntry[]>();
  for (const entry of entries) {
    const activeChannels = resolveActiveChannelsFromEntry(entry);
    if (!activeChannels) continue;
    for (const channel of activeChannels) {
      const list = byChannel.get(channel) ?? [];
      list.push(entry);
      byChannel.set(channel, list);
    }
  }

  const overlaps: Array<{
    channel: string;
    sandboxes: [string, string];
    reason: ConflictReason;
  }> = [];
  for (const [channel, channelEntries] of byChannel) {
    if (channelEntries.length < 2) continue;
    for (let i = 0; i < channelEntries.length; i += 1) {
      for (let j = i + 1; j < channelEntries.length; j += 1) {
        const reason = conflictReasonForPair(channel, channelEntries[i], channelEntries[j]);
        if (reason) {
          overlaps.push({
            channel,
            sandboxes: [channelEntries[i].name, channelEntries[j].name],
            reason,
          });
        }
      }
    }
  }
  return overlaps;
}

/**
 * For entries missing `messagingChannels`, probe OpenShell to infer which
 * channels the sandbox was onboarded with, and call `updateEntry` for each
 * resolved sandbox. Safe to call repeatedly — entries with `messagingChannels`
 * already set are skipped. Probe errors abort the write for that sandbox so a
 * flaky gateway does not permanently hide real overlaps.
 */
export function backfillLegacyEntryChannels(
  entries: readonly ConflictRegistryEntry[],
  probe: MessagingConflictProbe,
  updateEntry: (name: string, channels: string[]) => void,
): void {
  for (const entry of entries) {
    if (Array.isArray(entry.messagingChannels)) continue;
    const discovered: string[] = [];
    let probeFailed = false;
    for (const channel of KNOWN_CHANNEL_IDS) {
      const providerName = `${entry.name}${PROVIDER_SUFFIXES[channel]}`;
      let state: ProbeResult;
      try {
        state = probe.providerExists(providerName);
      } catch {
        state = "error";
      }
      if (state === "present") {
        discovered.push(channel);
      } else if (state === "error") {
        probeFailed = true;
        break;
      }
    }
    if (!probeFailed) {
      updateEntry(entry.name, discovered);
    }
  }
}
