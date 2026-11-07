/**
 * In-process scheduler for the two jobs Vercel Cron runs from vercel.json, for hosts without a cron service (the
 * single-VM Docker deployment). Jobs invoke the same handlers as /api/cron/*, authenticated with CRON_SECRET exactly
 * as Vercel does. A job whose previous run is still going is skipped (no overlap). Set DISABLE_INTERNAL_CRON=true
 * when something else (Vercel Cron, an external scheduler) calls the endpoints.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export type CronHandler = (req: VercelRequest, res: VercelResponse) => unknown;

export interface CronJob {
  name: string;
  intervalMs: number;
  handler: CronHandler;
}

export interface CronLogger {
  info(message: string): void;
  error(message: string): void;
}

export interface InternalCron {
  stop(): Promise<void>;
  /** Runs one job now (used by the timers and by tests); resolves when it finishes. */
  runNow(name: string): Promise<void>;
}

interface Captured { status: number; body: string }

/** Calls a Vercel-style handler without a socket and captures its response. */
async function invoke(handler: CronHandler, path: string, secret: string): Promise<Captured> {
  const captured: Captured = { status: 200, body: '' };
  const res = {
    setHeader() { return res; },
    status(code: number) { captured.status = code; return res; },
    json(data: unknown) { captured.body = JSON.stringify(data); return res; },
    end(data?: string) { if (data) captured.body = data; return res; },
  };
  const req = { method: 'GET', url: path, headers: { authorization: `Bearer ${secret}` }, query: {}, body: {} };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  return captured;
}

export function startInternalCron(jobs: CronJob[], secret: string, log: CronLogger = console): InternalCron {
  const running = new Map<string, Promise<void>>();

  const runNow = (name: string): Promise<void> => {
    const job = jobs.find(j => j.name === name);
    if (!job) return Promise.reject(new Error(`unknown cron job ${name}`));
    const inFlight = running.get(name);
    if (inFlight) {
      log.info(`[cron] ${name} skipped: previous run still going`);
      return inFlight;
    }
    const run = (async () => {
      const started = Date.now();
      try {
        const { status, body } = await invoke(job.handler, `/api/cron/${name}`, secret);
        const line = `[cron] ${name} ${status} in ${Date.now() - started}ms ${body}`;
        if (status >= 400) log.error(line);
        else log.info(line);
      } catch (err) {
        log.error(`[cron] ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        running.delete(name);
      }
    })();
    running.set(name, run);
    return run;
  };

  const timers = jobs.map(job => {
    const timer = setInterval(() => void runNow(job.name), job.intervalMs);
    timer.unref();
    return timer;
  });

  return {
    runNow,
    async stop() {
      timers.forEach(clearInterval);
      await Promise.allSettled([...running.values()]);
    },
  };
}
