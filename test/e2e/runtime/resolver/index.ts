// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/** CLI entrypoint for hybrid E2E reporting utilities. */

import { renderCoverageReport } from "./coverage.ts";

function main(): number {
  const command = process.argv[2] ?? "";
  if (command !== "coverage") {
    process.stderr.write("resolver: only 'coverage' is supported; use test/e2e/scenarios/run.ts for scenario plans and execution\n");
    return 2;
  }
  try {
    process.stdout.write(`${renderCoverageReport()}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`resolver: ${(err as Error).message}\n`);
    return 1;
  }
}

process.exit(main());
