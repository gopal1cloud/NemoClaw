#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/platform_remote.sh"
e2e_platform_remote_load_context
for id in \
  expected.platform_remote.public_install.prereq-docker-running \
  expected.platform_remote.public_install.prereq-nvidia-api-key-reachable \
  expected.platform_remote.public_install.prereq-noninteractive-env \
  expected.platform_remote.public_install.platform-linux-or-explicit-skip \
  expected.platform_remote.public_install.exits-zero \
  expected.platform_remote.public_install.source-isolation \
  expected.platform_remote.public_install.github-clone-path-evidence \
  expected.platform_remote.public_install.target-ref-used \
  expected.platform_remote.public_install.toolchain-on-path; do
  e2e_platform_remote_assertion "$id"
done
