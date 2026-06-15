// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { testTimeoutOptions } from "./helpers/timeouts";

// Regression guard for #5441. In non-interactive `onboard --recreate-sandbox`
// the NVIDIA Endpoints ("build") provider is recovered from the existing
// sandbox's saved gateway state. The OpenShell gateway already holds the
// validated credential and nothing is written to disk, so the host process has
// no local API key. The flow used to probe the endpoint anyway — unauthenticated
// — and abort at [3/8] with "endpoint validation failed". It must instead reuse
// the gateway credential and skip endpoint re-validation.
const REPO_ROOT = path.join(import.meta.dirname, "..");

describe("onboard build recreate credential reuse (#5441)", () => {
  it(
    "reuses the gateway credential and skips endpoint re-validation when no local key is staged",
    testTimeoutOptions(90_000),
    () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-build-recreate-"));
      const fakeBin = path.join(tmpDir, "bin");
      const home = path.join(tmpDir, "home");
      const scriptPath = path.join(tmpDir, "setup-nim-recreate.cjs");
      const curlLogPath = path.join(tmpDir, "curl-probes.log");
      const onboardPath = JSON.stringify(path.join(REPO_ROOT, "dist", "lib", "onboard.js"));

      fs.mkdirSync(fakeBin, { recursive: true });
      fs.mkdirSync(home, { recursive: true });

      // Fake openshell: the gateway already holds an nvidia-prod inference route
      // (recovered via `inference get`) and the provider exists (`provider get`
      // returns success). Everything else is a no-op success.
      fs.writeFileSync(
        path.join(fakeBin, "openshell"),
        `#!/usr/bin/env bash
if [ "$1" = "inference" ] && [ "$2" = "get" ]; then
  cat <<'EOF'
Gateway inference:

  Route: inference.local
  Provider: nvidia-prod
  Model: nvidia/llama-3.3-nemotron-super-49b-v1
  Version: 1
EOF
  exit 0
fi
if [ "$1" = "provider" ] && [ "$2" = "get" ]; then
  exit 0
fi
exit 0
`,
        { mode: 0o755 },
      );

      // Fake curl logs every invocation and fails. If the fix regresses and the
      // endpoint probe runs, it would call curl and the run would abort — the
      // assertions below catch both the abort and the unexpected probe.
      fs.writeFileSync(
        path.join(fakeBin, "curl"),
        `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$NEMOCLAW_FAKE_CURL_LOG"
exit 1
`,
        { mode: 0o755 },
      );

      fs.writeFileSync(
        scriptPath,
        String.raw`
process.env.NEMOCLAW_NON_INTERACTIVE = "1";
process.env.NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE = "1";
process.env.NEMOCLAW_TEST_NO_SLEEP = "1";
// Critically: NVIDIA_INFERENCE_API_KEY is NOT set — the credential lives only
// in the gateway, mirroring an interactive onboard that typed the key.
delete process.env.NVIDIA_INFERENCE_API_KEY;
delete process.env.NVIDIA_API_KEY;
delete process.env.NEMOCLAW_PROVIDER_KEY;
delete process.env.NEMOCLAW_PROVIDER;

const { setupNim } = require(${onboardPath});

(async () => {
  const result = await setupNim(null, "rg-test-noninter", null);
  console.log(JSON.stringify({ outcome: "resolved", provider: result.provider }));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  console.log(JSON.stringify({ outcome: "rejected" }));
  process.exitCode = 3;
});
`,
      );

      try {
        const result = spawnSync(process.execPath, [scriptPath], {
          cwd: REPO_ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            HOME: home,
            PATH: `${fakeBin}:${process.env.PATH || ""}`,
            VITEST: "false",
            NEMOCLAW_TEST_NO_SLEEP: "1",
            NEMOCLAW_FAKE_CURL_LOG: curlLogPath,
            NVIDIA_INFERENCE_API_KEY: "",
            NVIDIA_API_KEY: "",
          },
          timeout: 80_000,
        });

        const output = `${result.stdout || ""}\n${result.stderr || ""}`;
        assert.equal(
          result.status,
          0,
          `setupNim aborted non-interactive build recreate instead of reusing the gateway credential; output:\n${output}`,
        );
        assert.match(
          output,
          /Reusing existing gateway credential; skipping endpoint re-validation\./,
          `setupNim did not reuse the gateway credential; output:\n${output}`,
        );
        assert.match(
          output,
          /"outcome":"resolved"/,
          `setupNim did not resolve the build provider selection; output:\n${output}`,
        );
        assert.match(
          output,
          /"provider":"nvidia-prod"/,
          `setupNim did not select the recovered nvidia-prod provider; output:\n${output}`,
        );

        const curlLog = fs.existsSync(curlLogPath) ? fs.readFileSync(curlLogPath, "utf8") : "";
        assert.ok(
          !curlLog.includes("/chat/completions") && !curlLog.includes("/responses"),
          `setupNim probed the endpoint despite having no local credential; curl log:\n${curlLog}`,
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );
});
