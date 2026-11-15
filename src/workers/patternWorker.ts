/// <reference lib="webworker" />
/**
 * Pattern worker: generates a jali fill off the main thread (see lib/studio/patterns/generate.ts).
 */
import { generatePattern, type PatternRequest, type PatternResult } from '@/lib/studio/patterns/generate';

export interface PatternWorkerRequest { id: number; request: PatternRequest }
export type PatternWorkerResponse = { id: number; ok: true; result: PatternResult } | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<PatternWorkerRequest>) => {
  const { id, request } = event.data;
  try {
    ctx.postMessage({ id, ok: true, result: generatePattern(request) } satisfies PatternWorkerResponse);
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies PatternWorkerResponse);
  }
};
