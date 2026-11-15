/// <reference lib="webworker" />
/**
 * Geometry worker: composes the part, runs the manufacturability checks and measures the
 * cutting work off the main thread (src/lib/studio/geometryResult.ts). Returns only what the
 * UI draws or shows (issues, stats, bridges, mounting holes, the work behind the price).
 */
import type { CustomPieceLimits } from '@/lib/pricing/customPiece';
import { computeGeometryResult, type GeometryJobOptions, type GeometryResult } from '@/lib/studio/geometryResult';
import type { CutRules } from '@/lib/studio/materials';
import type { StudioDocument } from '@/lib/studio/schema';

export type { GeometryResult };
export interface GeometryRequest extends GeometryJobOptions { id: number; doc: StudioDocument; rules: CutRules; limits?: CustomPieceLimits }
export type GeometryResponse = { id: number; ok: true; result: GeometryResult } | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<GeometryRequest>) => {
  const { id, doc, rules, limits, withPricingRef } = event.data;
  try {
    const result = computeGeometryResult(doc, rules, limits, { withPricingRef });
    ctx.postMessage({ id, ok: true, result } satisfies GeometryResponse);
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies GeometryResponse);
  }
};
