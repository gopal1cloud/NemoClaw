// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const agentDir = path.join(process.cwd(), "agents", "langchain-deepagents-code");

function readAgentFile(name: string): string {
  return fs.readFileSync(path.join(agentDir, name), "utf8");
}

describe("LangChain Deep Agents Code image contracts", () => {
  it("hardens copied NemoClaw blueprints against sandbox-user mutation", () => {
    const dockerfile = readAgentFile("Dockerfile");

    expect(dockerfile).toContain("chown root:root /sandbox/.nemoclaw");
    expect(dockerfile).toContain("chmod 1755 /sandbox/.nemoclaw");
    expect(dockerfile).toContain("chown -R root:root /sandbox/.nemoclaw/blueprints");
    expect(dockerfile).toContain("chmod -R 755 /sandbox/.nemoclaw/blueprints");
    expect(dockerfile.indexOf("cp -r /opt/nemoclaw-blueprint/*")).toBeLessThan(
      dockerfile.indexOf("chown -R root:root /sandbox/.nemoclaw/blueprints"),
    );
  });

  it("does not serialize provider or optional service secrets into the shell env file", () => {
    const startScript = readAgentFile("start.sh");

    expect(startScript).toContain('chmod 400 "$tmp"');
    expect(startScript).not.toMatch(
      /write_export_if_set (?:NVIDIA_API_KEY|OPENAI_API_KEY|TAVILY_API_KEY|DEEPAGENTS_CODE_TAVILY_API_KEY|LANGSMITH_API_KEY)\b/,
    );
  });

  it("keeps all Deep Agents Code entry points behind the managed wrapper boundary", () => {
    const dockerfile = readAgentFile("Dockerfile");
    const wrapper = readAgentFile("dcode-wrapper.sh");
    const policy = readAgentFile("policy-additions.yaml");

    expect(dockerfile).toContain("rm -f /usr/local/bin/dcode /usr/local/bin/deepagents-code");
    expect(dockerfile).toContain(
      "install -m 0755 /usr/local/lib/nemoclaw/dcode-wrapper.sh /usr/local/bin/dcode.real",
    );
    expect(dockerfile).toContain(
      "install -m 0755 /usr/local/lib/nemoclaw/dcode-wrapper.sh /usr/local/bin/deepagents-code",
    );
    expect(dockerfile).not.toContain("dcode.upstream");
    expect(wrapper).toContain("exec python3 -m deepagents_code");
    expect(wrapper).toContain('reject_managed_override "sandbox isolation"');
    expect(wrapper).toContain('reject_managed_override "MCP posture"');
    expect(wrapper).toContain('reject_managed_override "shell allow-list posture"');
    expect(wrapper).toContain("extra_args=(--sandbox none --no-mcp)");
    expect(policy).not.toContain("/usr/local/bin/dcode.real");
    expect(policy).not.toContain("dcode.upstream");
  });
});
