/**
 * Builds public/sitemap.xml from static storefront routes plus product slugs.
 * Runs automatically before `npm run build` (see "prebuild" in package.json).
 *
 * Origin: VITE_SITE_URL (process env or .env files), falling back to the shared default.
 *
 * NOTE: product slugs are read from src/lib/catalog.ts for now. Once the catalog
 * moves to Firestore, read published products from there instead (server-side,
 * with the admin SDK) so new products appear in the sitemap without a code change.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { products } from "../src/lib/catalog";
import { DEFAULT_SITE_URL } from "../src/lib/seo/defaultSiteUrl";

type ChangeFreq = "daily" | "weekly" | "monthly" | "yearly";

interface Entry {
  path: string;
  changefreq: ChangeFreq;
  priority: number;
}

// Indexable public routes only. Excluded on purpose: /admin, /cart, /checkout,
// /account, /track-order, /order-confirmation/*, /notebook and redirect aliases.
const STATIC_ROUTES: Entry[] = [
  { path: "/", changefreq: "weekly", priority: 1.0 },
  { path: "/shop", changefreq: "daily", priority: 0.9 },
  { path: "/studio", changefreq: "monthly", priority: 0.8 },
  { path: "/trade", changefreq: "monthly", priority: 0.6 },
  { path: "/about", changefreq: "monthly", priority: 0.5 },
  { path: "/contact", changefreq: "yearly", priority: 0.5 },
  { path: "/faqs", changefreq: "monthly", priority: 0.5 },
  { path: "/shipping", changefreq: "yearly", priority: 0.4 },
  { path: "/returns", changefreq: "yearly", priority: 0.4 },
  { path: "/privacy", changefreq: "yearly", priority: 0.2 },
  { path: "/terms", changefreq: "yearly", priority: 0.2 },
];

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const env = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "");
const siteUrl = (process.env.VITE_SITE_URL || env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");

const entries: Entry[] = [
  ...STATIC_ROUTES,
  ...products.map((p) => ({ path: `/product/${p.slug}`, changefreq: "weekly" as const, priority: 0.7 })),
];

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries.map(
    (e) =>
      `  <url>\n    <loc>${escapeXml(siteUrl + e.path)}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority.toFixed(1)}</priority>\n  </url>`,
  ),
  "</urlset>",
  "",
].join("\n");

const outPath = resolve(dirname(fileURLToPath(import.meta.url)), "../public/sitemap.xml");
writeFileSync(outPath, xml);
console.log(`sitemap.xml: ${entries.length} URLs for ${siteUrl}`);
