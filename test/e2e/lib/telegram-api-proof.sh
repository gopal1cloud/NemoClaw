#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

# Shared hermetic Telegram Bot API helpers for OpenClaw messaging E2E checks.

append_exit_trap_for_fake_telegram_api() {
  local command="$1"
  local existing
  existing="$(trap -p EXIT | sed "s/^trap -- '//;s/' EXIT$//")"
  trap ''"${existing:+$existing; }$command"'' EXIT
}

cleanup_fake_telegram_api() {
  if [ -n "${FAKE_TELEGRAM_API_CONTAINER:-}" ]; then
    docker rm -f "$FAKE_TELEGRAM_API_CONTAINER" >/dev/null 2>&1 || true
  fi
  if [ -n "${FAKE_TELEGRAM_API_DIR:-}" ]; then
    rm -rf "$FAKE_TELEGRAM_API_DIR" 2>/dev/null || true
  fi
}

start_fake_telegram_api() {
  local token="$1"
  mkdir -p "$REPO/.tmp"
  FAKE_TELEGRAM_API_DIR="$(mktemp -d "$REPO/.tmp/fake-telegram.XXXXXX")"
  FAKE_TELEGRAM_API_PORT_FILE="$FAKE_TELEGRAM_API_DIR/port"
  FAKE_TELEGRAM_API_CAPTURE_FILE="$FAKE_TELEGRAM_API_DIR/capture.jsonl"
  FAKE_TELEGRAM_API_CONTAINER="nemoclaw-fake-telegram-$$-$RANDOM"
  FAKE_TELEGRAM_API_HOST="host.docker.internal"
  : >"$FAKE_TELEGRAM_API_CAPTURE_FILE"

  if ! docker run -d --rm \
    --name "$FAKE_TELEGRAM_API_CONTAINER" \
    -p 0:8080 \
    -e FAKE_TELEGRAM_API_PORT=8080 \
    -e FAKE_TELEGRAM_API_EXPECTED_TOKEN="$token" \
    -e FAKE_TELEGRAM_API_PORT_FILE=/tmp/fake-telegram/port \
    -e FAKE_TELEGRAM_API_CAPTURE_FILE=/tmp/fake-telegram/capture.jsonl \
    -v "$FAKE_TELEGRAM_API_DIR:/tmp/fake-telegram" \
    -v "$REPO/test/e2e/lib:/opt/nemoclaw-e2e:ro" \
    node:22-bookworm-slim \
    node /opt/nemoclaw-e2e/fake-telegram-api.cjs \
    >"$FAKE_TELEGRAM_API_DIR/container.id" 2>"$FAKE_TELEGRAM_API_DIR/server.log"; then
    cat "$FAKE_TELEGRAM_API_DIR/server.log" >&2 || true
    return 1
  fi
  append_exit_trap_for_fake_telegram_api cleanup_fake_telegram_api

  for _ in $(seq 1 50); do
    if [ -s "$FAKE_TELEGRAM_API_PORT_FILE" ]; then
      local published_port
      published_port="$(docker port "$FAKE_TELEGRAM_API_CONTAINER" 8080/tcp 2>/dev/null | head -1 | sed 's/.*://')"
      if [ -n "$published_port" ]; then
        export FAKE_TELEGRAM_API_PORT
        FAKE_TELEGRAM_API_PORT="$published_port"
        return 0
      fi
    fi
    if ! docker inspect "$FAKE_TELEGRAM_API_CONTAINER" >/dev/null 2>&1; then
      docker logs "$FAKE_TELEGRAM_API_CONTAINER" >&2 || true
      cat "$FAKE_TELEGRAM_API_DIR/server.log" >&2 || true
      return 1
    fi
    sleep 0.1
  done
  cat "$FAKE_TELEGRAM_API_DIR/server.log" >&2 || true
  return 1
}

fake_telegram_api_allowed_ip_options() {
  printf '%s' 'allowed-ip=10.0.0.0/8,allowed-ip=172.16.0.0/12,allowed-ip=192.168.0.0/16'
}

