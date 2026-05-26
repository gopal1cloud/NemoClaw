#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Canonical logging helpers for typed E2E scenario assertions.
#
# Emits stable markers consumed by phase results and local diagnostics.
#
# Contract:
#   PASS: <message>           — asserting success
#   FAIL: <message>           — asserting failure; `e2e_fail` exits non-zero
#   === Phase N: <label>      — section break (phase-numbered or free-form)
#   INFO: <message>           — informational diagnostics
#
# Usage (in a suite step script):
#     # env.sh already sources this via auto-source — no explicit source
#     # needed when env.sh is already in scope.
#     e2e_section "Phase 2: onboarding"
#     e2e_info "gateway: $gw_url"
#     if probe; then
#       e2e_pass "gateway reachable"
#     else
#       e2e_fail "gateway unreachable"
#     fi

# Guard against double-source so autosourcing from env.sh is safe.
# shellcheck disable=SC2317
if [[ -n "${_E2E_LOGGING_SH_LOADED:-}" ]]; then
  return 0 2>/dev/null || true
fi
_E2E_LOGGING_SH_LOADED=1

# e2e_section <label>
# Emits a `=== Phase N: ...` or `=== <label>` banner.
e2e_section() {
  local label="${*:-}"
  if [[ -z "${label}" ]]; then
    printf '===\n'
    return 0
  fi
  printf '=== %s\n' "${label}"
}

# e2e_info <message>
# Non-assertion diagnostic line.
e2e_info() {
  printf 'INFO: %s\n' "${*:-}"
}

# e2e_pass <message>
# Assertion-success marker consumed by typed scenario diagnostics.
e2e_pass() {
  printf 'PASS: %s\n' "${*:-}"
}

# e2e_fail <message>
# Assertion-failure marker. Exits the current shell with a non-zero status
# so the step aborts immediately. Callers that want to record a failure
# without aborting should use `e2e_info "FAIL: ..."` instead.
e2e_fail() {
  printf 'FAIL: %s\n' "${*:-}" >&2
  exit 1
}
