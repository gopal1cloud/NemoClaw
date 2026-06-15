// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  evaluateDiagnosticBudget,
  formatViolations,
  parseBudget,
} from "../scripts/check-biome-diagnostic-budget";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUDGET_FILE = path.join(REPO_ROOT, "ci", "biome-diagnostic-budget.json");

describe("Biome diagnostic budget", () => {
  it("parses budget entries", () => {
    expect(
      parseBudget(
        JSON.stringify({
          budgets: [
            {
              name: "skipped tests",
              selector: "noSkippedTests",
              maxDiagnostics: 3,
            },
          ],
        }),
      ),
    ).toEqual({
      budgets: [
        {
          name: "skipped tests",
          selector: "noSkippedTests",
          maxDiagnostics: 3,
        },
      ],
    });
  });

  it("rejects duplicate selectors", () => {
    expect(() =>
      parseBudget(
        JSON.stringify({
          budgets: [
            { name: "a", selector: "noSkippedTests", maxDiagnostics: 1 },
            { name: "b", selector: "noSkippedTests", maxDiagnostics: 1 },
          ],
        }),
      ),
    ).toThrow(/duplicate budget selector noSkippedTests/);
  });

  it("fails when diagnostics grow beyond the budget", () => {
    const violations = evaluateDiagnosticBudget([
      {
        name: "skipped tests",
        selector: "noSkippedTests",
        maxDiagnostics: 3,
        diagnostics: 4,
        examples: [
          {
            file: "test/example.test.ts",
            line: 10,
            category: "lint/suspicious/noSkippedTests",
            message: "Don't disable tests.",
          },
        ],
      },
    ]);

    expect(violations).toEqual([
      {
        kind: "over-budget",
        name: "skipped tests",
        selector: "noSkippedTests",
        diagnostics: 4,
        maxDiagnostics: 3,
        examples: [
          {
            file: "test/example.test.ts",
            line: 10,
            category: "lint/suspicious/noSkippedTests",
            message: "Don't disable tests.",
          },
        ],
      },
    ]);
    expect(formatViolations(violations)).toContain("4 diagnostic(s) > 3 budget");
    expect(formatViolations(violations)).toContain("test/example.test.ts:10");
  });

  it("requires the budget to ratchet down when diagnostics shrink", () => {
    const violations = evaluateDiagnosticBudget([
      {
        name: "skipped tests",
        selector: "noSkippedTests",
        maxDiagnostics: 3,
        diagnostics: 2,
        examples: [],
      },
    ]);

    expect(violations).toEqual([
      {
        kind: "legacy-ratchet",
        name: "skipped tests",
        selector: "noSkippedTests",
        diagnostics: 2,
        maxDiagnostics: 3,
      },
    ]);
    expect(formatViolations(violations)).toContain("lower maxDiagnostics");
  });

  it("passes when diagnostics match the budget", () => {
    expect(
      evaluateDiagnosticBudget([
        {
          name: "skipped tests",
          selector: "noSkippedTests",
          maxDiagnostics: 3,
          diagnostics: 3,
          examples: [],
        },
      ]),
    ).toEqual([]);
  });
});