apply_fake_telegram_api_policy() {
  local sandbox_name="$1"
  local port="$2"
  local host="${FAKE_TELEGRAM_API_HOST:-host.openshell.internal}"
  local allowed_ip_options
  allowed_ip_options="$(fake_telegram_api_allowed_ip_options)"
  openshell policy update "$sandbox_name" \
    --add-endpoint "${host}:${port}:read-write:rest:enforce:request-body-credential-rewrite,${allowed_ip_options}" \
    --add-allow "${host}:${port}:GET:/**" \
    --add-allow "${host}:${port}:POST:/**" \
    --binary /usr/local/bin/node \
    --binary /usr/bin/node \
    --wait
}

run_openclaw_telegram_mock_send() {
  local port="$1"
  local target="$2"
  local message="$3"
  local host="${FAKE_TELEGRAM_API_HOST:-host.openshell.internal}"
  local api_root target_b64 message_b64
  api_root="http://${host}:${port}"
  target_b64=$(printf '%s' "$target" | base64 | tr -d '\n')
  message_b64=$(printf '%s' "$message" | base64 | tr -d '\n')

  sandbox_exec_stdin "FAKE_TELEGRAM_API_ROOT='$api_root' OPENCLAW_MESSAGE_TARGET_B64='$target_b64' OPENCLAW_MESSAGE_TEXT_B64='$message_b64' bash -s" <<'SH'
decode_b64() {
  printf '%s' "$1" | base64 -d
}

target="$(decode_b64 "$OPENCLAW_MESSAGE_TARGET_B64")"
message="$(decode_b64 "$OPENCLAW_MESSAGE_TEXT_B64")"
mock_config="$(mktemp /tmp/nemoclaw-openclaw-telegram-mock.XXXXXX.json)"

FAKE_TELEGRAM_API_ROOT="$FAKE_TELEGRAM_API_ROOT" MOCK_CONFIG="$mock_config" python3 - <<'PY'
import json
import os
import sys

source = "/sandbox/.openclaw/openclaw.json"
target = os.environ["MOCK_CONFIG"]
api_root = os.environ["FAKE_TELEGRAM_API_ROOT"]

with open(source, "r", encoding="utf-8") as fh:
    cfg = json.load(fh)

accounts = cfg.setdefault("channels", {}).setdefault("telegram", {}).setdefault("accounts", {})
if not isinstance(accounts, dict) or not accounts:
    print("missing telegram account in openclaw.json", file=sys.stderr)
    sys.exit(2)

account = accounts.get("default")
if not isinstance(account, dict):
    first_key = next(iter(accounts))
    account = accounts[first_key]
    if not isinstance(account, dict):
        print("telegram account is not an object", file=sys.stderr)
        sys.exit(2)

account["apiRoot"] = api_root

with open(target, "w", encoding="utf-8") as fh:
    json.dump(cfg, fh)
PY

set +e
OPENCLAW_CONFIG_PATH="$mock_config" OPENCLAW_NO_COLOR=1 \
  openclaw message send --channel telegram --target "$target" --message "$message" --json
rc=$?
rm -f "$mock_config"
echo "__OPENCLAW_MESSAGE_SEND_EXIT__:$rc"
SH
}

check_fake_telegram_capture_send() {
  local expected_token="$1"
  local expected_chat="$2"
  local expected_text="$3"
  node - "$FAKE_TELEGRAM_API_CAPTURE_FILE" "$expected_token" "$expected_chat" "$expected_text" <<'NODE'
const fs = require("fs");
const [file, expectedToken, expectedChat, expectedText] = process.argv.slice(2);
const rows = fs
  .readFileSync(file, "utf8")
  .trim()
  .split(/\n+/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((row) => row.event === "request" && row.endpoint === "sendMessage");
const last = rows.at(-1);
if (!last) {
  console.log("NO_SEND_MESSAGE");
  process.exit(2);
}
if (last.tokenMatchesExpected !== true) {
  console.log("BAD_TOKEN_REWRITE");
  process.exit(3);
}
if (last.tokenLooksPlaceholder) {
  console.log("PLACEHOLDER_LEAK");
  process.exit(4);
}
if (String(last.chatId) !== String(expectedChat)) {
  console.log(`BAD_CHAT ${last.chatId}`);
  process.exit(5);
}
if (last.text !== expectedText) {
  console.log(`BAD_TEXT ${last.text}`);
  process.exit(6);
}
if (!expectedToken) {
  console.log("MISSING_EXPECTED_TOKEN");
  process.exit(7);
}
console.log("OK");
NODE
}
