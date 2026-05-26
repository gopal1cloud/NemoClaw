#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

cat >&2 <<'MSG'
run-scenario.sh has been retired. Use the typed scenario runner instead:
  npx tsx test/e2e/scenarios/run.ts --scenarios <id[,id...]> [--plan-only|--dry-run|--validate-only]
MSG
exit 2
