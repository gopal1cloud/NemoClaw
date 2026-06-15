// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";

// Load YAML lazily via require to match the rest of the onboard pipeline
// (see src/lib/sandbox/config.ts and src/lib/policy/index.ts). Importing
// statically would force `yaml` into the CLI cold-start path even when no
// agents manifest is supplied.
type YamlLoader = { parse(input: string): unknown };
function loadYaml(): YamlLoader {
  return require("yaml") as YamlLoader;
}

const ALLOWED_TOP_KEYS = new Set<string>(["agents", "defaults", "main"]);
const AGENT_DATA_ROOT = "/sandbox/.openclaw";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectedAgentPath(kind: "workspace" | "agentDir", id: string): string {
  const segment = kind === "workspace" ? `workspace-${id}` : `agents/${id}`;
  return `${AGENT_DATA_ROOT}/${segment}`;
}

function fillAgentDefaults(entry: Record<string, unknown>): Record<string, unknown> {
  const id = entry.id;
  if (typeof id !== "string" || !id) {
    return entry;
  }
  const out: Record<string, unknown> = { ...entry };
  if (out.workspace === undefined) {
    out.workspace = expectedAgentPath("workspace", id);
  }
  if (out.agentDir === undefined) {
    out.agentDir = expectedAgentPath("agentDir", id);
  }
  return out;
}

export interface AgentsManifestPayload {
  agents: unknown[];
  defaults?: unknown;
  main?: unknown;
}

/**
 * Load and shallow-shape-check the agents manifest YAML. Heavy validation
 * (shape of each agent entry, model-ref/provider match, allowlists) lives
 * at the build-time validator in scripts/generate-openclaw-config.mts so
 * the build is the single source of truth for structured errors. We only
 * surface obvious early errors (missing file, top-level shape) and
 * auto-fill canonical workspace/agentDir paths from the agent id so the
 * caller can write a terse YAML.
 */
export function loadAgentsManifest(filePath: string): AgentsManifestPayload {
  const resolved = path.resolve(filePath);
  let raw: string;
  try {
    // Single fs call avoids the existsSync/statSync/readFileSync TOCTOU
    // window CodeQL flags as a race (CWE-367): the manifest path can change
    // between the pre-check and the read on a shared filesystem.
    raw = fs.readFileSync(resolved, "utf-8");
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr?.code === "ENOENT") {
      throw new Error(`--agents path not found: ${resolved}`);
    }
    if (nodeErr?.code === "EISDIR") {
      throw new Error(`--agents must point to a file: ${resolved}`);
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`--agents read error: ${reason}`);
  }
  let parsed: unknown;
  try {
    parsed = loadYaml().parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`--agents YAML parse error: ${reason}`);
  }
  if (parsed === null || parsed === undefined) {
    return { agents: [] };
  }
  if (!isObject(parsed)) {
    throw new Error("agents manifest must be a YAML mapping (object) at the top level");
  }
  for (const key of Object.keys(parsed)) {
    if (!ALLOWED_TOP_KEYS.has(key)) {
      const allowed = [...ALLOWED_TOP_KEYS].sort().join(", ");
      throw new Error(
        `agents manifest contains unsupported top-level field "${key}". Allowed: ${allowed}`,
      );
    }
  }
  const agentsRaw = parsed.agents;
  let agents: unknown[];
  if (agentsRaw === undefined || agentsRaw === null) {
    agents = [];
  } else if (!Array.isArray(agentsRaw)) {
    throw new Error("agents manifest 'agents' must be a list when present");
  } else {
    agents = agentsRaw.map((entry) => (isObject(entry) ? fillAgentDefaults(entry) : entry));
  }
  const out: AgentsManifestPayload = { agents };
  if (parsed.defaults !== undefined) {
    out.defaults = parsed.defaults;
  }
  if (parsed.main !== undefined) {
    out.main = parsed.main;
  }
  return out;
}

/**
 * Read the manifest at `filePath` and set `NEMOCLAW_EXTRA_AGENTS_JSON` so
 * the downstream Dockerfile patcher can base64-encode and bake it. The
 * patcher does not parse or shape-check the payload (that is the build
 * validator's job), so structured errors raised here would mask the
 * authoritative build-time errors; we keep host-side checks light.
 */
export function applyAgentsManifestEnv(filePath: string): AgentsManifestPayload {
  const payload = loadAgentsManifest(filePath);
  process.env.NEMOCLAW_EXTRA_AGENTS_JSON = JSON.stringify(payload);
  return payload;
}
