/**
 * Server-side page heads for link previews. WhatsApp, Facebook and most chat apps read Open Graph tags
 * from the raw HTML without running JavaScript, so a shared product link must already carry that
 * product's title, description and image. injectProductMeta rewrites the SPA's index.html head; the
 * app still renders the page in the browser as usual.
 */
import { escapeXml } from '../../src/lib/seo/sitemap';

export interface ProductMeta {
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
}

export const siteOrigin = (env: NodeJS.ProcessEnv = process.env) => (env.VITE_SITE_URL?.trim() || 'https://vernox.in').replace(/\/+$/, '');

const attr = (value: string) => escapeXml(value);
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

/** Replaces a tag matched by `pattern`, or appends `tag` before </head> when the template lacks it. */
function upsert(html: string, pattern: RegExp, tag: string): string {
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

export function injectProductMeta(template: string, product: ProductMeta, origin: string): string {
  const title = `${product.name} | Vernox`;
  const description = clip(product.description.replace(/\s+/g, ' ').trim() || `${product.name}, laser-cut metal wall art made to order in India.`, 200);
  const url = `${origin}/product/${encodeURIComponent(product.slug)}`;
  const image = product.imageUrl ? (product.imageUrl.startsWith('/') ? origin + product.imageUrl : product.imageUrl) : null;
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`);
  html = upsert(html, /<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${attr(description)}" />`);
  html = upsert(html, /<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${attr(title)}" />`);
  html = upsert(html, /<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${attr(description)}" />`);
  html = upsert(html, /<meta property="og:type" content="[^"]*"\s*\/?>/, '<meta property="og:type" content="product" />');
  html = upsert(html, /<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${attr(url)}" />`);
  html = upsert(html, /<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${attr(url)}" />`);
  if (image) {
    html = upsert(html, /<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${attr(image)}" />`);
    html = upsert(html, /<meta name="twitter:image" content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${attr(image)}" />`);
  }
  return html;
}
