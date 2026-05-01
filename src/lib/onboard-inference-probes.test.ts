// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

const { getChatCompletionsProbePayload } = require("../../dist/lib/onboard-inference-probes");

describe("OpenAI-compatible inference probes", () => {
  it("uses the NVIDIA Build request shape for DeepSeek V4 Pro", () => {
    expect(getChatCompletionsProbePayload("deepseek-ai/deepseek-v4-pro")).toEqual({
      model: "deepseek-ai/deepseek-v4-pro",
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      temperature: 1,
      top_p: 0.95,
      max_tokens: 8192,
      chat_template_kwargs: { thinking: false },
      stream: true,
    });
  });

  it("keeps the default chat-completions probe minimal for other models", () => {
    expect(getChatCompletionsProbePayload("nvidia/nemotron-3-super-120b-a12b")).toEqual({
      model: "nvidia/nemotron-3-super-120b-a12b",
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
    });
  });
});
