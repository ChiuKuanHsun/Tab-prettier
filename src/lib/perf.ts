/**
 * How much work making a scene may take, so an office laptop isn't swamped. It only changes the
 * background processing (the new tab's effects follow the power-saving setting).
 */
import { kvGet, kvSet } from './db';
import type { Settings } from './types';

export type PerfTier = 'low' | 'medium' | 'high';

export interface PerfBudget {
  /** Usable characters gathered per scene before the best colour match is picked. */
  candidates: number;
  /** Depth map for the new tab's 2.5D motion (a second model run per scene). */
  depth: boolean;
  /** Largest stored background and character sizes. */
  bgMax: [number, number];
  charMax: [number, number];
  /** Make scenes only while the computer is idle. */
  idleOnly: boolean;
}

export const PERF: Record<PerfTier, PerfBudget> = {
  low: { candidates: 1, depth: false, bgMax: [1920, 1200], charMax: [1000, 1400], idleOnly: true },
  medium: { candidates: 2, depth: true, bgMax: [2560, 1600], charMax: [1400, 2000], idleOnly: false },
  high: { candidates: 3, depth: true, bgMax: [2560, 1600], charMax: [1400, 2000], idleOnly: false },
};

/**
 * The tier for this computer, from what the page can see: without WebGPU both models run on the
 * CPU (many times slower), and little memory or few cores make that worse.
 */
export function tierFor(hw: { webgpu: boolean; memoryGB?: number; cores?: number }): PerfTier {
  const mem = hw.memoryGB ?? 8, cores = hw.cores ?? 4;
  if (!hw.webgpu) return mem >= 8 && cores >= 8 ? 'medium' : 'low';
  return mem < 4 ? 'medium' : 'high';
}

const DETECTED_KEY = 'perf:detected';

/**
 * Checks this computer (in a page, where WebGPU can be probed) and remembers the answer for the
 * service worker, which decides whether to wait for idle.
 */
export async function detectTier(): Promise<PerfTier> {
  const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> }; deviceMemory?: number };
  const adapter = await nav.gpu?.requestAdapter().catch(() => null);
  const tier = tierFor({ webgpu: !!adapter, memoryGB: nav.deviceMemory, cores: navigator.hardwareConcurrency });
  await kvSet(DETECTED_KEY, tier);
  return tier;
}

/** The tier to use: the user's choice, else the last detection (or a fresh one where possible). */
export async function resolveTier(setting: Settings['perfTier'], canDetect: boolean): Promise<PerfTier> {
  if (setting !== 'auto') return setting;
  return canDetect ? detectTier() : ((await kvGet<PerfTier>(DETECTED_KEY)) ?? 'high');
}
