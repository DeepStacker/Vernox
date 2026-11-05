/// <reference lib="webworker" />
/**
 * Geometry worker: composes the part and runs the manufacturability checks off the main
 * thread. Returns only what the UI draws or shows (issues, stats, bridges, mounting holes).
 */
import type { CustomPieceLimits } from '@/lib/pricing/customPiece';
import { ringsToPathData, type Bounds } from '@/lib/studio/geometry/path';
import { analyzeDocument, billableSize, type Analysis } from '@/lib/studio/manufacturability';
import type { CutRules } from '@/lib/studio/materials';
import type { StudioDocument } from '@/lib/studio/schema';

export interface GeometryRequest { id: number; doc: StudioDocument; rules: CutRules; limits?: CustomPieceLimits }
export interface GeometryResult {
  analysis: Analysis;
  bridgesD: string;
  /** Final metal region (even-odd path, plate mm) for previews. */
  materialD: string;
  bounds: Bounds | null;
  mountingHoles: { x: number; y: number; r: number }[];
  size: { widthMm: number; heightMm: number };
  ms: number;
}
export type GeometryResponse = { id: number; ok: true; result: GeometryResult } | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<GeometryRequest>) => {
  const { id, doc, rules, limits } = event.data;
  const t0 = performance.now();
  try {
    const { composition, analysis } = analyzeDocument(doc, rules, limits);
    const result: GeometryResult = {
      analysis,
      bridgesD: ringsToPathData(composition.bridges),
      materialD: ringsToPathData(composition.material),
      bounds: composition.bounds,
      mountingHoles: composition.mountingHoles,
      size: billableSize(composition),
      ms: Math.round(performance.now() - t0),
    };
    ctx.postMessage({ id, ok: true, result } satisfies GeometryResponse);
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies GeometryResponse);
  }
};
