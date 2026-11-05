/**
 * Main-thread side of tracing: decodes and downscales the upload off the main thread
 * (createImageBitmap with resize), runs each job in the trace worker, and cancels a stale
 * job by terminating its worker when a newer request arrives.
 */
import type { TraceRequest, TraceResponse } from '@/workers/traceWorker';
import type { TraceOptions, TraceResult } from './options';

/** Longest side sent to the tracer; keeps a 4000 × 4000 photo to ~1 MP of work. */
export const TRACE_MAX_SIDE = 1000;

export class TraceCancelled extends Error {
  constructor() {
    super('Trace cancelled');
    this.name = 'TraceCancelled';
  }
}

export async function decodeForTrace(file: Blob): Promise<ImageBitmap> {
  const probe = await createImageBitmap(file);
  const scale = Math.min(1, TRACE_MAX_SIDE / Math.max(probe.width, probe.height));
  if (scale === 1) return probe;
  const { width, height } = probe;
  probe.close();
  return createImageBitmap(file, { resizeWidth: Math.round(width * scale), resizeHeight: Math.round(height * scale), resizeQuality: 'high' });
}

export class Tracer {
  private worker: Worker | null = null;
  private pending: { id: number; reject: (e: Error) => void } | null = null;
  private nextId = 1;

  private spawn(): Worker {
    return new Worker(new URL('../../../workers/traceWorker.ts', import.meta.url), { type: 'module' });
  }

  /** Traces `source`; any job still running is cancelled first. `source` is not consumed. */
  async trace(source: ImageBitmap, options: TraceOptions): Promise<TraceResult> {
    this.cancel();
    const bitmap = await createImageBitmap(source);
    const worker = (this.worker ??= this.spawn());
    const id = this.nextId++;
    return new Promise<TraceResult>((resolve, reject) => {
      this.pending = { id, reject };
      worker.onmessage = (e: MessageEvent<TraceResponse>) => {
        if (e.data.id !== id) return;
        this.pending = null;
        const res = e.data;
        if ('error' in res) reject(new Error(res.error));
        else resolve({ d: res.d, width: res.width, height: res.height, bounds: res.bounds, threshold: res.threshold });
      };
      worker.onerror = e => {
        this.pending = null;
        reject(new Error(e.message || 'Trace worker failed'));
      };
      worker.postMessage({ id, bitmap, options } satisfies TraceRequest, [bitmap]);
    });
  }

  cancel() {
    if (!this.pending) return;
    this.pending.reject(new TraceCancelled());
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
  }

  dispose() {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }
}
