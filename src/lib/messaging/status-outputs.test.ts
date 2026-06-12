// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { ChannelManifest } from "./manifest";
import { collectMessagingStatusOutputs } from "./status-outputs";

describe("messaging status outputs", () => {
  it("does not collect status hooks from manifests outside the requested agent", () => {
    const manifests: ChannelManifest[] = [
      {
        schemaVersion: 1,
        id: "hermes-only",
        displayName: "Hermes Only",
        supportedAgents: ["hermes"],
        auth: { mode: "none" },
        inputs: [],
        credentials: [],
        render: [],
        state: {},
        hooks: [
          {
            id: "hermes-status",
            phase: "status",
            handler: "common.staticOutputs",
            outputs: [
              {
                id: "gatewayOverlap",
                kind: "status",
                value: {
                  type: "single-gateway-channel-overlap",
                  reason: "hermes-only",
                  message: "Hermes-only overlap",
                },
              },
            ],
          },
        ],
      },
    ];

    expect(collectMessagingStatusOutputs(manifests, { agent: "openclaw" })).toEqual([]);
    expect(collectMessagingStatusOutputs(manifests, { agent: "hermes" })).toHaveLength(1);
  });
});