describe("import cycles budget entry", () => {
  it("actual budget file contains an import cycles entry", () => {
    const budget = parseBudget(readFileSync(BUDGET_FILE, "utf-8"), BUDGET_FILE);
    const entry = budget.budgets.find((b) => b.selector === "noImportCycles");
    expect(entry).toBeDefined();
  });

  it("import cycles entry has name 'import cycles'", () => {
    const budget = parseBudget(readFileSync(BUDGET_FILE, "utf-8"), BUDGET_FILE);
    const entry = budget.budgets.find((b) => b.selector === "noImportCycles");
    expect(entry?.name).toBe("import cycles");
  });

  it("import cycles entry has maxDiagnostics of 14", () => {
    const budget = parseBudget(readFileSync(BUDGET_FILE, "utf-8"), BUDGET_FILE);
    const entry = budget.budgets.find((b) => b.selector === "noImportCycles");
    expect(entry?.maxDiagnostics).toBe(14);
  });

  it("budget file contains both the skipped tests and import cycles entries", () => {
    const budget = parseBudget(readFileSync(BUDGET_FILE, "utf-8"), BUDGET_FILE);
    const selectors = budget.budgets.map((b) => b.selector);
    expect(selectors).toContain("noSkippedTests");
    expect(selectors).toContain("noImportCycles");
    expect(budget.budgets).toHaveLength(2);
  });

  it("parses a budget with the noImportCycles selector", () => {
    expect(
      parseBudget(
        JSON.stringify({
          budgets: [
            {
              name: "import cycles",
              selector: "noImportCycles",
              maxDiagnostics: 14,
            },
          ],
        }),
      ),
    ).toEqual({
      budgets: [
        {
          name: "import cycles",
          selector: "noImportCycles",
          maxDiagnostics: 14,
        },
      ],
    });
  });

  it("rejects duplicate noImportCycles selectors", () => {
    expect(() =>
      parseBudget(
        JSON.stringify({
          budgets: [
            { name: "a", selector: "noImportCycles", maxDiagnostics: 10 },
            { name: "b", selector: "noImportCycles", maxDiagnostics: 10 },
          ],
        }),
      ),
    ).toThrow(/duplicate budget selector noImportCycles/);
  });

  it("fails when import cycle diagnostics exceed 14", () => {
    const violations = evaluateDiagnosticBudget([
      {
        name: "import cycles",
        selector: "noImportCycles",
        maxDiagnostics: 14,
        diagnostics: 15,
        examples: [
          {
            file: "src/foo.ts",
            line: 1,
            category: "lint/correctness/noImportCycles",
            message: "This import creates a cycle.",
          },
        ],
      },
    ]);

    expect(violations).toEqual([
      {
        kind: "over-budget",
        name: "import cycles",
        selector: "noImportCycles",
        diagnostics: 15,
        maxDiagnostics: 14,
        examples: [
          {
            file: "src/foo.ts",
            line: 1,
            category: "lint/correctness/noImportCycles",
            message: "This import creates a cycle.",
          },
        ],
      },
    ]);
    expect(formatViolations(violations)).toContain("15 diagnostic(s) > 14 budget");
    expect(formatViolations(violations)).toContain("src/foo.ts:1");
  });

  it("passes when import cycle diagnostics equal 14", () => {
    expect(
      evaluateDiagnosticBudget([
        {
          name: "import cycles",
          selector: "noImportCycles",
          maxDiagnostics: 14,
          diagnostics: 14,
          examples: [],
        },
      ]),
    ).toEqual([]);
  });

  it("requires ratcheting down when import cycle diagnostics fall below 14", () => {
    const violations = evaluateDiagnosticBudget([
      {
        name: "import cycles",
        selector: "noImportCycles",
        maxDiagnostics: 14,
        diagnostics: 10,
        examples: [],
      },
    ]);

    expect(violations).toEqual([
      {
        kind: "legacy-ratchet",
        name: "import cycles",
        selector: "noImportCycles",
        diagnostics: 10,
        maxDiagnostics: 14,
      },
    ]);
    expect(formatViolations(violations)).toContain("lower maxDiagnostics");
  });

  it("formats over-budget import cycles violation with selector in message", () => {
    const violations = evaluateDiagnosticBudget([
      {
        name: "import cycles",
        selector: "noImportCycles",
        maxDiagnostics: 14,
        diagnostics: 20,
        examples: [],
      },
    ]);

    const output = formatViolations(violations);
    expect(output).toContain("import cycles");
    expect(output).toContain("noImportCycles");
  });

  it("evaluates both entries independently when combined in a budget", () => {
    const violations = evaluateDiagnosticBudget([
      {
        name: "skipped tests",
        selector: "noSkippedTests",
        maxDiagnostics: 3,
        diagnostics: 3,
        examples: [],
      },
      {
        name: "import cycles",
        selector: "noImportCycles",
        maxDiagnostics: 14,
        diagnostics: 14,
        examples: [],
      },
    ]);

    expect(violations).toEqual([]);
  });

  it("reports only the over-budget entry when one passes and one fails", () => {
    const violations = evaluateDiagnosticBudget([
      {
        name: "skipped tests",
        selector: "noSkippedTests",
        maxDiagnostics: 3,
        diagnostics: 3,
        examples: [],
      },
      {
        name: "import cycles",
        selector: "noImportCycles",
        maxDiagnostics: 14,
        diagnostics: 15,
        examples: [],
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      kind: "over-budget",
      selector: "noImportCycles",
    });
  });
});
