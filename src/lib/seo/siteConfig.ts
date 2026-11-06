/**
 * Single source of truth for site-level SEO identity.
 * `VITE_SITE_URL` is the canonical public origin (no trailing slash). The
 * default is a placeholder until the production domain is final; the live
 * sitemap and product link previews (api/seo.ts) read the same variable.
 */
import { DEFAULT_SITE_URL } from "./defaultSiteUrl";

export { DEFAULT_SITE_URL };

export const SITE_NAME = "Vernox";
export const SITE_TAGLINE = "Laser-cut metal wall art, made to order in India";
export const DEFAULT_DESCRIPTION =
  "Vernox makes laser-cut metal wall art to order in India. Choose a design or create your own, in steel, brass, copper and more, with delivery across India.";
export const DEFAULT_OG_IMAGE_PATH = "/images/hero-penthouse-brass.jpg";

const rawSiteUrl = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();

export const SITE_URL = (rawSiteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "");

/** Resolve a site-relative path or absolute URL to an absolute URL. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}
