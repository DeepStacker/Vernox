/**
 * Runs the batch's per-variant geometry checks (compose, manufacturability, billable size)
 * in the geometry worker, one job at a time so the caller controls priority. Without Worker
 * support (tests, very old browsers) the same work runs in-thread.
 */
import type { CustomPieceLimits } from '@/lib/pricing/customPiece';
import type { GeometryRequest, GeometryResponse } from '@/workers/geometryWorker';
import type { Bounds } from '../geometry/path';
import type { Analysis } from '../manufacturability';
import type { CutRules } from '../materials';
import type { StudioDocument } from '../schema';

export interface VariantGeometry {
  analysis: Analysis;
  size: { widthMm: number; heightMm: number };
  /** Final metal region (even-odd path, mm) for the thumbnail. */
  materialD: string;
  bounds: Bounds | null;
}

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
      if ('result' in e.data) job.resolve({ analysis: e.data.result.analysis, size: e.data.result.size, materialD: e.data.result.materialD, bounds: e.data.result.bounds });
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
      const [{ analyzeDocument, billableSize }, { ringsToPathData }] = await Promise.all([
        import('../manufacturability'),
        import('../geometry/path'),
      ]);
      const { composition, analysis } = analyzeDocument(doc, rules, limits);
      return { analysis, size: billableSize(composition), materialD: ringsToPathData(composition.material), bounds: composition.bounds };
    }
    const id = this.nextId++;
    return new Promise<VariantGeometry>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, doc, rules, limits } satisfies GeometryRequest);
    });
  }

  dispose() {
    this.failAll(new Error('Batch evaluation cancelled'));
    this.worker?.terminate();
    this.worker = null;
  }
}
