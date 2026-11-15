/**
 * Latest-wins client for the pattern worker (same idea as geometryClient.ts): while a job
 * runs, newer requests replace each other, so dragging a slider never queues work. Where
 * Workers are unavailable (tests, old browsers) the fill runs in-thread.
 */
import type { PatternWorkerRequest, PatternWorkerResponse } from '@/workers/patternWorker';
import type { PatternRequest, PatternResult } from './generate';

interface Job { request: PatternRequest; resolve: (r: PatternResult | null) => void; reject: (e: Error) => void }

export class PatternClient {
  private worker: Worker | null = null;
  private running: { id: number; job: Job } | null = null;
  private queued: Job | null = null;
  private nextId = 1;

  private ensureWorker(): Worker | null {
    if (this.worker || typeof Worker === 'undefined') return this.worker;
    this.worker = new Worker(new URL('../../../workers/patternWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<PatternWorkerResponse>) => {
      const run = this.running;
      if (!run || run.id !== e.data.id) return;
      this.running = null;
      if ('result' in e.data) run.job.resolve(e.data.result);
      else run.job.reject(new Error(e.data.error));
      this.flush();
    };
    this.worker.onerror = e => {
      this.running?.job.reject(new Error(e.message || 'Pattern worker failed'));
      this.running = null;
      this.flush();
    };
    return this.worker;
  }

  /** Resolves with the result, or null when a newer request replaced this one before it started. */
  generate(request: PatternRequest): Promise<PatternResult | null> {
    return new Promise((resolve, reject) => {
      this.queued?.resolve(null);
      this.queued = { request, resolve, reject };
      this.flush();
    });
  }

  private flush() {
    if (this.running || !this.queued) return;
    const job = this.queued;
    this.queued = null;
    const id = this.nextId++;
    const worker = this.ensureWorker();
    this.running = { id, job };
    if (worker) {
      worker.postMessage({ id, request: job.request } satisfies PatternWorkerRequest);
      return;
    }
    void import('./generate').then(({ generatePattern }) => {
      try { job.resolve(generatePattern(job.request)); } catch (err) { job.reject(err instanceof Error ? err : new Error(String(err))); }
      this.running = null;
      this.flush();
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.queued?.resolve(null);
    this.queued = null;
  }
}
