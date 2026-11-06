// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from './support/memoryStore';
import { injectProductMeta } from '../../api/_lib/seo';
import { buildSitemapXml, STATIC_ROUTES } from '../lib/seo/sitemap';

const store = new MemoryStore();
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getStore: () => store }));

const TEMPLATE = `<html><head>
    <title>Vernox — default</title>
    <meta name="description" content="Default description" />
    <meta property="og:title" content="Default" />
    <meta property="og:description" content="Default" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://vernox.in/images/hero.jpg" />
    <meta name="twitter:image" content="https://vernox.in/images/hero.jpg" />
  </head><body><div id="root"></div></body></html>`;

describe('product link previews', () => {
  it('puts the product title, description, image and URL in the head, escaped', () => {
    const html = injectProductMeta(TEMPLATE, { slug: 'om-mandala', name: 'Om "Mandala" <Brass>', description: 'Hand-finished brass & steel.', imageUrl: '/images/om.webp' }, 'https://vernox.in');
    expect(html).toContain('<title>Om &quot;Mandala&quot; &lt;Brass&gt; | Vernox</title>');
    expect(html).toContain('<meta property="og:description" content="Hand-finished brass &amp; steel." />');
    expect(html).toContain('<meta property="og:image" content="https://vernox.in/images/om.webp" />');
    expect(html).toContain('<meta property="og:type" content="product" />');
    expect(html).toContain('<meta property="og:url" content="https://vernox.in/product/om-mandala" />');
    expect(html).toContain('<link rel="canonical" href="https://vernox.in/product/om-mandala" />');
    expect(html).not.toContain('Default description');
    expect(html).toContain('<div id="root"></div>');
  });

  it('keeps the default image when the product has none', () => {
    const html = injectProductMeta(TEMPLATE, { slug: 'x', name: 'X', description: '', imageUrl: null }, 'https://vernox.in');
    expect(html).toContain('content="https://vernox.in/images/hero.jpg"');
    expect(html).toContain('laser-cut metal wall art made to order in India');
  });
});

describe('live sitemap', () => {
  it('lists the static routes and every product slug', () => {
    const xml = buildSitemapXml('https://vernox.in/', ['om-mandala', 'tree & birds']);
    expect(xml.match(/<url>/g)).toHaveLength(STATIC_ROUTES.length + 2);
    expect(xml).toContain('<loc>https://vernox.in/product/om-mandala</loc>');
    expect(xml).toContain('<loc>https://vernox.in/product/tree%20%26%20birds</loc>');
  });
});

describe('api/seo handler', () => {
  // The Node adapter (server/apiRouter.ts) has status/setHeader/end but no Vercel-only `send`.
  async function call(query: Record<string, string>) {
    const out = { status: 0, body: '', headers: {} as Record<string, string> };
    const res = {
      setHeader: (k: string, v: string) => { out.headers[k] = v; return res; },
      status: (s: number) => { out.status = s; return res; },
      end: (b: string) => { out.body = b; return res; },
      json: (b: unknown) => { out.body = JSON.stringify(b); return res; },
    } as unknown as VercelResponse;
    const { default: handler } = await import('../../api/seo');
    await handler({ method: 'GET', query, headers: { host: 'localhost:8080' } } as unknown as VercelRequest, res);
    return out;
  }

  it('serves the product head and the sitemap through status + end', async () => {
    store.seed('products/p1', { slug: 'om-mandala', name: 'Om Mandala', description: 'Brass.' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(TEMPLATE));
    const page = await call({ kind: 'product', slug: 'om-mandala' });
    expect(page.status).toBe(200);
    expect(page.body).toContain('<title>Om Mandala | Vernox</title>');
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:8080/index.html');
    const sitemap = await call({ kind: 'sitemap' });
    expect(sitemap.status).toBe(200);
    expect(sitemap.body).toContain('/product/om-mandala');
    fetchSpy.mockRestore();
  });
});
