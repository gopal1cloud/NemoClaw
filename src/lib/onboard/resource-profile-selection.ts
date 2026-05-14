// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  getHardwareResources,
  loadResourceProfiles,
  resolveResourceValue,
  type ResourceProfile,
} from "../resources-cmd";

export type ResourceProfileSelectionDeps = {
  isNonInteractive: () => boolean;
  note: (message: string) => void;
  prompt: (question: string) => Promise<string>;
  promptOrDefault: (
    question: string,
    envVar: string | null,
    defaultValue: string,
  ) => Promise<string>;
  env?: NodeJS.ProcessEnv;
};

function hasResourceEnvOverrides(env: NodeJS.ProcessEnv): boolean {
  return !!(
    env.NEMOCLAW_CPU_REQUEST ||
    env.NEMOCLAW_CPU_LIMIT ||
    env.NEMOCLAW_RAM_REQUEST ||
    env.NEMOCLAW_RAM_LIMIT
  );
}

function applyResourceEnvOverrides(
  selectedProfile: ResourceProfile | null,
  deps: ResourceProfileSelectionDeps,
): ResourceProfile | null {
  const env = deps.env ?? process.env;
  if (!hasResourceEnvOverrides(env)) return selectedProfile;
  const nextProfile = selectedProfile || {
    cpu_request: "",
    cpu_limit: "",
    memory_request: "",
    memory_limit: "",
  };
  if (env.NEMOCLAW_CPU_REQUEST) nextProfile.cpu_request = env.NEMOCLAW_CPU_REQUEST;
  if (env.NEMOCLAW_CPU_LIMIT) nextProfile.cpu_limit = env.NEMOCLAW_CPU_LIMIT;
  if (env.NEMOCLAW_RAM_REQUEST) nextProfile.memory_request = env.NEMOCLAW_RAM_REQUEST;
  if (env.NEMOCLAW_RAM_LIMIT) nextProfile.memory_limit = env.NEMOCLAW_RAM_LIMIT;
  deps.note(
    `  Resource overrides (env): cpu=${nextProfile.cpu_request}/${nextProfile.cpu_limit}, ram=${nextProfile.memory_request}/${nextProfile.memory_limit}`,
  );
  return nextProfile;
}

function exitWithResourceProfileError(message: string): never {
  console.error(`  ${message}`);
  process.exit(1);
}

function printResolvedResourceProfile(profile: ResourceProfile, cpuTotal: number, memTotal: number): void {
  const resolvedCpuRequest = resolveResourceValue(profile.cpu_request, cpuTotal, "cpu");
  const resolvedCpuLimit = resolveResourceValue(profile.cpu_limit, cpuTotal, "cpu");
  const resolvedMemoryRequest = resolveResourceValue(profile.memory_request, memTotal, "memory");
  const resolvedMemoryLimit = resolveResourceValue(profile.memory_limit, memTotal, "memory");
  console.log(
    `  Resolved: CPU request=${resolvedCpuRequest} cores, CPU limit=${resolvedCpuLimit} cores, RAM request=${resolvedMemoryRequest}, RAM limit=${resolvedMemoryLimit}`,
  );
}

export async function selectResourceProfileForSandbox(
  deps: ResourceProfileSelectionDeps,
): Promise<ResourceProfile | null> {
  const env = deps.env ?? process.env;
  const availableProfiles = loadResourceProfiles();
  const profileNames = Object.keys(availableProfiles);
  let selectedProfile: ResourceProfile | null = null;

  if (env.NEMOCLAW_RESOURCE_PROFILE) {
    const envProfile = env.NEMOCLAW_RESOURCE_PROFILE;
    if (Object.prototype.hasOwnProperty.call(availableProfiles, envProfile)) {
      selectedProfile = { ...availableProfiles[envProfile] };
      deps.note(`  Resource profile (env): ${envProfile}`);
    } else {
      console.error(`  Unknown resource profile: '${envProfile}'`);
      console.error(`  Valid profiles: ${profileNames.join(", ")}`);
      process.exit(1);
    }
  } else if (profileNames.length > 0 && !deps.isNonInteractive() && !hasResourceEnvOverrides(env)) {
    const hw = getHardwareResources();
    console.log("");
    console.log("  Resource profiles:");
    profileNames.forEach((name: string, i: number) => {
      const p = availableProfiles[name];
      console.log(
        `    ${i + 1}) ${name} (cpu=${p.cpu_request}/${p.cpu_limit}, ram=${p.memory_request}/${p.memory_limit})`,
      );
    });
    console.log(`    ${profileNames.length + 1}) custom (enter values manually)`);
    console.log(`    ${profileNames.length + 2}) No profile (default resources)`);
    const choice = await deps.promptOrDefault(
      `  Choose [${profileNames.length + 2}]: `,
      null,
      String(profileNames.length + 2),
    );
    const trimmedChoice = choice.trim();
    const idx = Number.parseInt(trimmedChoice, 10) - 1;
    if (!/^\d+$/.test(trimmedChoice) || idx < 0 || idx > profileNames.length + 1) {
      exitWithResourceProfileError(
        `Invalid resource profile selection '${choice}'. Choose a number from 1 to ${profileNames.length + 2}.`,
      );
    }
    if (idx >= 0 && idx < profileNames.length) {
      selectedProfile = availableProfiles[profileNames[idx]];
      console.log(`  Using profile: ${profileNames[idx]}`);
    } else if (idx === profileNames.length) {
      console.log("");
      console.log(`  Available: ${hw.cpu.cores} CPU cores, ${hw.memory.totalMB} MB RAM`);
      console.log("  Enter values as percentages (e.g. 25%) or absolutes (e.g. 4, 8Gi)");
      console.log("");
      const cpuReq = (await deps.prompt(`  CPU min (request) [25%]: `)).trim() || "25%";
      const cpuLim = (await deps.prompt(`  CPU max (limit) [50%]: `)).trim() || "50%";
      const ramReq = (await deps.prompt(`  RAM min (request) [25%]: `)).trim() || "25%";
      const ramLim = (await deps.prompt(`  RAM max (limit) [50%]: `)).trim() || "50%";
      selectedProfile = {
        cpu_request: cpuReq,
        cpu_limit: cpuLim,
        memory_request: ramReq,
        memory_limit: ramLim,
      };
      try {
        printResolvedResourceProfile(selectedProfile, hw.cpu.cores, hw.memory.totalMB);
      } catch (e: unknown) {
        exitWithResourceProfileError((e as Error).message);
      }
    }
  }

  return applyResourceEnvOverrides(selectedProfile, deps);
}
