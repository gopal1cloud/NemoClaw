<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Pre-Provisioning Self-Check

Runs once per candidate, after the verification plan is composed and **before** any Brev provisioning (i.e., between Step 6 and Step 7). The point is to make the agent interrogate its own plan against a fixed checklist — catch gaps that would otherwise burn an hour of compute and a wrong verdict. In interactive mode it produces the report the maintainer approves against; in `VERIFY_STALE_AUTO_APPROVE=1` mode it produces the verdict the agent acts on directly.

The self-check **always runs** regardless of mode — it is a hard precondition for Brev provisioning, not a UX-only confirmation prompt. Skipping it on the autonomous path would defeat the safeguard.

## The nine checks

Each check produces `pass`, `caveat: <one-line reason>`, or `fail: <one-line reason>`. The aggregate verdict is computed from the per-check results.

| # | Check | Pass condition | Caveat condition | Fail condition |
|---|---|---|---|---|
| 1 | **Reproducer extractable** | A reproducer script was extracted verbatim or synthesized from the issue body, has `sg docker -c` blocks where Docker is touched, and is self-contained | Reproducer was synthesized (not verbatim) — score will be capped at the −30 synth penalty | No reproducer could be extracted *and* synthesis failed Step 8c gate |
| 2 | **Version validity** | `REPORTED_VERSION` exists in `gh api .../tags`, `LATEST > REPORTED`, and the version is at least 2 patch versions behind `LATEST` | Reported version is only 1 patch behind (verification is still useful but signal is weaker) | Reported version cannot be parsed, isn't a real tag, or is ≥ `LATEST` |
| 3 | **Bug class** | `BUG_CLASS` is one of `functional`, `performance`, `log-only`, `rebuild-cycle` AND matches the issue body's symptom shape | Class is `functional` but body describes performance symptoms (e.g. "10s p50") — flag for downgrade to performance | Class can't be determined from body + labels; the rubric branches downstream would route arbitrarily |
| 4 | **Provider reachable** | `BUG_PROVIDER=ollama`, OR provider is non-ollama AND a credential file exists at the expected mount path (`~/.nvidia-api-key`, `~/.openai-api-key`, etc.) | Non-ollama provider with credential mounted but not yet validated against the provider's health endpoint | Non-ollama provider AND no credential file (skill's Step 6 prompt would block in autonomous mode) |
| 5 | **Platform substitution** | Issue has `Platform: Ubuntu`, `Platform: All`, or no platform label | Issue has `Platform: DGX Spark` or `Platform: GB10` — Step 10 will emit the mandatory hardware-substitution caveat and the score caps at 60 | Issue has `Platform: Windows/WSL`, `Platform: MacOS`, or `Platform: Jetson` (Step 3 should have filtered already; this is the backstop) |
| 6 | **Tool drift** | `git log "$REPORTED..$LATEST" -S"$TOOL"` shows no commits touching the reproducer's primary tool in `src/`, `bin/`, or `nemoclaw/src/` | Tool was touched between the tags — Step 8d.5 multi-axis verification will fire | Tool was renamed or removed entirely (a "clean latest" would be a false-positive fixed verdict) |
| 7 | **Cost budget** | Projected wallclock ≤ remaining `BREV_BUDGET_USD` (default $200 for the whole batch) at the current SKU's hourly rate, with the standard 60-minute per-candidate cap | Projected wallclock would consume > 50% of the remaining budget in one candidate | Projected wallclock exceeds remaining budget; batch should halt and surface the partial results |
| 8 | **Token permissions** | `gh auth status` succeeds AND the token has `repo` scope for label/comment writes; `BREV_API_TOKEN` is present and a `brev ls` call succeeds | `BREV_API_TOKEN` works but is older than 60 days (rotate-soon flag) | Either token missing or insufficient scope; verification can't post the comment |
| 9 | **Idempotency** | No `<!-- nemoclaw-verify-stale v\d+ YYYY-MM-DD -->` marker in the last 7 days of comments on this issue, AND no `fixed-on-latest` / `verify-inconclusive` label | A marker exists but is older than 7 days (skill re-verifies on a TTL refresh) | A marker from the last 7 days exists; Step 3 should have skipped this; this is the backstop |

## Verdict computation

- **All checks pass** → `PROCEED`. Continue to Step 7.
- **Any check produces `caveat:`** AND no check fails → `PROCEED-WITH-CAVEATS`. Continue to Step 7. Each caveat is appended to `metadata.json` and is folded into the Step 9 score cap (e.g., check #5 caveat enforces the `Platform: DGX Spark` cap at 60; check #1 caveat enforces the synth-repro −30).
- **Any check fails** → `SKIP`. Do not provision Brev. Log the failure to `$VERIFY_STALE_LOG_DIR/<issue>/self-check.json`, post no comment, and continue to the next candidate in batch mode (or exit 1 in single-issue mode).

## Output format

```json
{
  "issue": "#NNNN",
  "ran_at": "YYYY-MM-DDTHH:MM:SSZ",
  "verdict": "PROCEED|PROCEED-WITH-CAVEATS|SKIP",
  "checks": {
    "reproducer_extractable": "pass",
    "version_validity": "pass",
    "bug_class": "caveat: body says '10s p50' but BUG_CLASS=functional; downgrading to performance",
    "provider_reachable": "pass",
    "platform_substitution": "caveat: Platform: DGX Spark - score caps at 60",
    "tool_drift": "pass",
    "cost_budget": "pass",
    "token_perms": "pass",
    "idempotency": "pass"
  },
  "score_cap": 60,
  "skip_reason": null
}
```

`SKIP` shape: `verdict=SKIP`, `skip_reason="check#N: <one-line>"`, no `score_cap`.

## Mode-dependent UX

| Mode | What the maintainer sees | What the agent does |
|---|---|---|
| Interactive (default) | Self-check report printed inline + "Approve / Skip / Adjust" prompt | Wait for input; honor the choice |
| `VERIFY_STALE_AUTO_APPROVE=1` | Self-check report appended to `$VERIFY_STALE_LOG_DIR/<issue>/self-check.json` only — no stdout prompt | Act on the verdict directly: `PROCEED` and `PROCEED-WITH-CAVEATS` → Step 7; `SKIP` → next candidate |

The self-check is the *autonomous-mode safety net*. If it grows to feel like rubber-stamping (the maintainer is always hitting "Approve"), tighten the failure conditions on the highest-cost checks (#1, #4, #6) so genuine red flags route to `SKIP` instead of `PROCEED-WITH-CAVEATS`. If it grows to feel like over-filtering (skipping candidates the maintainer would have approved), loosen the same checks to `caveat`. The activity log in [scoring-comments-and-logging.md](scoring-comments-and-logging.md) captures verdict distributions across runs so this calibration is data-driven.
