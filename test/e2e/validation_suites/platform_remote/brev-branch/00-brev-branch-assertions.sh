#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/platform_remote.sh"
e2e_platform_remote_load_context
for id in \
  expected.platform_remote.brev.gpu-bridge-host-service-ports \
  expected.platform_remote.brev.gpu-runtime-toolkit-proof \
  expected.platform_remote.brev.gpu-proxy-env-source-shape \
  expected.platform_remote.brev.registry-default-e2e-test \
  expected.platform_remote.brev.registry-cpu-gpu-disabled \
  expected.platform_remote.brev.full-suite-pass-no-fail \
  expected.platform_remote.brev.gpu-suite-pass-no-fail \
  expected.platform_remote.brev.deploy-cli-sandbox-ready \
  expected.platform_remote.brev.deploy-cli-registry-entry \
  expected.platform_remote.brev.gpu-bridge-reachability-live; do
  e2e_platform_remote_assertion "$id"
done
