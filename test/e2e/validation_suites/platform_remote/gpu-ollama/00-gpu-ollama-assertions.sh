#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/platform_remote.sh"
e2e_platform_remote_load_context
for id in \
  expected.platform_remote.prereq.docker-running.gpu \
  expected.platform_remote.prereq.nvidia-smi-vram \
  expected.platform_remote.prereq.non-interactive-env.gpu \
  expected.platform_remote.prereq.third-party-acceptance.gpu \
  expected.platform_remote.gpu.ollama-binary-available \
  expected.platform_remote.gpu.ollama-port-owned \
  expected.platform_remote.gpu.install-noninteractive-ollama \
  expected.platform_remote.gpu.cli-on-path \
  expected.platform_remote.gpu.sandbox-listed \
  expected.platform_remote.gpu.sandbox-status-healthy \
  expected.platform_remote.gpu.sandbox-gpu-enabled \
  expected.platform_remote.gpu.proof-nvidia-smi \
  expected.platform_remote.gpu.proof-proc-comm-write \
  expected.platform_remote.gpu.proof-cuinit \
  expected.platform_remote.gpu.inference-provider-ollama \
  expected.platform_remote.gpu.ollama-localhost-reachable \
  expected.platform_remote.gpu.ollama-model-available \
  expected.platform_remote.gpu.direct-ollama-chat-pong \
  expected.platform_remote.gpu.sandbox-inference-local-pong; do
  e2e_platform_remote_assertion "$id"
done
