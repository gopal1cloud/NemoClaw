// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { resolveSandboxOclifDispatch } from "./legacy-oclif-dispatch";

describe("resolveSandboxOclifDispatch", () => {
  it("keeps sandbox status on the direct runtime path", () => {
    expect(resolveSandboxOclifDispatch("alpha", "status", [])).toEqual({
      kind: "legacy",
      target: "status",
    });
  });

  it("keeps sandbox status help public", () => {
    expect(resolveSandboxOclifDispatch("alpha", "status", ["--help"])).toEqual({
      kind: "help",
      usage: "status",
    });
  });
});
