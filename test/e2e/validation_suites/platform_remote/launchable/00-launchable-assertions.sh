#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/platform_remote.sh"
e2e_platform_remote_load_context
for id in \
  expected.platform_remote.launchable.prereq-docker-running \
  expected.platform_remote.launchable.prereq-nvidia-api-key \
  expected.platform_remote.launchable.prereq-nvidia-api-reachable \
  expected.platform_remote.launchable.prereq-noninteractive-env \
  expected.platform_remote.launchable.script-present \
  expected.platform_remote.launchable.bootstrap-exits-zero \
  expected.platform_remote.launchable.nemoclaw-help \
  expected.platform_remote.launchable.openshell-version \
  expected.platform_remote.launchable.node-runtime-compatible \
  expected.platform_remote.launchable.docker-usable-after-install \
  expected.platform_remote.launchable.ready-sentinel \
  expected.platform_remote.launchable.clone-directory-exists \
  expected.platform_remote.launchable.cli-dist-built \
  expected.platform_remote.launchable.plugin-dist-built \
  expected.platform_remote.launchable.onboard-exits-zero \
  expected.platform_remote.launchable.sandbox-listed \
  expected.platform_remote.launchable.sandbox-status-healthy \
  expected.platform_remote.launchable.inference-provider-nvidia-prod \
  expected.platform_remote.launchable.gateway-liveness-or-naming-skip \
  expected.platform_remote.launchable.direct-nvidia-pong \
  expected.platform_remote.launchable.sandbox-inference-local-pong \
  expected.platform_remote.launchable.openclaw-agent-thinking-off-42 \
  expected.platform_remote.launchable.destroy-removes-sandbox; do
  e2e_platform_remote_assertion "$id"
done
