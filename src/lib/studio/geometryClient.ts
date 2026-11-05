/**
 * Latest-wins client for the geometry worker: while a job runs, newer requests replace
 * each other and only the newest is sent next, so typing or dragging never queues work.
 * Falls back to running in-thread where Workers are unavailable (tests, old browsers).
 */
import type { CustomPieceLimits } from '@/lib/pricing/customPiece';
import type { GeometryRequest, GeometryResponse, GeometryResult } from '@/workers/geometryWorker';
import type { CutRules } from './materials';
import type { StudioDocument } from './schema';

type Listener = (result: GeometryResult) => void;

export class GeometryClient {
  private worker: Worker | null = null;
  private busy = false;
  private queued: Omit<GeometryRequest, 'id'> | null = null;
  private nextId = 1;
  private latestId = 0;

  constructor(private readonly onResult: Listener, private readonly onError: (message: string) => void = () => {}) {}

  private ensureWorker(): Worker | null {
    if (this.worker || typeof Worker === 'undefined') return this.worker;
    this.worker = new Worker(new URL('../../workers/geometryWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<GeometryResponse>) => {
      this.busy = false;
      if (e.data.id === this.latestId) {
        const res = e.data;
        if ('result' in res) this.onResult(res.result);
        else this.onError(res.error);
      }
      this.flush();
    };
    this.worker.onerror = e => {
      this.busy = false;
      this.onError(e.message || 'Geometry worker failed');
      this.flush();
    };
    return this.worker;
  }

  request(doc: StudioDocument, rules: CutRules, limits?: CustomPieceLimits) {
    this.queued = { doc, rules, limits };
    this.flush();
  }

  private flush() {
    if (this.busy || !this.queued) return;
    const job = this.queued;
    this.queued = null;
    const id = this.nextId++;
    this.latestId = id;
    const worker = this.ensureWorker();
    if (worker) {
      this.busy = true;
      worker.postMessage({ id, ...job } satisfies GeometryRequest);
      return;
    }
    // No Worker support: compute in-thread, deferred so the caller's frame finishes first.
    this.busy = true;
    void import('./manufacturability').then(({ analyzeDocument, billableSize }) => {
      try {
        const t0 = performance.now();
        const { composition, analysis } = analyzeDocument(job.doc, job.rules, job.limits);
        if (id === this.latestId) {
          void import('./geometry/path').then(({ ringsToPathData }) =>
            this.onResult({ analysis, bridgesD: ringsToPathData(composition.bridges), materialD: ringsToPathData(composition.material), bounds: composition.bounds, mountingHoles: composition.mountingHoles, size: billableSize(composition), ms: Math.round(performance.now() - t0) }),
          );
        }
      } catch (err) {
        this.onError(err instanceof Error ? err.message : String(err));
      } finally {
        this.busy = false;
        this.flush();
      }
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.queued = null;
  }
}
