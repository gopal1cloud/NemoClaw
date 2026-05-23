// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Memory-aware Ollama bootstrap-model registry.
 *
 * Bootstrap model selection cannot rely on `totalMemoryMB` alone — on
 * unified-memory devices (DGX Spark, Apple Silicon) total VRAM equals total
 * system memory and another GPU workload can eat most of it before
 * onboarding starts. Issue #4113: a Spark host with 128 GiB total reported
 * only 12 GiB free, but the bootstrap path picked the 23 GiB
 * `qwen3.6:35b` model and the runner crashed during load.
 *
 * Each entry names a model and the GPU memory footprint we expect it to
 * need at load time (set slightly above the raw on-disk size so we account
 * for KV cache + context overhead — Ollama itself adds about 10–20 % at
 * default context length). New models go here, in descending size order;
 * the selector keeps every entry whose `requiredMemoryMB` fits the host's
 * currently available memory and falls back to the smallest model when
 * nothing else fits.
 */

import type { GpuInfo } from "./local";

export interface OllamaModelEntry {
  tag: string;
  requiredMemoryMB: number;
}

// Largest first. The selector walks this list, filters by available memory,
// and reverses the result so menus render smallest-first (matching the
// pre-registry ordering callers and existing tests expect).
export const OLLAMA_MODEL_REGISTRY: readonly OllamaModelEntry[] = [
  { tag: "qwen3.6:35b", requiredMemoryMB: 26_000 },
  { tag: "nemotron-3-nano:30b", requiredMemoryMB: 22_000 },
  { tag: "qwen2.5:7b", requiredMemoryMB: 6_500 },
];

export const SMALLEST_OLLAMA_MODEL_TAG =
  OLLAMA_MODEL_REGISTRY[OLLAMA_MODEL_REGISTRY.length - 1].tag;

export function findOllamaModelEntry(tag: string): OllamaModelEntry | null {
  return OLLAMA_MODEL_REGISTRY.find((entry) => entry.tag === tag) ?? null;
}

/**
 * Effective GPU memory for capacity decisions: prefer the currently
 * available figure (from `nvidia-smi memory.free` or `MemAvailable`) and
 * fall back to total when the host could not produce a usable free-memory
 * reading. Total is a worse signal — it ignores the concurrent workload
 * footprint that motivated #4113 — but it preserves the pre-registry
 * behaviour on hosts where `availableMemoryMB` is missing.
 */
export function effectiveGpuMemoryMB(gpu: GpuInfo | null): number | null {
  if (!gpu) return null;
  if (typeof gpu.availableMemoryMB === "number" && gpu.availableMemoryMB > 0) {
    return gpu.availableMemoryMB;
  }
  if (typeof gpu.totalMemoryMB === "number" && gpu.totalMemoryMB > 0) {
    return gpu.totalMemoryMB;
  }
  return null;
}

/**
 * Bootstrap model tags the host can plausibly load right now. Always
 * includes `SMALLEST_OLLAMA_MODEL_TAG` so the menu has at least one fallback
 * even when capacity probing returns nothing useful.
 *
 * Output is smallest-first so menu indices stay stable as registry entries
 * are added.
 */
export function fittableOllamaModelTags(gpu: GpuInfo | null): string[] {
  const fallback = [SMALLEST_OLLAMA_MODEL_TAG];
  if (!gpu || (gpu.type !== "nvidia" && gpu.type !== "apple")) {
    return fallback;
  }
  const memory = effectiveGpuMemoryMB(gpu);
  if (memory == null) return fallback;
  const fitting = OLLAMA_MODEL_REGISTRY.filter(
    (entry) => entry.requiredMemoryMB <= memory && entry.tag !== SMALLEST_OLLAMA_MODEL_TAG,
  );
  if (fitting.length === 0) return fallback;
  return [SMALLEST_OLLAMA_MODEL_TAG, ...fitting.map((entry) => entry.tag).reverse()];
}
