#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/platform_remote.sh"
e2e_platform_remote_load_context
for id in \
  expected.platform_remote.ollama_proxy.token-exists \
  expected.platform_remote.ollama_proxy.token-mode-600 \
  expected.platform_remote.ollama_proxy.liveness \
  expected.platform_remote.ollama_proxy.rejects-unauthenticated \
  expected.platform_remote.ollama_proxy.accepts-persisted-token \
  expected.platform_remote.ollama_proxy.docker-gpu-topology-skip \
  expected.platform_remote.ollama_proxy.container-host-reachable \
  expected.platform_remote.ollama_proxy.kill-precondition \
  expected.platform_remote.ollama_proxy.recovers-from-persisted-token \
  expected.platform_remote.ollama_proxy.recovered-accepts-original-token \
  expected.platform_remote.ollama_proxy.recovery-skip-metadata; do
  e2e_platform_remote_assertion "$id"
done
