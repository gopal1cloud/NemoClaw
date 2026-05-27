#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Dogfood orchestrator for the verify-stale skill.
#
# Lives inside the maintainer sandbox started by dogfood-verify-stale.yaml.
# Validates the environment, drives the skill in batch mode via an
# OpenClaw agent session, then sweeps stragglers and posts a wrap-up Gist.
#
# The skill is a Markdown spec read by an LLM agent — see
# .agents/skills/nemoclaw-maintainer-verify-stale/SKILL.md — so this
# script's job is the harness around that session, not the verification
# logic itself.

set -euo pipefail

# -----------------------------------------------------------------------------
# Style helpers — match scripts/backup-workspace.sh conventions
# -----------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[dogfood]${NC} $1"; }
warn() { echo -e "${YELLOW}[dogfood]${NC} $1" >&2; }
fail() {
  echo -e "${RED}[dogfood]${NC} $1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "'$1' is required but not found in PATH."
}

require_env() {
  local name="$1"
  [ -n "${!name:-}" ] || fail "env var '$name' is required but not set."
}

# -----------------------------------------------------------------------------
# Phase 1 — environment validation
# -----------------------------------------------------------------------------

info "Phase 1 — environment validation"

require_cmd brev
require_cmd gh
require_cmd jq
require_cmd git

require_env VERIFY_STALE_AUTO_APPROVE
require_env VERIFY_STALE_DRY_RUN
require_env VERIFY_STALE_BATCH_CAP
require_env VERIFY_STALE_LOG_DIR
require_env BREV_BUDGET_USD

[ "${NEMOCLAW_NON_INTERACTIVE:-}" = "1" ] \
  || warn "NEMOCLAW_NON_INTERACTIVE is not '1' — interactive prompts may stall the run."

# Secrets (mounted via the blueprint's secret-injection path).
[ -n "${BREV_API_TOKEN:-}" ] || fail "BREV_API_TOKEN is not set; the maintainer sandbox cannot reach Brev."
[ -n "${GH_TOKEN:-}" ] || fail "GH_TOKEN is not set; the skill cannot post comments or read issue state."

# gh auth — token works AND has scopes we need.
gh auth status >/dev/null 2>&1 || fail "gh auth status failed; GH_TOKEN is missing or invalid."
gh_scopes=$(gh auth status 2>&1 | grep -oE "Token scopes: .*" || true)
case "$gh_scopes" in
  *repo*) ;;
  *) fail "GH_TOKEN missing 'repo' scope — label and comment writes will fail. Got: $gh_scopes" ;;
esac

# brev auth — `brev ls` is the cheapest reachability check.
brev ls >/dev/null 2>&1 \
  || fail "brev ls failed; BREV_API_TOKEN missing/invalid or the brev preset isn't allowing egress."

info "Environment looks good (brev, gh, jq, git all callable; tokens accepted)."

# -----------------------------------------------------------------------------
# Phase 2 — log dir setup
# -----------------------------------------------------------------------------

info "Phase 2 — log dir setup ($VERIFY_STALE_LOG_DIR)"

mkdir -p "$VERIFY_STALE_LOG_DIR"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$VERIFY_STALE_LOG_DIR/$RUN_ID"
mkdir -p "$RUN_DIR"
ln -sfn "$RUN_DIR" "$VERIFY_STALE_LOG_DIR/latest"
info "Run directory: $RUN_DIR (also available at \$VERIFY_STALE_LOG_DIR/latest)"

cat > "$RUN_DIR/run-config.json" <<EOF
{
  "run_id": "$RUN_ID",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "auto_approve": "${VERIFY_STALE_AUTO_APPROVE}",
  "dry_run": "${VERIFY_STALE_DRY_RUN}",
  "batch_cap": ${VERIFY_STALE_BATCH_CAP},
  "log_dir": "${VERIFY_STALE_LOG_DIR}",
  "budget_usd": ${BREV_BUDGET_USD},
  "force_ollama_only": "${VERIFY_STALE_FORCE_OLLAMA_ONLY:-0}"
}
EOF

# -----------------------------------------------------------------------------
# Phase 3 — agent session
# -----------------------------------------------------------------------------
#
# The verify-stale skill is read by an OpenClaw agent running inside this
# sandbox. The agent loads SKILL.md and follows its Step 1..7 workflow,
# honoring the env vars set in the blueprint. We invoke a single agent
# session with a starter prompt that pins batch mode + the dogfood
# configuration.
#
# The exact agent CLI for non-interactive runs is the operator's choice
# (and depends on which OpenClaw build is in the sandbox image). The two
# patterns that work today:
#
#   Option A — `openclaw chat` with --message + --skill flags
#     openclaw chat --skill nemoclaw-maintainer-verify-stale \
#                   --message "$(cat $RUN_DIR/starter-prompt.txt)" \
#                   --non-interactive
#
#   Option B — pipe the prompt to `openclaw run --headless`
#     openclaw run --headless --skill nemoclaw-maintainer-verify-stale \
#                  < $RUN_DIR/starter-prompt.txt
#
# Pick whichever the sandbox image exposes; the operator should set
# OPENCLAW_RUN_CMD before invoking this script if it deviates from the
# defaults below.

cat > "$RUN_DIR/starter-prompt.txt" <<EOF
Run the nemoclaw-maintainer-verify-stale skill in batch mode against the
NemoClaw issue tracker.

