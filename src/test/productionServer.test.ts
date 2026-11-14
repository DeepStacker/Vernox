// @vitest-environment node
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allowedOrigins } from '../../server/apiRouter';
import { startInternalCron, type CronHandler } from '../../server/internalCron';
import { createProductionListener, rewriteUrl } from '../../server/productionApp';
import { cacheControlFor, createStaticSite, resolveInside, SITE_URL_PLACEHOLDER } from '../../server/staticSite';

describe('production server', () => {
  let dir: string;
  let server: http.Server;
  let base: string;
  let ready = true;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vernox-static-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), `<html>${SITE_URL_PLACEHOLDER}/img.jpg</html>`);
    fs.writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    fs.writeFileSync(path.join(dir, 'favicon.png'), 'png');
    server = http.createServer(createProductionListener({
      site: createStaticSite(dir, 'https://shop.example.in'),
      checkReady: async () => { if (!ready) throw new Error('db down'); },
    }));
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('serves index.html with the site URL filled in, uncached, with security headers', async () => {
    const res = await fetch(`${base}/`);
    expect(await res.text()).toBe('<html>https://shop.example.in/img.jpg</html>');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
  });

  it('serves hashed assets as immutable for a year and other files for an hour', async () => {
    const asset = await fetch(`${base}/assets/app-abc123.js`);
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(asset.headers.get('content-type')).toContain('text/javascript');
    expect((await fetch(`${base}/favicon.png`)).headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('falls back to index.html for client routes, 404s missing files, keeps paths inside the root', async () => {
    expect(await (await fetch(`${base}/cart/checkout`)).text()).toContain('shop.example.in');
    expect((await fetch(`${base}/assets/gone.js`)).status).toBe(404);
    expect((await fetch(`${base}/missing.png`)).status).toBe(404);
    expect(resolveInside('/srv/dist', '/../../etc/passwd')).toBe('/srv/dist/etc/passwd');
    expect(resolveInside('/srv/dist', '/%00')).toBeNull();
  });

  it('answers /healthz always and /readyz only while the database answers', async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/readyz`)).status).toBe(200);
    ready = false;
    expect((await fetch(`${base}/readyz`)).status).toBe(503);
    ready = true;
  });

  it('applies the vercel.json rewrites', () => {
    expect(rewriteUrl('/product/brass-lotus')).toBe('/api/seo?kind=product&slug=brass-lotus');
    expect(rewriteUrl('/product/brass-lotus/')).toBe('/api/seo?kind=product&slug=brass-lotus');
    expect(rewriteUrl('/sitemap.xml')).toBe('/api/seo?kind=sitemap');
    expect(rewriteUrl('/product/a/b')).toBe('/product/a/b');
    expect(cacheControlFor('/index.html')).toBe('no-cache');
  });
});

describe('internal cron', () => {
  const quiet = { info: () => {}, error: () => {} };

  it('calls the handler with the cron bearer secret', async () => {
    let auth: unknown;
    const handler: CronHandler = (req, res) => { auth = req.headers.authorization; return res.status(200).json({ success: true }); };
    const cron = startInternalCron([{ name: 'j', intervalMs: 60_000, handler }], 'sekret', quiet);
    await cron.runNow('j');
    await cron.stop();
    expect(auth).toBe('Bearer sekret');
  });

  it('skips a run while the previous one is still going', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const handler: CronHandler = async (_req, res) => { calls += 1; await gate; return res.status(200).json({}); };
    const cron = startInternalCron([{ name: 'j', intervalMs: 60_000, handler }], 's', quiet);
    const first = cron.runNow('j');
    const second = cron.runNow('j');
    release();
    await Promise.all([first, second, cron.stop()]);
    expect(calls).toBe(1);
  });

  it('logs a failing handler and keeps running', async () => {
    const errors: string[] = [];
    const cron = startInternalCron([{ name: 'j', intervalMs: 60_000, handler: () => { throw new Error('boom'); } }], 's', { info: () => {}, error: m => errors.push(m) });
    await cron.runNow('j');
    await cron.runNow('j');
    await cron.stop();
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('boom');
  });
});

describe('CORS allow-list', () => {
  it('derives the allowed origins from the configured site URL, with the www or apex twin', () => {
    expect(allowedOrigins({ VITE_SITE_URL: 'https://shop.example.in/' } as NodeJS.ProcessEnv)).toEqual(['https://shop.example.in', 'https://www.shop.example.in']);
    expect(allowedOrigins({ VITE_SITE_URL: 'https://www.shop.example.in' } as NodeJS.ProcessEnv)).toEqual(['https://www.shop.example.in', 'https://shop.example.in']);
    expect(allowedOrigins({} as NodeJS.ProcessEnv)).toEqual([]);
    expect(allowedOrigins({ VITE_SITE_URL: 'not a url' } as NodeJS.ProcessEnv)).toEqual([]);
  });
});
