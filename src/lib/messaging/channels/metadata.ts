// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type {
  ChannelHookOutputSpec,
  ChannelManifest,
  ChannelPolicyPresetReference,
  ChannelPolicyPresetSpec,
  MessagingAgentId,
  MessagingSerializableObject,
  MessagingSerializableValue,
} from "../manifest";
import { BUILT_IN_CHANNEL_MANIFESTS } from "./built-ins";

export interface MessagingManifestMetadataOptions {
  readonly agent?: MessagingAgentId;
  readonly manifests?: readonly ChannelManifest[];
}

export interface MessagingCredentialMetadata {
  readonly channelId: string;
  readonly credentialId: string;
  readonly sourceInput: string;
  readonly providerNameTemplate: string;
  readonly providerNameSuffix: string;
  readonly providerEnvKey: string;
  readonly placeholder: string;
}

export interface MessagingConfigEnvMetadata {
  readonly channelId: string;
  readonly inputId: string;
  readonly envKey: string;
  readonly envAliases: readonly string[];
  readonly statePath?: string;
  readonly validValues?: readonly string[];
}

export interface MessagingPolicyPresetMetadata {
  readonly channelId: string;
  readonly presetName: string;
  readonly policyKeys: readonly string[];
  readonly agentPolicyKeys: Partial<Record<MessagingAgentId, readonly string[]>>;
  readonly requiredAtCreate: boolean;
  readonly validationWarningLines: readonly string[];
}

export interface OpenClawRuntimeChannelMetadata {
  readonly channelId: string;
  readonly hookId: string;
  readonly outputId: string;
  readonly configKeys: readonly string[];
  readonly logPatterns: readonly string[];
}

export interface MessagingPackageInstallMetadata {
  readonly channelId: string;
  readonly hookId: string;
  readonly outputId: string;
  readonly agents: readonly MessagingAgentId[];
  readonly manager?: string;
  readonly spec?: string;
  readonly pin?: boolean;
}

export function listBuiltInMessagingChannelManifests(
  options: MessagingManifestMetadataOptions = {},
): ChannelManifest[] {
  return selectManifests(options);
}

export function listAvailableMessagingChannelIds(
  options: MessagingManifestMetadataOptions = {},
): string[] {
  return selectManifests(options).map((manifest) => manifest.id);
}

export function listMessagingCredentialMetadata(
  options: MessagingManifestMetadataOptions = {},
): MessagingCredentialMetadata[] {
  return selectManifests(options).flatMap((manifest) =>
    manifest.credentials.map((credential) => ({
      channelId: manifest.id,
      credentialId: credential.id,
      sourceInput: credential.sourceInput,
      providerNameTemplate: credential.providerName,
      providerNameSuffix: providerNameSuffix(credential.providerName),
      providerEnvKey: credential.providerEnvKey,
      placeholder: credential.placeholder,
    })),
  );
}

export function getMessagingCredentialEnvKeysByChannel(
  options: MessagingManifestMetadataOptions = {},
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    selectManifests(options).map((manifest) => [
      manifest.id,
      manifest.credentials.map((credential) => credential.providerEnvKey),
    ]),
  );
}

export function getMessagingChannelForCredentialEnvKey(
  envKey: string,
  options: MessagingManifestMetadataOptions = {},
): string | null {
  return (
    listMessagingCredentialMetadata(options).find(
      (credential) => credential.providerEnvKey === envKey,
    )?.channelId ?? null
  );
}

export function getMessagingProviderSuffixesByChannel(
  options: MessagingManifestMetadataOptions = {},
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    selectManifests(options).flatMap((manifest) => {
      const suffixes = manifest.credentials.map((credential) =>
        providerNameSuffix(credential.providerName),
      );
      return suffixes.length > 0 ? [[manifest.id, suffixes]] : [];
    }),
  );
}

