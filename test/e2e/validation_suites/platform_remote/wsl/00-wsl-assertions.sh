#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/platform_remote.sh"
e2e_platform_remote_load_context
for id in \
  expected.platform_remote.wsl.workflow-triggers \
  expected.platform_remote.wsl.runner-windows-latest \
  expected.platform_remote.wsl.source-install-bootstraps-openshell \
  expected.platform_remote.wsl.no-distro-ubuntu-2404-or-actionable-failure \
  expected.platform_remote.wsl.idle-gateway-recovers-and-retries \
  expected.platform_remote.wsl.fake-gpu-rejected; do
  e2e_platform_remote_assertion "$id"
done
