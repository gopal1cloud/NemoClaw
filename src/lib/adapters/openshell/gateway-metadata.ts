// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface GatewayMetadata {
  name: string;
  gateway_endpoint: string;
  is_remote?: boolean;
  gateway_port?: number;
  remote_host?: string;
  resolved_host?: string;
  auth_mode?: string | null;
  edge_team_domain?: string;
  edge_auth_url?: string;
  oidc_issuer?: string;
  oidc_client_id?: string;
  oidc_audience?: string;
  oidc_scopes?: string;
}

export interface ResolvedGatewayMetadata {
  name: string;
  endpoint: URL;
  target: string;
  authMode: "plaintext" | "mtls";
  metadataPath: string | null;
  gatewayDir: string | null;
  mtlsDir: string | null;
  insecureTls: boolean;
}

export interface GatewayMetadataOptions {
  env?: NodeJS.ProcessEnv;
  gatewayName?: string;
  gatewayEndpoint?: string;
  gatewayInsecure?: boolean;
}

function configRoot(env: NodeJS.ProcessEnv): string {
  return path.join(env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), ".config"), "openshell");
}

function activeGatewayPath(env: NodeJS.ProcessEnv): string {
  return path.join(configRoot(env), "active_gateway");
}

function gatewaysDir(env: NodeJS.ProcessEnv): string {
  return path.join(configRoot(env), "gateways");
}

function sanitizeGatewayName(name: string): string {
  return name
    .split("")
    .map((ch) => (/[A-Za-z0-9._-]/.test(ch) ? ch : "_"))
    .join("");
}

function readActiveGateway(env: NodeJS.ProcessEnv): string | null {
  try {
    const name = fs.readFileSync(activeGatewayPath(env), "utf-8").trim();
    return name || null;
  } catch {
    return null;
  }
}

function readGatewayMetadata(name: string, env: NodeJS.ProcessEnv): {
  metadata: GatewayMetadata;
  metadataPath: string;
  gatewayDir: string;
} {
  const safeName = sanitizeGatewayName(name);
  const gatewayDir = path.join(gatewaysDir(env), safeName);
  const metadataPath = path.join(gatewayDir, "metadata.json");
  const raw = fs.readFileSync(metadataPath, "utf-8");
  const parsed = JSON.parse(raw) as GatewayMetadata;
  return { metadata: parsed, metadataPath, gatewayDir };
}

function parseEndpoint(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch (error) {
    throw new Error(
      `OpenShell gateway endpoint '${endpoint}' is not a valid URL: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `OpenShell gateway endpoint '${endpoint}' must use http:// or https:// for gRPC.`,
    );
  }
  return url;
}

function endpointTarget(url: URL): string {
  if (url.port) return url.host;
  return `${url.hostname}:${url.protocol === "https:" ? 443 : 80}`;
}

function normalizeAuthMode(mode: string | null | undefined, url: URL): "plaintext" | "mtls" {
  const normalized = (mode || "").trim().toLowerCase();
  if (!normalized) return url.protocol === "http:" ? "plaintext" : "mtls";
  if (normalized === "mtls") {
    if (url.protocol !== "https:") {
      throw new Error(
        `OpenShell gateway auth mode 'mtls' requires an https:// endpoint, got '${url.toString()}'.`,
      );
    }
    return "mtls";
  }
  if (normalized === "plaintext") {
    if (url.protocol !== "http:") {
      throw new Error(
        `OpenShell gateway auth mode 'plaintext' requires an http:// endpoint, got '${url.toString()}'.`,
      );
    }
    return "plaintext";
  }
  if (normalized === "cloudflare_jwt" || normalized === "oidc") {
    throw new Error(
      `OpenShell gateway auth mode '${normalized}' is bearer-token based. ` +
        "NemoClaw's direct gRPC transport currently supports local plaintext and mTLS gateways only. " +
        "Select a local NemoClaw gateway or configure mTLS for this gateway.",
    );
  }
  throw new Error(
    `OpenShell gateway auth mode '${normalized}' is not supported by NemoClaw's direct gRPC transport. ` +
      "Supported modes: plaintext, mtls.",
  );
}

export function resolveGatewayMetadata(
  options: GatewayMetadataOptions = {},
): ResolvedGatewayMetadata {
  const env = options.env ?? process.env;
  const endpointOverride =
    options.gatewayEndpoint || env.OPENSHELL_GATEWAY_ENDPOINT || env.OPENSHELL_GATEWAY_URL;
  const gatewayName = options.gatewayName || env.OPENSHELL_GATEWAY || readActiveGateway(env);
  const insecureTls =
    options.gatewayInsecure === true ||
    env.OPENSHELL_GATEWAY_INSECURE === "1" ||
    env.OPENSHELL_GATEWAY_INSECURE === "true";

  if (endpointOverride) {
    const endpoint = parseEndpoint(endpointOverride);
    return {
      name: gatewayName || "endpoint",
      endpoint,
      target: endpointTarget(endpoint),
      authMode: normalizeAuthMode(endpoint.protocol === "http:" ? "plaintext" : "mtls", endpoint),
      metadataPath: null,
      gatewayDir: gatewayName ? path.join(gatewaysDir(env), sanitizeGatewayName(gatewayName)) : null,
      mtlsDir: gatewayName
        ? path.join(gatewaysDir(env), sanitizeGatewayName(gatewayName), "mtls")
        : null,
      insecureTls,
    };
  }

  if (!gatewayName) {
    throw new Error(
      "No active OpenShell gateway is configured. Run `openshell gateway select <name>` or set OPENSHELL_GATEWAY.",
    );
  }

  let loaded: ReturnType<typeof readGatewayMetadata>;
  try {
    loaded = readGatewayMetadata(gatewayName, env);
  } catch (error) {
    throw new Error(
      `Failed to load OpenShell gateway metadata for '${gatewayName}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const endpoint = parseEndpoint(loaded.metadata.gateway_endpoint);
  const authMode = normalizeAuthMode(loaded.metadata.auth_mode, endpoint);
  return {
    name: loaded.metadata.name || gatewayName,
    endpoint,
    target: endpointTarget(endpoint),
    authMode,
    metadataPath: loaded.metadataPath,
    gatewayDir: loaded.gatewayDir,
    mtlsDir: path.join(loaded.gatewayDir, "mtls"),
    insecureTls,
  };
}
