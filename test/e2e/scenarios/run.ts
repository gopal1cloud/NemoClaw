// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { compileRunPlans, renderPlanText, writePlanArtifacts } from "./compiler.ts";
import { listScenarios } from "./registry.ts";

interface Args {
  list: boolean;
  planOnly: boolean;
  scenarios: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false, planOnly: false, scenarios: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list") {
      args.list = true;
      continue;
    }
    if (arg === "--plan-only") {
      args.planOnly = true;
      continue;
    }
    if (arg === "--scenarios") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("--scenarios requires a comma-separated value");
      }
      args.scenarios = value.split(",").map((id) => id.trim()).filter(Boolean);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printList() {
  console.log("hybrid scenario registry");
  for (const scenario of listScenarios()) {
    console.log(`- ${scenario.id}${scenario.description ? `: ${scenario.description}` : ""}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    printList();
    return;
  }

  if (!args.planOnly) {
    throw new Error("Phase 1 skeleton supports --list and --plan-only only");
  }
  if (args.scenarios.length === 0) {
    throw new Error("--plan-only requires --scenarios <id[,id...]> in the Phase 1 skeleton");
  }

  if (process.env.E2E_SUITE_FILTER) {
    throw new Error("E2E_SUITE_FILTER is not supported; define assertion selection in scenario builders.");
  }

  const plans = compileRunPlans(args.scenarios);
  if (process.env.E2E_CONTEXT_DIR) {
    writePlanArtifacts(plans, process.env.E2E_CONTEXT_DIR);
  }
  console.log(renderPlanText(plans));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
