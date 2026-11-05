import { useEffect } from "react";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE_PATH,
  SITE_NAME,
  SITE_TAGLINE,
  absoluteUrl,
} from "./siteConfig";

export type JsonLd = Record<string, unknown>;

export interface SeoOptions {
  /** Page title without the site suffix; omit on the home page. */
  title?: string;
  description?: string;
  /** Site-relative canonical path, e.g. "/shop". Defaults to the current path. */
  canonicalPath?: string;
  /** Site-relative path or absolute URL of the social share image. */
  image?: string;
  /** One or more JSON-LD documents injected as <script type="application/ld+json">. */
  jsonLd?: JsonLd | JsonLd[];
  /** Adds <meta name="robots" content="noindex,nofollow">. */
  noindex?: boolean;
  /** og:type, defaults to "website" ("product" for PDPs). */
  ogType?: string;
}

function upsertMeta(attr: "name" | "property", key: string, content: string): () => void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  const created = !el;
  const previous = el?.getAttribute("content") ?? null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return () => {
    if (created) el.remove();
    else if (previous !== null) el.setAttribute("content", previous);
  };
}

function upsertCanonical(href: string): () => void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const created = !el;
  const previous = el?.getAttribute("href") ?? null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return () => {
    if (created) el.remove();
    else if (previous !== null) el.setAttribute("href", previous);
  };
}

/**
 * Sets document title, description, canonical, Open Graph / Twitter tags and
 * JSON-LD for the current page; everything is reverted on unmount so a page
 * never leaks tags into the next route.
 */
export function useSeo({
  title,
  description = DEFAULT_DESCRIPTION,
  canonicalPath,
  image = DEFAULT_OG_IMAGE_PATH,
  jsonLd,
  noindex = false,
  ogType = "website",
}: SeoOptions = {}): void {
  // Serialized so callers can pass fresh object literals without re-running the effect.
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : "";

  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | ${SITE_TAGLINE}`;
    const canonical = absoluteUrl(canonicalPath ?? window.location.pathname);
    const imageUrl = absoluteUrl(image);

    const previousTitle = document.title;
    document.title = fullTitle;

    const cleanups: Array<() => void> = [
      upsertMeta("name", "description", description),
      upsertCanonical(canonical),
      upsertMeta("property", "og:site_name", SITE_NAME),
      upsertMeta("property", "og:type", ogType),
      upsertMeta("property", "og:title", fullTitle),
      upsertMeta("property", "og:description", description),
      upsertMeta("property", "og:url", canonical),
      upsertMeta("property", "og:image", imageUrl),
      upsertMeta("name", "twitter:card", "summary_large_image"),
      upsertMeta("name", "twitter:title", fullTitle),
      upsertMeta("name", "twitter:description", description),
      upsertMeta("name", "twitter:image", imageUrl),
    ];
    if (noindex) cleanups.push(upsertMeta("name", "robots", "noindex,nofollow"));

    const scripts: HTMLScriptElement[] = [];
    if (jsonLdKey) {
      const parsed = JSON.parse(jsonLdKey) as JsonLd | JsonLd[];
      for (const doc of Array.isArray(parsed) ? parsed : [parsed]) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        // Escape "<" so JSON content can never close the script element early.
        script.textContent = JSON.stringify(doc).replace(/</g, "\\u003c");
        document.head.appendChild(script);
        scripts.push(script);
      }
    }

    return () => {
      document.title = previousTitle;
      cleanups.forEach((undo) => undo());
      scripts.forEach((s) => s.remove());
    };
  }, [title, description, canonicalPath, image, jsonLdKey, noindex, ogType]);
}
