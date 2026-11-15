/**
 * Runs the batch's per-variant geometry checks (compose, manufacturability, billable size,
 * cutting work) in the geometry worker, one job at a time so the caller controls priority.
 * Without Worker support (tests, very old browsers) the same work runs in-thread.
 */
import type { CustomPieceLimits } from '@/lib/pricing/customPiece';
import type { CutWork } from '@/lib/pricing/cutWork';
import type { GeometryRequest, GeometryResponse } from '@/workers/geometryWorker';
import type { Bounds } from '../geometry/path';
import type { GeometryResult } from '../geometryResult';
import type { Analysis } from '../manufacturability';
import type { CutRules } from '../materials';
import type { StudioDocument } from '../schema';

export interface VariantGeometry {
  analysis: Analysis;
  size: { widthMm: number; heightMm: number };
  /** Final metal region (even-odd path, mm) for the thumbnail. */
  materialD: string;
  bounds: Bounds | null;
  /** Cutting work of the variant's production snapshot (null: empty or unmeasurable). */
  cutWork: CutWork | null;
  /** The snapshot as a pricing-only design reference, for the server's batch quote. */
  pricingRef?: string;
}

const toVariant = (r: GeometryResult): VariantGeometry => ({
  analysis: r.analysis, size: r.size, materialD: r.materialD, bounds: r.bounds, cutWork: r.cutWork, pricingRef: r.pricingRef,
});

export class GeometryRunner {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (g: VariantGeometry) => void; reject: (e: Error) => void }>();

  private ensureWorker(): Worker | null {
    if (this.worker || typeof Worker === 'undefined') return this.worker;
    const worker = new Worker(new URL('../../../workers/geometryWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<GeometryResponse>) => {
      const job = this.pending.get(e.data.id);
      if (!job) return;
      this.pending.delete(e.data.id);
      if ('result' in e.data) job.resolve(toVariant(e.data.result));
      else job.reject(new Error(e.data.error));
    };
    worker.onerror = e => this.failAll(new Error(e.message || 'Geometry worker failed'));
    this.worker = worker;
    return worker;
  }

  private failAll(error: Error) {
    for (const job of this.pending.values()) job.reject(error);
    this.pending.clear();
  }

  async run(doc: StudioDocument, rules: CutRules, limits?: CustomPieceLimits): Promise<VariantGeometry> {
    const worker = this.ensureWorker();
    if (!worker) {
      const { computeGeometryResult } = await import('../geometryResult');
      return toVariant(computeGeometryResult(doc, rules, limits, { withPricingRef: true }));
    }
    const id = this.nextId++;
    return new Promise<VariantGeometry>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, doc, rules, limits, withPricingRef: true } satisfies GeometryRequest);
    });
  }

  dispose() {
    this.failAll(new Error('Batch evaluation cancelled'));
    this.worker?.terminate();
    this.worker = null;
  }
}
