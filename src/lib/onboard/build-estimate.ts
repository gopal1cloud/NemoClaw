// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

export type SandboxBuildEstimateHost = {
  isContainerRuntimeUnderProvisioned?: boolean;
  dockerCpus?: number | null;
  dockerMemTotalBytes?: number | null;
};

export function formatSandboxBuildEstimateNote(
  host: SandboxBuildEstimateHost,
): string | null {
  if (host.isContainerRuntimeUnderProvisioned) {
    return (
      "Container runtime is under-provisioned; the sandbox build may take 30+ minutes " +
      "or stall. See preflight warning above."
    );
  }
  const cpus = host.dockerCpus;
  const memBytes = host.dockerMemTotalBytes;
  if (typeof cpus === "number" && typeof memBytes === "number") {
    const memGiB = memBytes / 1024 ** 3;
    if (cpus >= 8 && memGiB >= 16) {
      return "Sandbox build typically takes 3–8 minutes on this host.";
    }
    return "Sandbox build typically takes 5–15 minutes on this host.";
  }
  return null;
}
