/**
 * GET /api/seo?kind=product&slug=…  — index.html with the product's title, description and image in the
 *                                     head (vercel.json rewrites /product/:slug here) for link previews.
 * GET /api/seo?kind=sitemap         — /sitemap.xml from the products in Firestore.
 * Public, cached at the CDN; unknown slugs get the plain page (the app shows its own not-found view).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildSitemapXml } from '../src/lib/seo/sitemap';
import { sendError } from './_lib/errors';
import { getStore } from './_lib/firebaseAdmin';
import { assertMethod } from './_lib/http';
import { injectProductMeta, siteOrigin } from './_lib/seo';

let template: { html: string; at: number } | null = null;
const TEMPLATE_TTL_MS = 5 * 60_000;

/** The deployed index.html (static asset of the same deployment), cached per warm instance. */
async function indexHtml(req: VercelRequest): Promise<string> {
  if (template && Date.now() - template.at < TEMPLATE_TTL_MS) return template.html;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  // Vercel always sends x-forwarded-proto; the local adapter serves plain http.
  const proto = req.headers['x-forwarded-proto'] ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(String(host)) ? 'http' : 'https');
  const res = await fetch(`${proto}://${host}/index.html`);
  if (!res.ok) throw new Error(`index.html fetch failed: ${res.status}`);
  template = { html: await res.text(), at: Date.now() };
  return template.html;
}

/** status + end, which both Vercel and the Node adapter (server/apiRouter.ts) support; `send` is Vercel-only. */
function sendBody(res: VercelResponse, body: string) {
  res.status(200);
  return res.end(body);
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['GET', 'HEAD']);
    const store = getStore();
    if (req.query.kind === 'sitemap') {
      const products = await store.query('products', { limit: 5000 });
      const slugs = products.map(p => str(p.data.slug)).filter(Boolean);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return sendBody(res, buildSitemapXml(siteOrigin(), slugs));
    }

    const slug = str(req.query.slug).slice(0, 160);
    const html = await indexHtml(req);
    const [match] = slug ? await store.query('products', { where: [{ field: 'slug', op: '==', value: slug }], limit: 1 }) : [];
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    if (!match) return sendBody(res, html);
    const p = match.data;
    return sendBody(res, injectProductMeta(html, {
      slug,
      name: str(p.name) || slug,
      description: str(p.tagline) ? `${str(p.tagline)}. ${str(p.description)}` : str(p.description),
      imageUrl: str(p.imageUrl) || null,
    }, siteOrigin()));
  } catch (err) {
    // A product page must still open when the lookup fails: serve the plain app shell if we have it.
    if (req.query.kind !== 'sitemap' && template) {
      console.error('[seo] product meta failed, serving the plain page', err);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return sendBody(res, template.html);
    }
    return sendError(res, err, 'seo');
  }
}
