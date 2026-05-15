#!/bin/bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

# Containerized regression runner for issue #3396.
#
# Runs a targeted NVIDIA Endpoints onboarding E2E from an isolated copy of this
# checkout inside an Ubuntu 22.04 CUDA container so the OpenShell gateway process
# is launched from a glibc 2.35 userspace, even when the host OS is newer. The
# host still provides Docker and GPU access through the mounted Docker socket and
# `--gpus all`.
#
# Required:
#   NVIDIA_API_KEY=nvapi-... bash test/e2e/runtime/run-issue-3396-jammy-container.sh
#
# Optional overrides:
#   NEMOCLAW_3396_IMAGE          Container image (default: nvidia/cuda:12.4.1-base-ubuntu22.04)
#   NEMOCLAW_3396_HOME           Host temp HOME to mount into the container
#   NEMOCLAW_3396_KEEP_HOME=1    Preserve the generated temp HOME for diagnostics
#   NEMOCLAW_GATEWAY_PORT        Gateway port to use (default: 18080)
#   NEMOCLAW_SANDBOX_NAME        Sandbox name to use (default: issue-3396-jammy)
#   NEMOCLAW_SANDBOX_GPU         Sandbox GPU mode (default: 0; host GPU visibility is still checked)
#   NEMOCLAW_POLICY_MODE         Policy mode (default: skip; this targets provider setup)

set -euo pipefail

info() { printf '\033[1;34m[issue-3396]\033[0m %s\n' "$*"; }
fail() {
  printf '\033[1;31m[issue-3396] ERROR:\033[0m %s\n' "$*" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ -z "${NVIDIA_API_KEY:-}" ]; then
  fail "NVIDIA_API_KEY must be set to a real nvapi- key for the NVIDIA Endpoints E2E"
fi

if ! command -v docker >/dev/null 2>&1; then
  fail "docker CLI is required"
fi

if ! docker info >/dev/null 2>&1; then
  fail "docker daemon is not reachable"
fi

if [ ! -S /var/run/docker.sock ]; then
  fail "/var/run/docker.sock must exist so the Jammy container can drive host Docker"
fi

IMAGE="${NEMOCLAW_3396_IMAGE:-nvidia/cuda:12.4.1-base-ubuntu22.04}"
CONTAINER_NAME="${NEMOCLAW_3396_CONTAINER_NAME:-nemoclaw-issue-3396-jammy}"
HOME_WAS_PROVIDED=0
if [ -n "${NEMOCLAW_3396_HOME:-}" ]; then
  TEST_HOME="$NEMOCLAW_3396_HOME"
  HOME_WAS_PROVIDED=1
  mkdir -p "$TEST_HOME"
else
  TEST_HOME="$(mktemp -d "${TMPDIR:-/tmp}/nemoclaw-3396-jammy-home.XXXXXX")"
fi

cleanup() {
  if [ "$HOME_WAS_PROVIDED" -eq 0 ] && [ "${NEMOCLAW_3396_KEEP_HOME:-0}" != "1" ]; then
    rm -rf "$TEST_HOME"
  else
    info "Preserving Jammy test HOME at $TEST_HOME"
  fi
}
trap cleanup EXIT

export NEMOCLAW_NON_INTERACTIVE=1
export NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE=1
export NEMOCLAW_FRESH="${NEMOCLAW_FRESH:-1}"
export NEMOCLAW_RECREATE_SANDBOX="${NEMOCLAW_RECREATE_SANDBOX:-1}"
export NEMOCLAW_PROVIDER="${NEMOCLAW_PROVIDER:-build}"
export NEMOCLAW_MODEL="${NEMOCLAW_MODEL:-nvidia/nemotron-3-super-120b-a12b}"
export NEMOCLAW_GATEWAY_PORT="${NEMOCLAW_GATEWAY_PORT:-18080}"
export NEMOCLAW_SANDBOX_NAME="${NEMOCLAW_SANDBOX_NAME:-issue-3396-jammy}"
export NEMOCLAW_SANDBOX_GPU="${NEMOCLAW_SANDBOX_GPU:-0}"
export NEMOCLAW_POLICY_MODE="${NEMOCLAW_POLICY_MODE:-skip}"
export NEMOCLAW_3396_OUTER_UID="${NEMOCLAW_3396_OUTER_UID:-$(id -u)}"
export NEMOCLAW_3396_OUTER_GID="${NEMOCLAW_3396_OUTER_GID:-$(id -g)}"