export function listMessagingProviderSuffixes(
  options: MessagingManifestMetadataOptions = {},
): string[] {
  return uniqueStrings(
    listMessagingCredentialMetadata(options).map((credential) => credential.providerNameSuffix),
  );
}

export function listMessagingProviderNamesForChannel(
  sandboxName: string,
  channelId: string,
  options: MessagingManifestMetadataOptions = {},
): string[] {
  const manifest = selectManifests(options).find((entry) => entry.id === channelId);
  if (!manifest) return [];
  return manifest.credentials.map((credential) =>
    credential.providerName.replaceAll("{sandboxName}", sandboxName),
  );
}

export function listMessagingConfigEnvMetadata(
  options: MessagingManifestMetadataOptions = {},
): MessagingConfigEnvMetadata[] {
  return selectManifests(options).flatMap((manifest) =>
    manifest.inputs.flatMap((input) => {
      if (input.kind !== "config" || !input.envKey) return [];
      return [
        {
          channelId: manifest.id,
          inputId: input.id,
          envKey: input.envKey,
          envAliases: input.envAliases ?? [],
          ...(input.statePath ? { statePath: input.statePath } : {}),
          ...(input.validValues ? { validValues: input.validValues } : {}),
        },
      ];
    }),
  );
}

export function listMessagingConfigEnvKeys(
  options: MessagingManifestMetadataOptions = {},
): string[] {
  return uniqueStrings(listMessagingConfigEnvMetadata(options).map((input) => input.envKey));
}

export function getMessagingConfigEnvAliases(
  options: MessagingManifestMetadataOptions = {},
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    listMessagingConfigEnvMetadata(options)
      .filter((input) => input.envAliases.length > 0)
      .map((input) => [input.envKey, input.envAliases]),
  );
}

export function listMessagingPolicyPresetMetadata(
  options: MessagingManifestMetadataOptions = {},
): MessagingPolicyPresetMetadata[] {
  return selectManifests(options).flatMap((manifest) =>
    (manifest.policyPresets ?? []).map((preset) => {
      const normalized = normalizePolicyPreset(preset);
      return {
        channelId: manifest.id,
        presetName: normalized.name,
        policyKeys: normalized.policyKeys ?? [normalized.name],
        agentPolicyKeys: normalized.agentPolicyKeys ?? {},
        requiredAtCreate: normalized.requiredAtCreate === true,
        validationWarningLines: normalized.validationWarningLines ?? [],
      };
    }),
  );
}

export function getMessagingPolicyKeysByChannel(
  options: MessagingManifestMetadataOptions = {},
): Readonly<Record<string, readonly string[]>> {
  const result: Record<string, string[]> = {};
  for (const preset of listMessagingPolicyPresetMetadata(options)) {
    const keys = options.agent
      ? (preset.agentPolicyKeys[options.agent] ?? preset.policyKeys)
      : preset.policyKeys;
    result[preset.channelId] = uniqueStrings([...(result[preset.channelId] ?? []), ...keys]);
  }
  return result;
}

export function listRequiredCreateTimeMessagingPolicyPresetNames(
  options: MessagingManifestMetadataOptions = {},
): string[] {
  return uniqueStrings(
    listMessagingPolicyPresetMetadata(options)
      .filter((preset) => preset.requiredAtCreate)
      .map((preset) => preset.presetName),
  );
}

export function listRequiredCreateTimeMessagingPolicyPresetsByChannel(
  options: MessagingManifestMetadataOptions = {},
): Readonly<Record<string, readonly string[]>> {
  const result: Record<string, string[]> = {};
  for (const preset of listMessagingPolicyPresetMetadata(options)) {
    if (!preset.requiredAtCreate) continue;
    result[preset.channelId] = uniqueStrings([
      ...(result[preset.channelId] ?? []),
      preset.presetName,
    ]);
  }
  return result;
}

