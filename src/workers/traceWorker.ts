/// <reference lib="webworker" />
/**
 * Image tracing worker. Receives a (downscaled) ImageBitmap, rasterises it on an
 * OffscreenCanvas and traces it (src/lib/studio/trace/traceCore.ts). One job at a time:
 * the client terminates the worker to cancel a stale job, since tracing is synchronous.
 */
import type { TraceOptions } from '@/lib/studio/trace/options';
import { traceImage } from '@/lib/studio/trace/traceCore';

export interface TraceRequest { id: number; bitmap: ImageBitmap; options: TraceOptions }
export type TraceResponse =
  | { id: number; ok: true; d: string; width: number; height: number; bounds: { minX: number; minY: number; maxX: number; maxY: number } | null; threshold: number }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<TraceRequest>) => {
  const { id, bitmap, options } = event.data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g2d = canvas.getContext('2d');
    if (!g2d) throw new Error('2D canvas unavailable in worker');
    g2d.drawImage(bitmap, 0, 0);
    bitmap.close();
    const image = g2d.getImageData(0, 0, canvas.width, canvas.height);
    const result = traceImage(image, options);
    ctx.postMessage({ id, ok: true, ...result } satisfies TraceResponse);
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies TraceResponse);
  }
};
