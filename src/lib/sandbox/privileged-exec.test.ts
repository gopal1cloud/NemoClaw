// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Build must run before these tests (imports from dist/)
const require = createRequire(import.meta.url);
const {
  containerNameMatchesSandbox,
  selectDirectSandboxContainer,
} = require("../../../dist/lib/sandbox/privileged-exec");

describe("privileged sandbox exec routing", () => {
  it("matches only the requested OpenShell sandbox container name pattern", () => {
    expect(containerNameMatchesSandbox("openshell-demo", "demo")).toBe(true);
    expect(containerNameMatchesSandbox("openshell-demo-abc123", "demo")).toBe(true);
    expect(containerNameMatchesSandbox("openshell-demolition", "demo")).toBe(false);
    expect(containerNameMatchesSandbox("openshell-gateway-nemoclaw", "demo")).toBe(false);
  });

  it("prefers the exact direct sandbox container when present", () => {
    const selected = selectDirectSandboxContainer(
      "demo",
      "openshell-demo-helper\nopenshell-demo\n",
      ["demo"],
    );

    expect(selected).toBe("openshell-demo");
  });

  it("falls back to a generated direct sandbox container suffix", () => {
    const selected = selectDirectSandboxContainer(
      "demo",
      "openshell-other\nopenshell-demo-abc123\n",
      ["demo"],
    );

    expect(selected).toBe("openshell-demo-abc123");
  });

  it("uses the longest registered sandbox-name match to avoid prefix collisions", () => {
    const containerNames = [
      "openshell-alpha-child",
      "openshell-alpha-child-2026",
      "openshell-alpha-abc123",
    ].join("\n");

    expect(
      selectDirectSandboxContainer("alpha", containerNames, [
        "alpha",
        "alpha-child",
      ]),
    ).toBe("openshell-alpha-abc123");
    expect(
      selectDirectSandboxContainer("alpha-child", containerNames, [
        "alpha",
        "alpha-child",
      ]),
    ).toBe("openshell-alpha-child");
  });

  it("does not consider unrelated OpenShell containers direct sandbox matches", () => {
    expect(
      selectDirectSandboxContainer(
        "alpha",
        "openshell-gateway-nemoclaw\nopenshell-alpha-child\n",
        ["alpha", "alpha-child"],
      ),
    ).toBeNull();
  });
});
