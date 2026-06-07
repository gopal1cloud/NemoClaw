#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

if [[ ! -f "${E2E_CONTEXT_DIR:-}/onboard.log" ]]; then
  echo "FAIL: onboarding.preflight.passed - onboard log not found"
  exit 1
fi

failure_pattern="preflight.*(fail|error)|cannot connect to the docker daemon|docker daemon.*(fail|error|unavailable|not running)|docker.*(fail|error|unavailable)|container.*(fail|error)|socket.*(fail|error|unavailable|not found|no such file)"

if grep -Eiq "${failure_pattern}" "${E2E_CONTEXT_DIR}/onboard.log"; then
  echo "FAIL: onboarding.preflight.passed - onboard log contains preflight failure evidence"
  exit 1
fi

echo "PASS: onboarding.preflight.passed"