export function getMessagingPolicyKeyAliases(
  options: MessagingManifestMetadataOptions = {},
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    listMessagingPolicyPresetMetadata(options).map((preset) => [
      preset.presetName,
      uniqueStrings([
        ...preset.policyKeys,
        ...Object.values(preset.agentPolicyKeys).flatMap((keys) => keys ?? []),
      ]),
    ]),
  );
}

export function getMessagingPolicyPresetValidationWarnings(
  options: MessagingManifestMetadataOptions = {},
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    listMessagingPolicyPresetMetadata(options)
      .filter((preset) => preset.validationWarningLines.length > 0)
      .map((preset) => [preset.presetName, preset.validationWarningLines]),
  );
}

export function listOpenClawRuntimeChannelMetadata(
  options: MessagingManifestMetadataOptions = {},
): OpenClawRuntimeChannelMetadata[] {
  return selectManifests({ ...options, agent: "openclaw" }).flatMap((manifest) =>
    manifest.hooks.flatMap((hook) => {
      if (hook.phase !== "status" || !hookTargetsAgent(hook.agents, "openclaw")) return [];
      return (hook.outputs ?? []).flatMap((output) => {
        if (output.kind !== "status") return [];
        const value = serializableObject(output.value);
        if (value?.type !== "openclaw-runtime-channel") return [];
        return [
          {
            channelId: manifest.id,
            hookId: hook.id,
            outputId: output.id,
            configKeys: stringArray(value.configKeys),
            logPatterns: stringArray(value.logPatterns),
          },
        ];
      });
    }),
  );
}

export function listMessagingPackageInstallSpecs(
  options: MessagingManifestMetadataOptions = {},
): MessagingPackageInstallMetadata[] {
  return selectManifests(options).flatMap((manifest) =>
    manifest.hooks.flatMap((hook) => {
      if (hook.phase !== "agent-install") return [];
      if (options.agent && !hookTargetsAgent(hook.agents, options.agent)) return [];
      return (hook.outputs ?? []).flatMap((output) => {
        if (output.kind !== "package-install") return [];
        const value = serializableObject(output.value);
        return [
          {
            channelId: manifest.id,
            hookId: hook.id,
            outputId: output.id,
            agents: hook.agents ?? [],
            ...packageInstallValue(value),
          },
        ];
      });
    }),
  );
}

function selectManifests(options: MessagingManifestMetadataOptions): ChannelManifest[] {
  const manifests = options.manifests ?? BUILT_IN_CHANNEL_MANIFESTS;
  const agent = options.agent;
  const selected = agent
    ? manifests.filter((manifest) => manifest.supportedAgents.includes(agent))
    : manifests;
  return [...selected];
}

function providerNameSuffix(providerNameTemplate: string): string {
  return providerNameTemplate.replaceAll("{sandboxName}", "");
}

function normalizePolicyPreset(preset: ChannelPolicyPresetReference): ChannelPolicyPresetSpec {
  return typeof preset === "string" ? { name: preset } : preset;
}

function hookTargetsAgent(
  agents: readonly MessagingAgentId[] | undefined,
  agent: MessagingAgentId,
): boolean {
  return agents === undefined || agents.includes(agent);
}

function serializableObject(
  value: ChannelHookOutputSpec["value"],
): MessagingSerializableObject | null {
  return isSerializableObject(value) ? value : null;
}

function packageInstallValue(
  value: MessagingSerializableObject | null,
): Pick<MessagingPackageInstallMetadata, "manager" | "spec" | "pin"> {
  if (!value) return {};
  return {
    ...(typeof value.manager === "string" ? { manager: value.manager } : {}),
    ...(typeof value.spec === "string" ? { spec: value.spec } : {}),
    ...(typeof value.pin === "boolean" ? { pin: value.pin } : {}),
  };
}

function isSerializableObject(
  value: MessagingSerializableValue | undefined,
): value is MessagingSerializableObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: MessagingSerializableValue | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