info "Repo: $REPO_ROOT"
info "Image: $IMAGE"
info "Temp HOME: $TEST_HOME"
info "Gateway port: $NEMOCLAW_GATEWAY_PORT"
info "Sandbox: $NEMOCLAW_SANDBOX_NAME"

# Remove a stale container from an interrupted previous run.
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker run --rm \
  --interactive \
  --name "$CONTAINER_NAME" \
  --gpus all \
  --network host \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "$REPO_ROOT:/mnt/nemoclaw-src:ro" \
  --volume "$TEST_HOME:$TEST_HOME" \
  --workdir "$TEST_HOME" \
  --env "HOME=$TEST_HOME" \
  --env NVIDIA_API_KEY \
  --env NEMOCLAW_NON_INTERACTIVE \
  --env NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE \
  --env NEMOCLAW_FRESH \
  --env NEMOCLAW_RECREATE_SANDBOX \
  --env NEMOCLAW_PROVIDER \
  --env NEMOCLAW_MODEL \
  --env NEMOCLAW_GATEWAY_PORT \
  --env NEMOCLAW_SANDBOX_NAME \
  --env NEMOCLAW_SANDBOX_GPU \
  --env NEMOCLAW_POLICY_MODE \
  --env NEMOCLAW_E2E_KEEP_SANDBOX \
  --env NEMOCLAW_3396_OUTER_UID \
  --env NEMOCLAW_3396_OUTER_GID \
  "$IMAGE" \
  bash -s <<'JAMMY_E2E'
set -euo pipefail

inner_info() { printf '\033[1;34m[jammy-glibc]\033[0m %s\n' "$*"; }
inner_fail() {
  printf '\033[1;31m[jammy-glibc] ERROR:\033[0m %s\n' "$*" >&2
  exit 1
}

inner_cleanup() {
  docker rm -f nemoclaw-openshell-gateway >/dev/null 2>&1 || true
  chown -R "${NEMOCLAW_3396_OUTER_UID:-0}:${NEMOCLAW_3396_OUTER_GID:-0}" "$HOME" >/dev/null 2>&1 || true
}
trap inner_cleanup EXIT

export DEBIAN_FRONTEND=noninteractive
inner_info "Installing Jammy container prerequisites..."
apt-get update -qq
apt-get install -y -qq binutils ca-certificates curl docker.io git jq python3 rsync sudo xz-utils >/dev/null

inner_info "OS release"
cat /etc/os-release
# shellcheck source=/dev/null
. /etc/os-release
if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "22.04" ]; then
  inner_fail "expected Ubuntu 22.04 userspace, got ID=${ID:-unknown} VERSION_ID=${VERSION_ID:-unknown}"
fi

GLIBC_OUTPUT="$(ldd --version 2>&1)"
GLIBC_LINE="${GLIBC_OUTPUT%%$'\n'*}"
inner_info "glibc: $GLIBC_LINE"
if ! grep -q "2\.35" <<<"$GLIBC_LINE"; then
  inner_fail "expected glibc 2.35 userspace, got: $GLIBC_LINE"
fi

inner_info "Verifying GPU visibility from Jammy container..."
nvidia-smi

inner_info "Verifying mounted host Docker socket..."
docker version

docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
# Remove a gateway compatibility container from any interrupted previous run.
docker rm -f nemoclaw-openshell-gateway >/dev/null 2>&1 || true

WORKTREE="$HOME/NemoClaw"
inner_info "Copying repository into isolated worktree: $WORKTREE"
mkdir -p "$WORKTREE"
rsync -a --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude nemoclaw/node_modules \
  --exclude dist \
  /mnt/nemoclaw-src/ "$WORKTREE/"
