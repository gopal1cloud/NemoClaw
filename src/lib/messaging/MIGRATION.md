<!--
  SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Messaging Channel Manifest Migration

This plan tracks the remaining migration from concrete channel logic in core code
to manifest-owned metadata and hooks under `src/lib/messaging/channels/*`.

Required channels for this pass:

- Telegram
- WeChat
- Slack
- Discord

WhatsApp is optional for this pass, but shared helpers must remain generic so
WhatsApp can continue using the same framework.

## Goals

- Keep all channel-specific metadata in channel manifests.
- Keep all channel-specific behavior in channel hook implementations.
- Keep common orchestration, persistence, provider binding, policy application,
  and conflict detection in shared messaging framework code.
- Treat `SandboxEntry.messaging.plan` as the durable messaging source of truth.
- Do not introduce another durable state source for channel config.
- Do not persist raw messaging secrets in host-side state.
- Preserve current CLI behavior while replacing hard-coded channel branches.

## Non-Goals

- Do not rewrite the full messaging compiler/applier architecture.
- Do not migrate unrelated inference, gateway, or policy behavior.
- Do not require WhatsApp behavior changes unless a generic helper naturally
  affects it.
- Do not remove legacy compatibility fields until the registry-backed plan path
  is verified for existing sandboxes.

## Hook-First Migration Model

The migration should define the complete hook phase contract first, then migrate
each concrete behavior into either a common hook or a channel-specific hook. Core
code should call `src/lib/messaging/applier` phase runners instead of directly
calling Telegram, WeChat, Slack, or Discord implementation details.

Execution model:

1. The compiler produces a serializable `SandboxMessagingPlan`.
2. The caller invokes a phase runner from `src/lib/messaging/applier`.
3. The applier selects enabled channel hooks for the requested phase.
4. Common hooks run where the behavior is shared across channels.
5. Channel-specific hooks run only from the owning channel directory.
6. The applier returns structured results; CLI code handles prompts, output, and
   exit behavior at the edge.

Direct calls from core to concrete channel implementation should disappear. A
core call site may call `MessagingSetupApplier`, `MessagingHostStateApplier`, or
another applier entrypoint, but should not import channel-specific hook files.

## Required Hook Phases

### Existing Phases To Keep

- `enroll`
  - collects channel inputs and secrets
  - already used by token-paste and WeChat QR login hooks
- `reachability-check`
  - validates freshly collected enrollment inputs
  - already used by Telegram getMe-style checks
- `agent-install`
  - produces build-time package install steps
  - already used by OpenClaw channel package installation
- `render`
  - produces agent config render fragments
  - keep as a compiler/render phase
- `apply`
  - applies config into an existing sandbox
  - already partially handled by `applyAgentConfigAtOpenShell`
- `post-agent-install`
  - runs after package install/config render when a channel needs generated
    files or final config patching
  - already used by WeChat account seeding
- `health-check`
  - runs after create/rebuild and before lifecycle success is reported
- `status`
  - cheap bounded status checks for `status` and `channels status`
- `diagnostic`
  - deeper or slower diagnostics used by `doctor` or explicit channel checks

### New Phases To Add

- `pre-enable`
  - host-side checks after plan compilation and before provider, policy,
    registry, or sandbox mutation
  - used for channel-specific blocking/warning checks such as Slack Socket Mode
    gateway conflict
- `runtime-preload`
  - sandbox-side startup behavior that must be installed before OpenClaw starts
  - used for Telegram diagnostics preload, Slack channel guard, Slack runtime
    normalization/tripwire, and WeChat diagnostics preload

State replay is not a hook phase. `SandboxEntry.messaging.plan` remains the
durable source of truth, and `plan.stateUpdates` should be applied by common
applier code. Legacy session fields such as `telegramConfig` and `wechatConfig`
can remain read-only compatibility fallbacks while the plan path is completed.

## Phase Ownership

### `pre-enable`

Applier responsibilities:

- preserve common credential conflict detection as shared guard logic, not as a
  hook
- run channel-specific `pre-enable` hooks
- normalize failure into a structured result:
  - proceed
  - warn and ask
  - abort
  - skipped because phase is not relevant

Call sites:

- `src/lib/onboard/sandbox-messaging-preflight.ts`
  - after reading the staged `SandboxMessagingPlan`
  - before create/recreate continues into provider/policy setup
- `src/lib/actions/sandbox/policy-channel.ts`
  - `channels add`: after `planSandboxChannelAdd()`, before provider/policy
    registration and before `MessagingHostStateApplier.applyPlanToRegistry()`
  - `channels start`: before persisting the re-enabled plan

