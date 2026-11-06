/**
 * Variable text for batch designs. A text object is marked as a variable by giving it a
 * template such as `{name}` or `Flat {block}-{number}`; each `{field}` is replaced by the
 * CSV cell of that column (column names match case-insensitively, ignoring spaces at the ends).
 * Bindings live in the batch UI state, not in the design document, so the design itself
 * stays a normal single design.
 */
import type { StudioDocument, TextObject } from '../schema';

/** Object id → text template. Templates without a `{field}` are fixed text and are ignored. */
export type Bindings = Record<string, string>;

const FIELD = /\{([^{}]+)\}/g;
const MAX_LABEL_CHARS = 60;

export const normaliseField = (name: string) => name.trim().toLowerCase();

/** Field names used by a template, in order of first use, as typed. */
export function templateFields(template: string): string[] {
  const seen = new Map<string, string>();
  for (const m of template.matchAll(FIELD)) {
    const key = normaliseField(m[1]);
    if (key && !seen.has(key)) seen.set(key, m[1].trim());
  }
  return [...seen.values()];
}

/** Replaces each `{field}` with its cell; fields without a column become empty. */
export function substitute(template: string, cells: Readonly<Record<string, string>>): string {
  return template.replace(FIELD, (_, name: string) => cells[normaliseField(name)] ?? '');
}

/** Maps a row of cells to a lookup keyed by normalised header. */
export function cellsByHeader(headers: readonly string[], row: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((h, i) => {
    const key = normaliseField(h);
    // First column wins when a header repeats.
    if (key && !(key in out)) out[key] = (row[i] ?? '').trim();
  });
  return out;
}

/** Only bindings that actually reference a field, and only for text objects that still exist. */
export function activeBindings(bindings: Bindings, doc: Pick<StudioDocument, 'objects'>): Bindings {
  const out: Bindings = {};
  for (const o of doc.objects) {
    const template = bindings[o.id];
    if (o.kind === 'text' && template && templateFields(template).length > 0) out[o.id] = template;
  }
  return out;
}

/** Fields referenced by the bindings that the CSV has no column for. */
export function missingColumns(bindings: Bindings, headers: readonly string[]): string[] {
  const have = new Set(headers.map(normaliseField));
  const missing = new Map<string, string>();
  for (const template of Object.values(bindings)) {
    for (const f of templateFields(template)) {
      const key = normaliseField(f);
      if (!have.has(key) && !missing.has(key)) missing.set(key, f);
    }
  }
  return [...missing.values()];
}

/** Resolved text per bound object for one row. */
export function resolveTexts(bindings: Bindings, cells: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, template] of Object.entries(bindings)) out[id] = substitute(template, cells);
  return out;
}

/** Rows that resolve to identical text produce the same design; this key de-duplicates them. */
export function variantKey(texts: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.keys(texts).sort().map(id => [id, texts[id]]));
}

/** Short human label for a variant (used in the cart line and production file names). */
export function variantLabel(texts: Readonly<Record<string, string>>): string {
  const label = Object.values(texts).map(v => v.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' / ');
  return label.length > MAX_LABEL_CHARS ? `${label.slice(0, MAX_LABEL_CHARS - 1)}…` : label;
}

/**
 * The document for one variant: bound text replaced and outlines cleared (they are shaped
 * afterwards), everything else untouched.
 */
export function applyVariantTexts(doc: StudioDocument, texts: Readonly<Record<string, string>>): StudioDocument {
  const objects = doc.objects.map(o => {
    if (o.kind !== 'text' || !(o.id in texts)) return o;
    const next: TextObject = { ...o, text: texts[o.id], outline: undefined };
    return next;
  });
  const label = variantLabel(texts);
  return {
    ...doc,
    objects,
    name: (label ? `${doc.name || 'Custom design'} – ${label}` : doc.name).slice(0, 120),
    updatedAt: Date.now(),
    production: undefined,
  };
}
