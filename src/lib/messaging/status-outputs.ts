// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { createBuiltInChannelManifestRegistry } from "./channels";
import type { ChannelManifest, MessagingAgentId, MessagingSerializableValue } from "./manifest";

export type MessagingStatusOutput =
  | OpenClawRuntimeChannelStatusOutput
  | GatewayLogConflictCounterStatusOutput
  | SingleGatewayChannelOverlapStatusOutput;

export interface MessagingStatusOutputBase {
  readonly channelId: string;
  readonly hookId: string;
  readonly outputId: string;
}

export interface OpenClawRuntimeChannelStatusOutput extends MessagingStatusOutputBase {
  readonly type: "openclaw-runtime-channel";
  readonly configKeys: readonly string[];
  readonly logPatterns: readonly string[];
}

export interface GatewayLogConflictCounterStatusOutput extends MessagingStatusOutputBase {
  readonly type: "gateway-log-conflict-counter";
  readonly logFile: string;
  readonly maxLogLines: number;
  readonly pattern: string;
  readonly flags: string;
}

export interface SingleGatewayChannelOverlapStatusOutput extends MessagingStatusOutputBase {
  readonly type: "single-gateway-channel-overlap";
  readonly reason: string;
  readonly message: string;
}

export function collectBuiltInMessagingStatusOutputs(
  options: { readonly agent?: MessagingAgentId } = {},
): MessagingStatusOutput[] {
  return collectMessagingStatusOutputs(createBuiltInChannelManifestRegistry().list(), options);
}

export function collectMessagingStatusOutputs(
  manifests: readonly ChannelManifest[],
  options: {
    readonly agent?: MessagingAgentId;
  } = {},
): MessagingStatusOutput[] {
  const outputs: MessagingStatusOutput[] = [];
  for (const manifest of manifests) {
    for (const hook of manifest.hooks) {
      if (hook.phase !== "status") continue;
      if (options.agent && hook.agents && !hook.agents.includes(options.agent)) continue;
      for (const output of hook.outputs ?? []) {
        if (output.kind !== "status" || output.value === undefined) continue;
        const parsed = parseMessagingStatusOutput(manifest.id, hook.id, output.id, output.value);
        if (parsed) outputs.push(parsed);
      }
    }
  }
  return outputs;
}

function parseMessagingStatusOutput(
  channelId: string,
  hookId: string,
  outputId: string,
  value: MessagingSerializableValue,
): MessagingStatusOutput | null {
  if (!isObjectRecord(value) || typeof value.type !== "string") return null;
  const base = { channelId, hookId, outputId };
  if (value.type === "openclaw-runtime-channel") {
    const configKeys = stringArray(value.configKeys);
    const logPatterns = stringArray(value.logPatterns);
    if (configKeys.length === 0 || logPatterns.length === 0) return null;
    return {
      ...base,
      type: "openclaw-runtime-channel",
      configKeys,
      logPatterns,
    };
  }
  if (value.type === "gateway-log-conflict-counter") {
    const logFile = stringField(value, "logFile");
    const pattern = stringField(value, "pattern");
    if (!logFile || !pattern) return null;
    return {
      ...base,
      type: "gateway-log-conflict-counter",
      logFile,
      maxLogLines: maxLogLines(value.maxLogLines),
      pattern,
      flags: stringField(value, "flags") ?? "i",
    };
  }
  if (value.type === "single-gateway-channel-overlap") {
    const reason = stringField(value, "reason");
    const message = stringField(value, "message");
    if (!reason || !message) return null;
    return {
      ...base,
      type: "single-gateway-channel-overlap",
      reason,
      message,
    };
  }
  return null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function maxLogLines(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 200;
  return Math.min(Math.max(Math.trunc(value), 1), 2000);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