Concrete behavior to migrate:

- common credential conflict checks from:
  - `src/lib/onboard/messaging-conflict-guard.ts`
  - `src/lib/actions/sandbox/policy-channel.ts`
  - keep this as shared guard behavior because it applies to every credentialed
    channel
- Slack Socket Mode gateway conflict from:
  - `src/lib/messaging/applier/conflict-detection/slack-socket-mode.ts`
  - `src/lib/onboard/messaging-conflict-guard.ts`
  - `src/lib/actions/sandbox/policy-channel.ts`
  - migrate this channel-specific axis into a Slack `pre-enable` hook

### `runtime-preload`

Applier responsibilities:

- collect runtime preload hooks for enabled channels
- stage any preload scripts or generated shell fragments needed by the sandbox
- expose a shell-consumable plan artifact for `scripts/nemoclaw-start.sh`
- keep startup behavior channel-owned even when shell performs the final install

Concrete behavior to migrate:

- Telegram diagnostics preload:
  - `scripts/nemoclaw-start.sh`
  - `nemoclaw-blueprint/scripts/telegram-diagnostics.js`
- Slack channel guard preload:
  - `scripts/nemoclaw-start.sh`
  - `nemoclaw-blueprint/scripts/slack-channel-guard.js`
- Slack runtime env normalization and secret tripwire:
  - `scripts/nemoclaw-start.sh`
- WeChat diagnostics preload:
  - `nemoclaw-blueprint/scripts/wechat-diagnostics.js`

Implementation note:

- Shell cannot import TypeScript manifests directly.
- The applier should generate/stage a compact runtime artifact that shell can
  consume without knowing channel details.

### `health-check`

Applier responsibilities:

- run `plan.healthChecks` after create/rebuild readiness
- call hook handlers through the central hook runner
- keep checks bounded and deterministic
- return structured check results to the lifecycle caller

Concrete behavior to migrate:

- WeChat health check application:
  - `src/lib/messaging/channels/wechat/hooks/health-check.ts`
- Telegram bridge startup and DM allowlist warnings:
  - moved into `telegram-openclaw-bridge-health` manifest output
- OpenClaw bridge startup verification for Telegram/Discord/Slack:
  - moved into static `health-check` hook outputs consumed by
    `src/lib/actions/sandbox/policy-channel.ts`

### `status`

Applier responsibilities:

- expose a cheap status runner for configured/enabled channels
- use manifest/hook-provided runtime aliases and log signatures
- avoid deep probes or long waits

Concrete behavior to migrate:

- runtime config key aliases and log patterns:
  - `src/lib/channel-runtime-status.ts`
- Telegram conflict log signatures:
  - `src/lib/status-command-deps.ts`
- Slack gateway overlap reporting:
  - `src/lib/status-command-deps.ts`
  - `src/lib/messaging/applier/conflict-detection/slack-socket-mode.ts`
- channel display/known-channel validation:
  - `src/lib/actions/sandbox/channel-status.ts`

### `diagnostic`

Applier responsibilities:

- run deeper channel diagnostics when explicitly requested
- allow channel-specific diagnostic output while keeping the CLI orchestration
  common
- keep common parsers generic and channel signatures hook-owned

Concrete behavior to migrate:

- detailed runtime channel checks currently split across:
  - `src/lib/channel-runtime-status.ts`
  - `src/lib/actions/sandbox/channel-status.ts`
  - `src/lib/actions/sandbox/doctor.ts`

### State Updates

State updates stay in common applier code, not in concrete core branches.

Applier responsibilities:

- apply `plan.stateUpdates`
- persist serializable channel config into `SandboxEntry.messaging.plan`
- replay config for rebuild planning from the plan
- keep secrets out of host-side state

Concrete behavior to migrate:

- Telegram mention mode drift/config handling in:
  - `src/lib/onboard/messaging-config.ts`
  - `src/lib/onboard/sandbox-build-patch-config.ts`
  - `src/lib/onboard/machine/handlers/sandbox.ts`
- WeChat config gather/hydration/drift handling in:
  - `src/lib/onboard/wechat-config.ts`
  - `src/lib/actions/sandbox/rebuild.ts`
  - `src/lib/actions/sandbox/policy-channel.ts`
  - `src/lib/onboard/sandbox-build-patch-config.ts`
  - `src/lib/onboard/machine/handlers/sandbox.ts`

## Straggler Inventory

### Channel Catalog and Metadata