cd "$WORKTREE"
export NEMOCLAW_REPO_ROOT="$WORKTREE"

inner_info "Installing OpenShell CLI for the source-checkout E2E path..."
bash scripts/install-openshell.sh
mkdir -p "$HOME/.local/bin"
for bin in openshell openshell-gateway openshell-sandbox; do
  if [ -x "/usr/local/bin/$bin" ]; then
    cp "/usr/local/bin/$bin" "$HOME/.local/bin/$bin"
    chmod 755 "$HOME/.local/bin/$bin"
  fi
done
export PATH="$HOME/.local/bin:$PATH"

INSTALL_LOG="$HOME/issue-3396-install.log"
inner_info "Installing NemoClaw CLI from source checkout..."
INSTALL_EXIT=0
bash install.sh --non-interactive >"$INSTALL_LOG" 2>&1 || INSTALL_EXIT=$?
tail -120 "$INSTALL_LOG" || true
if [ "$INSTALL_EXIT" -ne 0 ]; then
  inner_fail "install.sh failed with exit $INSTALL_EXIT"
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi
export PATH="$HOME/.local/bin:$PATH"
command -v nemoclaw >/dev/null 2>&1 || inner_fail "nemoclaw was not installed on PATH"
command -v openshell >/dev/null 2>&1 || inner_fail "openshell was not installed on PATH"

ONBOARD_LOG="$HOME/issue-3396-onboard.log"
inner_info "Running targeted NVIDIA Endpoints onboard inside Jammy/glibc 2.35 userspace..."
ONBOARD_EXIT=0
nemoclaw onboard \
  --fresh \
  --non-interactive \
  --yes-i-accept-third-party-software \
  --yes \
  --no-gpu \
  >"$ONBOARD_LOG" 2>&1 || ONBOARD_EXIT=$?
tail -240 "$ONBOARD_LOG" || true

SEARCH_PATHS=(
  "$INSTALL_LOG"
  "$ONBOARD_LOG"
  "$HOME/.local/state/nemoclaw"
  "$HOME/.nemoclaw/onboard-failures"
  "$HOME/.nemoclaw/onboard-session.json"
)
EXISTING_SEARCH_PATHS=()
for path in "${SEARCH_PATHS[@]}"; do
  if [ -e "$path" ]; then
    EXISTING_SEARCH_PATHS+=("$path")
  fi
done
inner_info "Checking issue #3396 regression signatures..."

if grep -R -F "Connection refused (os error 111)" "${EXISTING_SEARCH_PATHS[@]}" >/dev/null 2>&1; then
  inner_fail "unexpected issue #3396 Connection refused signature found"
fi

if grep -R -E "GLIBC_2\.3[89].*not found" "${EXISTING_SEARCH_PATHS[@]}" >/dev/null 2>&1; then
  inner_fail "unexpected OpenShell gateway GLIBC loader failure found"
fi

if [ "$ONBOARD_EXIT" -ne 0 ]; then
  inner_fail "nemoclaw onboard failed with exit $ONBOARD_EXIT"
fi

if ! grep -R -F "OpenShell gateway compatibility patch active" "${EXISTING_SEARCH_PATHS[@]}" >/dev/null 2>&1; then
  inner_fail "expected OpenShell gateway compatibility patch log was not found"
fi

if ! nemoclaw list 2>&1 | grep -F "$NEMOCLAW_SANDBOX_NAME" >/dev/null; then
  inner_fail "sandbox '$NEMOCLAW_SANDBOX_NAME' was not listed after onboarding"
fi

if ! openshell inference get 2>&1 | grep -F "nvidia-prod" >/dev/null; then
  inner_fail "OpenShell inference route was not configured for nvidia-prod"
fi

if [ "${NEMOCLAW_E2E_KEEP_SANDBOX:-0}" != "1" ]; then
  nemoclaw "$NEMOCLAW_SANDBOX_NAME" destroy --yes >/dev/null 2>&1 || true
  openshell gateway destroy -g nemoclaw >/dev/null 2>&1 || true
fi

inner_info "Issue #3396 Jammy/glibc container validation passed"
JAMMY_E2E
