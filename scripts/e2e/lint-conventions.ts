#!/usr/bin/env tsx
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * E2E convention lint for the hybrid scenario architecture.
 *
 * Supported paths are typed scenarios, manifests, assertion modules, and suite
 * implementation scripts. New top-level `test/e2e/test-*.sh` entrypoints are
 * blocked so all scenario coverage flows through `test/e2e/scenarios/run.ts`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Rule {
  id: string;
  describe: string;
  test: (body: string) => string | null;
}

const STEP_RULES: Rule[] = [
  {
    id: "no-noninteractive-reexport",
    describe: "suite step re-exports non-interactive env vars",
    test: (body) => {
      const patterns = [
        /export\s+DEBIAN_FRONTEND\s*=\s*noninteractive/,
        /export\s+NEMOCLAW_NON_INTERACTIVE\s*=\s*1/,
      ];
      for (const p of patterns) {
        if (p.test(body))
          return `matched ${p.source}; non-interactive setup belongs to shared runtime helpers`;
      }
      return null;
    },
  },
  {
    id: "no-own-trap",
    describe: "suite step registers its own trap",
    test: (body) => {
      for (const raw of body.split("\n")) {
        const line = raw.trimStart();
        if (line.startsWith("#")) continue;
        if (/^trap\s+[^#]/.test(line))
          return "registered own trap; cleanup belongs to orchestrators/shared helpers";
      }
      return null;
    },
  },
  {
    id: "no-section-helper",
    describe: "suite step calls section helper directly",
    test: (body) =>
      /^\s*section\s+["']/m.test(body) || /^\s*section\s*\(/m.test(body)
        ? "step calls section; plan/phase output owns sections"
        : null,
  },
  {
    id: "no-tmp-log",
    describe: "suite step writes logs under /tmp",
    test: (body) =>
      /\/tmp\/[^\s'\"]+\.log/.test(body) ? "write logs under E2E_CONTEXT_DIR, not /tmp" : null,
  },
  {
    id: "no-git-rev-parse-root",
    describe: "suite step uses non-standard repo-root discovery",
    test: (body) =>
      /git\s+rev-parse\s+--show-toplevel/.test(body)
        ? "avoid git rev-parse repo-root discovery in suite steps"
        : null,
  },
];

interface LintFinding {
  file: string;
  rule: string;
  message: string;
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function lintSuiteSteps(root: string): LintFinding[] {
  const suitesDir = path.join(root, "test/e2e/validation_suites");
  const findings: LintFinding[] = [];
  for (const file of walk(suitesDir).filter((entry) => entry.endsWith(".sh"))) {
    const rel = path.relative(root, file);
    const body = fs.readFileSync(file, "utf8");
    for (const rule of STEP_RULES) {
      const message = rule.test(body);
      if (message) findings.push({ file: rel, rule: rule.id, message });
    }
  }
  return findings;
}

function lintTopLevelLegacyEntrypoints(root: string): LintFinding[] {
  const e2eDir = path.join(root, "test/e2e");
  if (!fs.existsSync(e2eDir)) return [];

  const allowedLegacy = new Set([
    "test-brave-search-e2e.sh",
    "test-channels-stop-start.sh",
    "test-cloud-onboard-e2e.sh",
    "test-credential-sanitization.sh",
    "test-docs-validation.sh",
    "test-full-e2e.sh",
    "test-gpu-e2e.sh",
    "test-hermes-e2e.sh",
    "test-hermes-inference-switch.sh",
    "test-issue-2478-crash-loop-recovery.sh",
    "test-kimi-inference-compat.sh",
    "test-launchable-smoke.sh",
    "test-messaging-compatible-endpoint.sh",
    "test-messaging-providers.sh",
    "test-network-policy.sh",
    "test-onboard-repair.sh",
    "test-onboard-resume.sh",
    "test-openclaw-inference-switch.sh",
    "test-openshell-gateway-upgrade.sh",
    "test-openshell-version-pin.sh",
    "test-rebuild-hermes.sh",
    "test-rebuild-openclaw.sh",
    "test-sandbox-operations.sh",
    "test-skill-agent-e2e.sh",
    "test-token-rotation.sh",
    "test-tunnel-lifecycle.sh",
  ]);

  return fs
    .readdirSync(e2eDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^test-.*\.sh$/.test(entry.name) && !allowedLegacy.has(entry.name))
    .map((entry) => ({
      file: `test/e2e/${entry.name}`,
      rule: "no-top-level-legacy-e2e-entrypoint",
      message:
        "top-level E2E shell entrypoints are retired; add typed scenario coverage under test/e2e/scenarios",
    }));
}

function lint(root: string): LintFinding[] {
  return [...lintSuiteSteps(root), ...lintTopLevelLegacyEntrypoints(root)];
}

function parseArgs(argv: string[]): { root: string } {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const args = argv.slice(2);
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--root") {
      const value = args.shift();
      if (!value) throw new Error("--root requires a value");
      root = path.resolve(value);
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write("tsx scripts/e2e/lint-conventions.ts [--root <repo-root>]\n");
      process.exit(0);
    } else if (arg) {
      throw new Error(`unexpected arg: ${arg}`);
    }
  }
  return { root };
}

try {
  const { root } = parseArgs(process.argv);
  const findings = lint(root);
  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(`${finding.file}: ${finding.rule}: ${finding.message}\n`);
    }
    process.exit(1);
  }
  process.stdout.write("e2e convention lint passed\n");
} catch (err) {
  process.stderr.write(`lint-conventions: ${(err as Error).message}\n`);
  process.exit(2);
}
