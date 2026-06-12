// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { MessagingHookRegistration } from "../../../hooks/types";
import {
  createSlackSocketModeGatewayConflictHookRegistration,
  type SlackSocketModeGatewayConflictHookOptions,
} from "./socket-mode-gateway-conflict";
import {
  createSlackValidateCredentialsHookRegistration,
  type SlackValidateCredentialsHookOptions,
} from "./validate-credentials";

export * from "./credential-validation";
export * from "./socket-mode-gateway-conflict";
export * from "./validate-credentials";

export interface SlackHookOptions {
  readonly socketModeGatewayConflict?: SlackSocketModeGatewayConflictHookOptions;
  readonly validateCredentials?: SlackValidateCredentialsHookOptions;
}

export function createSlackHookRegistrations(
  options: SlackHookOptions = {},
): readonly MessagingHookRegistration[] {
  return [
    createSlackSocketModeGatewayConflictHookRegistration(
      withoutUndefinedValues(options.socketModeGatewayConflict),
    ),
    createSlackValidateCredentialsHookRegistration(
      withoutUndefinedValues(options.validateCredentials),
    ),
  ] as const;
}

function withoutUndefinedValues<T extends object>(options: T | undefined): T {
  return Object.fromEntries(
    Object.entries(options ?? {}).filter(([, value]) => value !== undefined),
  ) as T;
}
