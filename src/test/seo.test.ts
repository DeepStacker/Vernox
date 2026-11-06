// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { injectProductMeta } from '../../api/_lib/seo';
import { buildSitemapXml, STATIC_ROUTES } from '../lib/seo/sitemap';

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
