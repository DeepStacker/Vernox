/**
 * What one geometry job returns to the UI: compose the part, run the manufacturability checks
 * and measure the cutting work of the production snapshot it would freeze (for the live price).
 * Runs in the geometry worker (src/workers/geometryWorker.ts) and, where Workers are missing,
 * in-thread (geometryClient.ts, batch/geometryRunner.ts) — one implementation for all three.
 */
import type { CustomPieceLimits } from '@/lib/pricing/customPiece';
import { pricingDesignRef, type CutWork } from '@/lib/pricing/cutWork';
import { ringsToPathData, type Bounds } from './geometry/path';
import { analyzeDocument, billableSize, type Analysis } from './manufacturability';
import type { CutRules } from './materials';
import { buildProduction, productionCutWork } from './production';
import type { StudioDocument } from './schema';

export interface GeometryResult {
  analysis: Analysis;
  bridgesD: string;
  /** Final metal region (even-odd path, plate mm) for previews. */
  materialD: string;
  bounds: Bounds | null;
  mountingHoles: { x: number; y: number; r: number }[];
  size: { widthMm: number; heightMm: number };
  /** Cutting work of the production snapshot (cutLength, pierces, engraving); null for an empty or unmeasurable part. */
  cutWork: CutWork | null;
  /** The snapshot as a pricing-only design reference (pricingDesignRef), when the request asked for it (batch quotes). */
  pricingRef?: string;
  ms: number;
}

export interface GeometryJobOptions {
  /** Also return `pricingRef` (the batch sends it to the server quote). */
  withPricingRef?: boolean;
}

export function computeGeometryResult(doc: StudioDocument, rules: CutRules, limits?: CustomPieceLimits, opts: GeometryJobOptions = {}): GeometryResult {
  const t0 = performance.now();
  const { composition, analysis } = analyzeDocument(doc, rules, limits);
  const production = composition.pieces.length > 0 ? buildProduction(composition, rules, doc.material.finish) : null;
  return {
    analysis,
    bridgesD: ringsToPathData(composition.bridges),
    materialD: ringsToPathData(composition.material),
    bounds: composition.bounds,
    mountingHoles: composition.mountingHoles,
    size: billableSize(composition),
    cutWork: production ? productionCutWork(production) : null,
    ...(production && opts.withPricingRef ? { pricingRef: pricingDesignRef(production) } : {}),
    ms: Math.round(performance.now() - t0),
  };
}
