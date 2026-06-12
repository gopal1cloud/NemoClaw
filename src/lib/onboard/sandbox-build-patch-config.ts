// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  type MessagingChannelConfig,
  readMessagingChannelConfigFromEnv,
} from "../messaging-channel-config";

export type SandboxBuildPatchConfig = {
  messagingChannelConfig: MessagingChannelConfig | null;
};

export type SandboxBuildPatchConfigDeps = {
  readMessagingChannelConfigFromEnv?(env?: NodeJS.ProcessEnv): MessagingChannelConfig | null;
};

export type PrepareSandboxBuildPatchConfigInput = {
  configuredMessagingChannels?: readonly string[];
  env?: NodeJS.ProcessEnv;
  deps?: SandboxBuildPatchConfigDeps;
};

export function prepareSandboxBuildPatchConfig({
  env = process.env,
  deps = {},
}: PrepareSandboxBuildPatchConfigInput): SandboxBuildPatchConfig {
  // Dockerfile messaging rendering is sourced from the manifest plan. Reading
  // env config here validates operator-provided channel config before build;
  // durable replay lives in SandboxEntry.messaging.plan.
  const messagingChannelConfig = (
    deps.readMessagingChannelConfigFromEnv ?? readMessagingChannelConfigFromEnv
  )(env);
  return {
    messagingChannelConfig,
  };
}
