// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.join(import.meta.dirname, "..");
const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

describe("messaging runtime preload packaging", () => {
  it("packages compiled preload JavaScript instead of raw TypeScript renamed to .js", () => {
    expect(dockerfile).toContain("AS runtime-preload-builder");
    expect(dockerfile).toContain("./node_modules/.bin/tsc -p tsconfig.src.json");
    expect(dockerfile).toContain(
      "COPY --from=runtime-preload-builder /opt/nemoclaw-root/dist/lib/messaging/channels/",
    );
    expect(dockerfile).toContain("-path '*/runtime/*.js'");
    expect(dockerfile).not.toContain(
      "COPY src/lib/messaging/channels/*/runtime/*.ts /usr/local/lib/nemoclaw/preloads-ts/",
    );
    expect(dockerfile).not.toContain('basename "$file" .ts');
  });
});
