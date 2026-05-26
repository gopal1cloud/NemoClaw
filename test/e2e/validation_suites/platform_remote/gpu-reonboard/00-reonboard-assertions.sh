#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/platform_remote.sh"
e2e_platform_remote_load_context
for id in \
  expected.platform_remote.prereq.docker-running.gpu-reonboard \
  expected.platform_remote.prereq.nvidia-smi.gpu-reonboard \
  expected.platform_remote.prereq.noninteractive-env.gpu-reonboard \
  expected.platform_remote.reonboard.ollama-controlled \
  expected.platform_remote.reonboard.first-onboard-exits-zero \
  expected.platform_remote.reonboard.cli-on-path \
  expected.platform_remote.reonboard.first-sandbox-listed \
  expected.platform_remote.reonboard.first-status-healthy \
  expected.platform_remote.reonboard.ollama-running-first \
  expected.platform_remote.reonboard.proxy-running-first \
  expected.platform_remote.reonboard.first-token-exists-mode-600 \
  expected.platform_remote.reonboard.first-token-accepted \
  expected.platform_remote.reonboard.ollama-model-available \
  expected.platform_remote.reonboard.ssh-config-first \
  expected.platform_remote.reonboard.first-sandbox-inference-pong \
  expected.platform_remote.reonboard.second-onboard-exits-zero \
  expected.platform_remote.reonboard.token-exists-after-second \
  expected.platform_remote.reonboard.token-mode-600-after-second \
  expected.platform_remote.reonboard.proxy-running-after-second \
  expected.platform_remote.reonboard.persisted-token-accepted-after-second \
  expected.platform_remote.reonboard.unauthenticated-rejected-after-second \
  expected.platform_remote.reonboard.wrong-token-rejected-after-second \
  expected.platform_remote.reonboard.ssh-config-after-second \
  expected.platform_remote.reonboard.second-sandbox-inference-pong-not-401 \
  expected.platform_remote.reonboard.destroy-removes-sandbox; do
  e2e_platform_remote_assertion "$id"
done
