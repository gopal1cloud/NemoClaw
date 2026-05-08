---
title:
  page: "NemoClaw Release Notes"
  nav: "Release Notes"
description:
  main: "Changelog and feature history for NemoClaw releases."
  agent: "Includes the NemoClaw release notes. Use when users ask about recent changes, the release cadence, or where to track versioned assets on GitHub."
keywords: ["nemoclaw release notes", "nemoclaw changelog"]
topics: ["generative_ai", "ai_agents"]
tags: ["nemoclaw", "releases"]
content:
  type: reference
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Release Notes

NVIDIA NemoClaw is available in early preview starting March 16, 2026. Use the following GitHub resources to track changes.

| Resource | Description |
|---|---|
| [Releases](https://github.com/NVIDIA/NemoClaw/releases) | Versioned release notes and downloadable assets. |
| [Release comparison](https://github.com/NVIDIA/NemoClaw/compare) | Diff between any two tags or branches. |
| [Merged pull requests](https://github.com/NVIDIA/NemoClaw/pulls?q=is%3Apr+is%3Amerged) | Individual changes with review discussion. |
| [Commit history](https://github.com/NVIDIA/NemoClaw/commits/main) | Full commit log on `main`. |

## Component Version Policy

NemoClaw pins the OpenClaw version inside the sandbox at build time via `min_openclaw_version` in `nemoclaw-blueprint/blueprint.yaml`; existing sandboxes do not auto-upgrade.
Run `nemoclaw <name> status` to see the OpenClaw version currently running in a sandbox, and `nemoclaw <name> rebuild` to pick up a newer pin from a NemoClaw upgrade.
See [Checking the OpenClaw version](../reference/commands.md#checking-the-openclaw-version) for the full policy.