- `src/lib/sandbox/channels.ts`
  - old channel catalog with env keys, prompts, token formats, labels, login
    modes, and config env keys
- `src/lib/messaging-channel-config.ts`
  - config env aliases, including Discord aliases
- `src/lib/onboard/messaging-prep.ts`
  - static provider/env mapping
- `src/lib/onboard/messaging-reuse.ts`
  - hard-coded provider names
- `src/lib/onboard/messaging-credentials.ts`
  - env-key-to-channel mapping
- `src/lib/onboard/extra-placeholder-keys.ts`
  - messaging credential placeholder keys
- `src/lib/onboard/sandbox-provider-cleanup.ts`
  - hard-coded provider suffix cleanup
- `src/lib/actions/sandbox/snapshot.ts`
  - hard-coded provider suffixes
- `src/lib/credentials/store.ts`
  - static messaging credential env keys
- `src/lib/credentials/command-support.ts`
  - concrete bridge provider suffixes
- `src/lib/security/redact.ts`
  - concrete messaging token redaction keys

### Policy

- `src/lib/policy/index.ts`
  - policy labels, aliases, and Discord-specific messaging
- `src/lib/onboard/policy-presets.ts`
  - explicit channel env to preset suggestions
- `src/lib/onboard/initial-policy.ts`
  - Hermes messaging policy key mapping
- `src/lib/onboard/messaging-policy-presets.ts`
  - Slack-specific required preset mapping

### Build and Agent Install

- `src/lib/messaging/applier/build/messaging-build-applier.mts`
  - OpenClaw package allowlist for Discord, Slack, WeChat
- `src/lib/sandbox/build-context.ts`
  - stages Slack-specific patch script
- `scripts/patch-openclaw-slack-deny-feedback.mts`
  - Slack package compatibility patch

### Runtime Scripts

- `scripts/nemoclaw-start.sh`
  - placeholder key lists
  - Telegram/Discord/OpenClaw credential field mapping
  - Slack env normalization
  - Slack secret tripwire
  - Telegram diagnostics install
  - Slack guard install
  - hard-coded channel command help
- `scripts/lib/sandbox-init.sh`
  - active channel logging for Telegram/Discord/Slack
- `scripts/install.sh`
  - non-interactive env help for Discord/Slack/Telegram

### WeChat Host-Side Logic

- `src/lib/host-qr-handlers.ts`
  - old host QR handler registry
- `src/ext/wechat/login.ts`
  - WeChat login implementation
- `src/ext/wechat/qr.ts`
  - WeChat QR rendering/helper implementation

Keep implementation helpers if useful, but invoke them only from WeChat channel
hooks.

### Runtime Status

- `src/lib/channel-runtime-status.ts`
  - runtime config key map and gateway log patterns
- `src/lib/status-command-deps.ts`
  - Telegram and Slack concrete status signatures
- `src/lib/actions/sandbox/channel-status.ts`
  - known channel validation and WhatsApp-specialized diagnostics

## Implementation Sequence

### Step 0: Plan Approval

- Add this migration plan.
- Do not change runtime behavior.
- Wait for maintainer approval before implementation.

### Step 1: Define Phase Contracts

Add all required phase names to `ChannelHookPhase` before migrating behavior.

Required additions:

- `pre-enable`
- `runtime-preload`

Keep existing phases:

- `enroll`
- `reachability-check`
- `agent-install`
- `render`
- `apply`
- `post-agent-install`
- `health-check`
- `status`
- `diagnostic`

Do not add separate applier phase unions or speculative phase result types in
this step. Applier execution should use `ChannelHookPhase`,
`MessagingHookApplyRequest`, and `MessagingHookRunResult` unless a later runner
needs a concrete additional contract.

Validation:

- `npm run typecheck:cli`
- manifest type tests
- hook runner tests

### Step 2: Centralize Phase Execution In Applier

Create applier entrypoints that all core call sites can use.

Expected entrypoints:

- `applyPreEnableChecks(plan, context)`
- `applyRuntimePreloads(plan, context)`
- `applyHealthChecks(plan, context)`
- `applyStatusChecks(plan, context)`
- `applyDiagnostics(plan, context)`
- shared hook request builder for all phases

The applier should:

- select enabled plan channels
- select hooks matching the phase
- run common phase hooks before channel-specific hooks when both apply
- honor hook failure policy
- return structured results instead of printing or exiting directly
- introduce result/context types only when the first real runner needs them

Validation:

- hook runner tests
- applier tests with fake plans and fake hooks
- plan-filter tests

### Step 3: Implement Common Hooks

