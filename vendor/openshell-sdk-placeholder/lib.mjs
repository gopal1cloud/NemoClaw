// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const MESSAGE =
  "@openshell/sdk is not published yet. This NemoClaw draft vendors only the SDK type surface " +
  "so CI can build; replace vendor/openshell-sdk-placeholder with the OpenShell-published " +
  "@openshell/sdk package before running SDK-backed sandbox operations.";

export class OpenShellClient {
  static async connect() {
    throw new Error(MESSAGE);
  }
}

export class OidcRefresher {
  constructor(initialToken, _initialExpiresAt, callback) {
    this.token = initialToken;
    this.callback = callback;
  }

  currentToken() {
    return this.token;
  }

  async refresh() {
    const refreshed = await this.callback();
    this.token = refreshed.accessToken;
    return this.token;
  }
}
