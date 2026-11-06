/**
 * Sitemap content, shared by the live `/sitemap.xml` (api/seo.ts, built from the products in Firestore
 * so new products appear without a deploy). Dependency-free so the API build can import it.
 */

type ChangeFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface SitemapEntry {
  path: string;
  changefreq: ChangeFreq;
  priority: number;
}

// Indexable public routes only. Excluded on purpose: /admin, /cart, /checkout, /account, /track-order,
// /order-confirmation/*, /notebook and redirect aliases.
export const STATIC_ROUTES: readonly SitemapEntry[] = [
  { path: '/', changefreq: 'weekly', priority: 1.0 },
  { path: '/shop', changefreq: 'daily', priority: 0.9 },
  { path: '/studio', changefreq: 'monthly', priority: 0.8 },
  { path: '/trade', changefreq: 'monthly', priority: 0.6 },
  { path: '/about', changefreq: 'monthly', priority: 0.5 },
  { path: '/contact', changefreq: 'yearly', priority: 0.5 },
  { path: '/faqs', changefreq: 'monthly', priority: 0.5 },
  { path: '/shipping', changefreq: 'yearly', priority: 0.4 },
  { path: '/returns', changefreq: 'yearly', priority: 0.4 },
  { path: '/privacy', changefreq: 'yearly', priority: 0.2 },
  { path: '/terms', changefreq: 'yearly', priority: 0.2 },
];

export const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildSitemapXml(siteUrl: string, productSlugs: readonly string[]): string {
  const origin = siteUrl.replace(/\/+$/, '');
  const entries: SitemapEntry[] = [
    ...STATIC_ROUTES,
    ...productSlugs.map(slug => ({ path: `/product/${encodeURIComponent(slug)}`, changefreq: 'weekly' as const, priority: 0.7 })),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(e => `  <url>\n    <loc>${escapeXml(origin + e.path)}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority.toFixed(1)}</priority>\n  </url>`),
    '</urlset>',
    '',
  ].join('\n');
}