Implement common hooks for behavior shared across channels.

Initial common hooks:

- plan state update/replay helper, invoked by applier state code rather than
  concrete core branches
- generic runtime channel config/log comparison for `status`
- generic provider/policy metadata helpers where they are currently hard-coded

Do not move the shared credential conflict guard into a hook. It applies to
every credentialed channel and should remain a shared guard that runs before
channel-specific `pre-enable` hooks.

Validation:

- conflict detection tests
- host-state applier tests
- channel runtime status tests

### Step 4: Implement Channel-Specific Hooks

Move channel-specific behavior into the owning channel directory.

Custom hook inventory by phase:

| Phase | Channel | Hook | Migration status |
|---|---|---|---|
| `pre-enable` | Slack | `slack-socket-mode-gateway-conflict` | migrated |
| `runtime-preload` | Slack | `slack-runtime-preload` | migrated |
| `runtime-preload` | Telegram | `telegram-runtime-preload` | migrated |
| `runtime-preload` | WeChat | `wechat-runtime-preload` | migrated |
| `runtime-preload` | WhatsApp | `whatsapp-runtime-preload` | migrated, optional channel |
| `runtime-preload` | Discord | none | no current runtime preload behavior found |
| `health-check` | Telegram | `telegram-openclaw-bridge-health` | migrated |
| `health-check` | WeChat | `wechat-health-check` | migrated caller path |
| `health-check` | Slack | `slack-openclaw-bridge-health` | migrated |
| `health-check` | Discord | `discord-openclaw-bridge-health` | migrated |
| `status` | Telegram | getUpdates conflict/status signatures | migrated |
| `status` | Slack | gateway overlap reporting | migrated |
| `status` | Discord | runtime alias/log signatures | migrated |
| `diagnostic` | Telegram | common channel status/policy diagnostics | migrated, common helper |
| `diagnostic` | Slack | common channel status plus manifest status overlap | migrated, common helper |
| `diagnostic` | Discord | common policy/config diagnostics | migrated, common helper |
| `diagnostic` | WeChat | common channel status/policy diagnostics | migrated, common helper |
| `diagnostic` | WhatsApp | common metadata plus existing optional QR deep probe | migrated, optional channel |

Slack hooks:

- `pre-enable`: Socket Mode gateway conflict
- `runtime-preload`: channel guard install, runtime placeholder normalization,
  secret-on-disk tripwire
- `status`: gateway overlap reporting

Telegram hooks:

- `reachability-check`: keep getMe-style verification
- `runtime-preload`: diagnostics preload
- `health-check`: bridge startup and DM allowlist warnings
- `status`: getUpdates conflict signature

WeChat hooks:

- `enroll`: keep host QR login
- `post-agent-install`: keep account seeding
- `runtime-preload`: diagnostics preload
- `health-check`: account/iLink sanity

Discord hooks:

- `agent-install`: package install metadata
- `status`: runtime alias/log signature
- `diagnostic`: handled by common manifest-derived channel status helper

Validation:

- channel hook unit tests
- existing Telegram/Slack/WeChat tests
- manifest tests confirming hooks are declared by channel manifests

### Step 5: Migrate Core Call Sites To Applier Calls

Replace concrete channel calls in core with applier phase calls.

Primary migrations:

- onboard/create preflight calls `applyPreEnableChecks`
- `channels add` calls `applyPreEnableChecks`
- `channels start` calls `applyPreEnableChecks`
- create/rebuild finalization calls `applyHealthChecks`
- status commands call `applyStatusChecks`
- doctor/deep diagnostics call `applyDiagnostics`
- sandbox build/start path consumes `applyRuntimePreloads` outputs

Validation:

- onboard messaging tests
- channels add/start/stop/remove tests
- status and doctor tests
- rebuild tests

### Step 6: Plan-Owned State Replay

Make `SandboxEntry.messaging.plan` the authoritative source for channel config
replay through common applier state handling.

Migrate:

- Telegram mention mode
- WeChat account/base URL/user ID
- Slack allowed users/channels
- Discord allowed IDs/server IDs

Keep old session fields as read-only compatibility fallback where needed, but
stop writing new channel state there once the plan path is active.

Validation:

- onboard session plan tests
- rebuild plan tests
- WeChat manifest tests
- Telegram config tests

### Step 7: Manifest Metadata Adapter

After phase runners are in place, replace remaining metadata-only hard-coded
lists with manifest-backed helpers.

Shared helpers should resolve:

- available channels by agent
- credential env keys
- channel for env key
- provider names and suffixes
- config env keys and aliases
- policy presets and policy key aliases
- OpenClaw runtime channel keys and aliases
- package install specs

Replace `src/lib/sandbox/channels.ts` with a compatibility adapter over this
metadata. Keep its public shape stable for existing callers.

Validation:

- `npm run typecheck:cli`
- targeted tests for `src/lib/sandbox/channels.ts`
- manifest registry/compiler tests

### Step 8: Remove Remaining Hard-Coded Lists

Replace remaining concrete channel lists with manifest/applier-derived helpers.

Primary files:

- `src/lib/onboard/messaging-prep.ts`
- `src/lib/onboard/messaging-reuse.ts`
- `src/lib/onboard/messaging-credentials.ts`
- `src/lib/onboard/policy-presets.ts`
- `src/lib/onboard/initial-policy.ts`
- `src/lib/onboard/messaging-policy-presets.ts`
- `src/lib/actions/sandbox/snapshot.ts`
- `src/lib/credentials/store.ts`
- `src/lib/credentials/command-support.ts`
- `src/lib/security/redact.ts`
- `scripts/lib/sandbox-init.sh`
- `scripts/install.sh`

Treat `src/lib/deploy/index.ts` as optional/legacy unless deploy messaging
support is confirmed in scope.

Validation:

- `npm run typecheck:cli`
- targeted messaging tests
- `npm test` when behavior changes cross CLI boundaries

## Approval Gate

Implementation should start only after this hook-first plan is approved.

Proposed first implementation task after approval:

1. Add `pre-enable` and `runtime-preload` to `ChannelHookPhase`.
2. Add applier phase context/result types.
3. Add no-op applier phase runners with tests.
4. Keep runtime behavior unchanged until concrete hooks are migrated.

## Implementation Progress

Completed:

- Added `pre-enable` and `runtime-preload` to `ChannelHookPhase`.
- Added `MessagingSetupApplier.applyHooksForPhase()` and phase helpers that run
  manifest-declared hooks through the existing hook runner contract.
- Kept `enforceMessagingChannelConflicts` as shared guard behavior. Do not move
  the common credential conflict axis into a hook.
- Added Slack `pre-enable` hook `slack.socketModeGatewayConflict` for the
  Socket Mode gateway axis and declared it in the Slack manifest.
- Migrated `channels add` from direct Slack Socket Mode helper calls to
  `MessagingSetupApplier.applyHooksForPhase(plan, "pre-enable", ...)`.
- Migrated onboard's `enforceMessagingChannelConflicts` Slack gateway axis to
  the same Slack `pre-enable` hook while keeping the shared credential-conflict
  guard in place.
- Declared OpenClaw `runtime-preload` hook outputs in channel manifests for:
  - Slack runtime env aliasing, channel guard preload, and secret scan
  - Telegram diagnostics preload
  - WeChat diagnostics preload
  - WhatsApp compact-QR connect preload
- Migrated `scripts/nemoclaw-start.sh` from concrete channel preload functions
  to a generic runtime-preload consumer that reads active channel hook outputs
  from `NEMOCLAW_MESSAGING_PLAN_B64`.
- Declared static OpenClaw bridge startup health outputs for Telegram, Slack,
  and Discord, including Telegram DM allowlist warning metadata.
- Migrated `channels add` post-rebuild checks to
  `MessagingSetupApplier.applyHooksForPhase(plan, "health-check", ...)` and a
  generic health-check output consumer. The old Telegram action helper was
  removed.
- Declared static status outputs for:
  - OpenClaw runtime config aliases and gateway-log patterns for Telegram,
    Slack, Discord, WeChat, and WhatsApp
  - Telegram gateway-log conflict signatures
  - Slack single-gateway overlap reporting
- Migrated `channel-runtime-status`, bare `status` bridge checks, and status
  overlap reporting from concrete channel maps/branches to manifest-derived
  status outputs.
- Migrated common diagnostic metadata to a shared manifest-derived helper
  instead of channel hooks, since required channel diagnostics are the same
  registration/policy/status surface.
- Migrated `channels status` channel validation, default channel selection, and
  policy coverage from the legacy concrete channel registry to that common
  manifest helper.
- Migrated `doctor` messaging diagnostics to use common manifest-derived
  deep-probe hints and manifest-derived gateway-overlap status outputs.

Pending:

- Optional follow-up: relocate the existing WhatsApp in-sandbox QR probe body
  from `actions/sandbox/channel-status.ts` into a channel-owned diagnostic hook
  implementation if WhatsApp is pulled into required scope.