Configuration:
  - Cap: $VERIFY_STALE_BATCH_CAP candidates (honors VERIFY_STALE_BATCH_CAP)
  - Auto-approve: $VERIFY_STALE_AUTO_APPROVE (the Step 3 self-check drives
    provisioning directly; no maintainer prompt)
  - Dry run: $VERIFY_STALE_DRY_RUN (Step 10 writes comment-draft.md + updates
    metadata.json instead of posting + applying labels)
  - Force Ollama-only candidates: ${VERIFY_STALE_FORCE_OLLAMA_ONLY:-0}
    (filter step drops any candidate whose BUG_PROVIDER != ollama)
  - Log root: $VERIFY_STALE_LOG_DIR
  - Run dir: $RUN_DIR (per-candidate subdirs <issue-number>/ here)
  - Budget: \$$BREV_BUDGET_USD (self-check #7 enforces)

Begin with Step 1 of SKILL.md. After each candidate completes, write a
one-line entry to $RUN_DIR/activity.md so the orchestrator can pick it
up on the post-run sweep.
EOF

info "Phase 3 — agent session (starter prompt at $RUN_DIR/starter-prompt.txt)"

OPENCLAW_RUN_CMD="${OPENCLAW_RUN_CMD:-openclaw chat --skill nemoclaw-maintainer-verify-stale --message-file $RUN_DIR/starter-prompt.txt --non-interactive}"

info "Invoking: $OPENCLAW_RUN_CMD"
info "Agent stdout → $RUN_DIR/agent.log (tail -f to watch from another shell)"

# Don't fail the whole orchestrator if the agent exits non-zero — we still
# want to capture partial state, sweep stragglers, and post a wrap-up.
set +e
$OPENCLAW_RUN_CMD > "$RUN_DIR/agent.log" 2>&1
AGENT_EXIT=$?
set -e
info "Agent exited with code $AGENT_EXIT"

# -----------------------------------------------------------------------------
# Phase 4 — straggler sweep
# -----------------------------------------------------------------------------
#
# The skill's per-candidate trap should tear down each Brev verification
# sandbox on exit, but a crashed agent or a `brev exec` SSH-drop bug can
# leave orphans. Sweep anything named `verify-stale-*`.

info "Phase 4 — straggler sweep (verify-stale-* Brev instances)"

stragglers=$(brev ls --json 2>/dev/null \
  | jq -r '.[] | select(.name | startswith("verify-stale-")) | .name' \
  || true)

if [ -n "$stragglers" ]; then
  warn "Found stragglers:"
  printf '%s\n' "$stragglers" | sed 's/^/  - /' >&2
  while IFS= read -r box; do
    [ -z "$box" ] && continue
    info "  brev delete $box"
    brev delete "$box" >/dev/null 2>&1 || warn "    failed to delete $box (manual cleanup needed)"
  done <<<"$stragglers"
else
  info "  no stragglers"
fi

# -----------------------------------------------------------------------------
# Phase 5 — run-summary.json
# -----------------------------------------------------------------------------

info "Phase 5 — aggregating run-summary.json"

# Walk per-issue subdirs and collect each one's score.json + self-check.json.
SUMMARY="$RUN_DIR/run-summary.json"

python3 - "$RUN_DIR" "$SUMMARY" <<'PY'
import json, os, sys, glob
run_dir, out_path = sys.argv[1], sys.argv[2]
issues = []
for issue_dir in sorted(glob.glob(os.path.join(run_dir, "[0-9]*"))):
    issue_num = os.path.basename(issue_dir)
    rec = {"issue": f"#{issue_num}"}
    for f, key in [("metadata.json", "metadata"),
                   ("self-check.json", "self_check"),
                   ("score.json", "score")]:
        p = os.path.join(issue_dir, f)
        if os.path.exists(p):
            try:
                rec[key] = json.load(open(p))
            except Exception as e:
                rec[key] = {"_parse_error": str(e)}
    issues.append(rec)

verdicts = {}
for r in issues:
    v = (r.get("score") or {}).get("verdict") or (r.get("self_check") or {}).get("verdict") or "unknown"
    verdicts[v] = verdicts.get(v, 0) + 1

summary = {
    "run_dir": run_dir,
    "candidate_count": len(issues),
    "verdict_histogram": verdicts,
    "issues": issues,
}
json.dump(summary, open(out_path, "w"), indent=2)
print(f"wrote {out_path}")
PY

cat "$SUMMARY" | jq '{candidate_count, verdict_histogram}'

# -----------------------------------------------------------------------------
# Phase 6 — wrap-up Gist
# -----------------------------------------------------------------------------
#
# Durable copy of the run beyond the sandbox's lifetime. Private Gist;
# update the visibility flag if your team wants org-wide sharing.

info "Phase 6 — wrap-up Gist"

GIST_URL=$(gh gist create \
  --desc "verify-stale dogfood run $RUN_ID (dry_run=$VERIFY_STALE_DRY_RUN, cap=$VERIFY_STALE_BATCH_CAP)" \
  "$RUN_DIR/run-config.json" \
  "$RUN_DIR/run-summary.json" \
  "$RUN_DIR/agent.log" \
  $([ -f "$RUN_DIR/activity.md" ] && echo "$RUN_DIR/activity.md") \
  2>&1 | grep -oE 'https://gist.github.com/[^[:space:]]+' || true)

if [ -n "$GIST_URL" ]; then
  info "Wrap-up Gist: $GIST_URL"
  echo "$GIST_URL" > "$RUN_DIR/gist-url.txt"
else
  warn "Gist creation failed — full run artifacts remain at $RUN_DIR on the persistent volume."
fi

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------

if [ "$AGENT_EXIT" -ne 0 ]; then
  warn "Agent exited non-zero ($AGENT_EXIT); review $RUN_DIR/agent.log for the cause."
  exit "$AGENT_EXIT"
fi

info "Done. Review $RUN_DIR/run-summary.json (or the wrap-up Gist) for results."
info "If VERIFY_STALE_DRY_RUN=1 and the drafts look right, re-run with VERIFY_STALE_DRY_RUN=0 for the live pass."
