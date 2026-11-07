/**
 * Request listener of the single production process: probes, the Vercel-equivalent rewrites, the API
 * (server/apiRouter.ts) and the built SPA. Kept separate from the entry point (production.ts) so it can be tested.
 */
import http from 'http';
import { handleApiRequest, setSecurityHeaders } from './apiRouter';
import type { StaticSite } from './staticSite';

export interface ProductionAppOptions {
  site: StaticSite;
  /** Resolves when the database answers; rejects otherwise (GET /readyz). */
  checkReady: () => Promise<void>;
  /** Longest a readiness probe may take before it counts as failed. */
  readyTimeoutMs?: number;
}

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

/** The vercel.json rewrites that the SPA needs server-side: link-preview pages and the sitemap. */
export function rewriteUrl(url: string): string {
  const [pathname] = url.split('?');
  if (pathname === '/sitemap.xml') return '/api/seo?kind=sitemap';
  const product = /^\/product\/([^/]+)\/?$/.exec(pathname);
  if (product) return `/api/seo?kind=product&slug=${product[1]}`;
  return url;
}

export function createProductionListener(options: ProductionAppOptions): http.RequestListener {
  const { site, checkReady, readyTimeoutMs = 3000 } = options;

  const ready = async (res: http.ServerResponse) => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        checkReady(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), readyTimeoutMs); }),
      ]);
      json(res, 200, { status: 'ready' });
    } catch (err) {
      console.error('[readyz] database not reachable:', err instanceof Error ? err.message : err);
      json(res, 503, { status: 'unavailable' });
    } finally {
      clearTimeout(timer);
    }
  };

  return (req, res) => {
    const url = req.url ?? '/';
    const pathname = url.split('?')[0];

    if (pathname === '/healthz') return json(res, 200, { status: 'ok', uptime: Math.round(process.uptime()) });
    if (pathname === '/readyz') return void ready(res);

    setSecurityHeaders(res);

    const isApi = pathname.startsWith('/api/') || pathname === '/health' || pathname === '/runtime-config.js';
    const rewritten = rewriteUrl(url);
    if (isApi || rewritten !== url) {
      req.url = rewritten;
      // Handlers that set their own Cache-Control (catalog, runtime-config, seo) override this default.
      res.setHeader('Cache-Control', 'no-store');
      return void handleApiRequest(req, res);
    }

    if (site.serve(req, res)) return;
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end('Method Not Allowed');
  };
}
