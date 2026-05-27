// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveGatewayMetadata } from "./gateway-metadata";

function writeGateway(home: string, name: string, metadata: Record<string, unknown>): void {
  const dir = path.join(home, ".config", "openshell", "gateways", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(metadata));
  fs.writeFileSync(path.join(home, ".config", "openshell", "active_gateway"), name);
}

describe("resolveGatewayMetadata", () => {
  it("resolves the active plaintext local gateway", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "openshell-gw-"));
    try {
      writeGateway(home, "nemoclaw", {
        name: "nemoclaw",
        gateway_endpoint: "http://127.0.0.1:8080",
        auth_mode: "plaintext",
      });

      const gateway = resolveGatewayMetadata({ env: { HOME: home } as NodeJS.ProcessEnv });

      expect(gateway.name).toBe("nemoclaw");
      expect(gateway.target).toBe("127.0.0.1:8080");
      expect(gateway.authMode).toBe("plaintext");
      expect(gateway.mtlsDir).toContain(path.join("gateways", "nemoclaw", "mtls"));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("rejects bearer-auth remote gateways with an actionable error", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "openshell-gw-"));
    try {
      writeGateway(home, "remote", {
        name: "remote",
        gateway_endpoint: "https://gateway.example.test",
        auth_mode: "oidc",
        is_remote: true,
      });

      expect(() =>
        resolveGatewayMetadata({ env: { HOME: home, OPENSHELL_GATEWAY: "remote" } as NodeJS.ProcessEnv }),
      ).toThrow(/supports local plaintext and mTLS gateways only/);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("resolves mTLS gateways to the local certificate bundle", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "openshell-gw-"));
    try {
      writeGateway(home, "secure", {
        name: "secure",
        gateway_endpoint: "https://127.0.0.1:17670",
        auth_mode: "mtls",
      });

      const gateway = resolveGatewayMetadata({ env: { HOME: home } as NodeJS.ProcessEnv });

      expect(gateway.target).toBe("127.0.0.1:17670");
      expect(gateway.authMode).toBe("mtls");
      expect(gateway.mtlsDir).toBe(
        path.join(home, ".config", "openshell", "gateways", "secure", "mtls"),
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("rejects mTLS metadata with a plaintext endpoint", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "openshell-gw-"));
    try {
      writeGateway(home, "bad", {
        name: "bad",
        gateway_endpoint: "http://127.0.0.1:8080",
        auth_mode: "mtls",
      });

      expect(() => resolveGatewayMetadata({ env: { HOME: home } as NodeJS.ProcessEnv })).toThrow(
        /requires an https:\/\/ endpoint/,
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("rejects plaintext metadata with a TLS endpoint", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "openshell-gw-"));
    try {
      writeGateway(home, "bad", {
        name: "bad",
        gateway_endpoint: "https://127.0.0.1:17670",
        auth_mode: "plaintext",
      });

      expect(() => resolveGatewayMetadata({ env: { HOME: home } as NodeJS.ProcessEnv })).toThrow(
        /requires an http:\/\/ endpoint/,
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
