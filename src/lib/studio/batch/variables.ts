/**
 * Variable text for batch designs. A text object is marked as a variable by giving it a
 * template such as `{name}` or `Flat {block}-{number}`; each `{field}` is replaced by the
 * CSV cell of that column (column names match case-insensitively, ignoring spaces at the ends).
 * Bindings live in the batch UI state, not in the design document, so the design itself
 * stays a normal single design.
 *
 * Template-bound texts (TextObject.binding, set by parametric templates) link themselves: a
 * column whose name matches the field key or its label ("name" or "Family name"; case, spaces,
 * `_` and `-` ignored) becomes `{that column}` unless the buyer typed a template of their own
 * (resolveBindings). A typed template, including an empty one (fixed text), always wins.
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

/** Column and field names compared ignoring case, spaces, `_` and `-`: "Family name" = "family_name" = "FAMILYNAME". */
export const matchKey = (name: string) => name.toLowerCase().replace(/[\s_-]+/g, '');

/** How one text object gets its value in the batch. */
export interface TextLink {
  objectId: string;
  /** Template field the text is bound to (TextObject.binding), if any. */
  field: string | null;
  /** That field's label in the template ("Family name"), if known. */
  label: string | null;
  /** The template in force (typed or automatic); '' = fixed text. */
  template: string;
  /** auto: linked to a matching column; manual: typed by the buyer; unlinked: bound field without a matching column; fixed: neither. */
  source: 'auto' | 'manual' | 'unlinked' | 'fixed';
  /** Sheet columns the template uses that exist in the sheet. */
  columns: string[];
}

export interface ResolvedBindings {
  /** Active bindings (only templates with a `{field}`), as the rest of the batch uses them. */
  bindings: Bindings;
  links: TextLink[];
  /** Sheet columns no text uses (the quantity column excluded). */
  unusedColumns: string[];
}

/**
 * Effective bindings: what the buyer typed, else the automatic link of a template-bound text to the column named like
 * its field key or label. `labels` maps a field key to its label (from the template definition).
 */
export function resolveBindings(
  stored: Bindings,
  doc: Pick<StudioDocument, 'objects'>,
  headers: readonly string[],
  labels: Readonly<Record<string, string>> = {},
  isQtyColumn: (header: string) => boolean = () => false,
): ResolvedBindings {
  const byKey = new Map<string, string>();
  for (const h of headers) {
    const k = matchKey(h);
    if (k && !byKey.has(k)) byKey.set(k, h.trim());
  }
  const columnFor = (field: string): string | null => {
    const label = labels[field];
    return byKey.get(matchKey(field)) ?? (label ? byKey.get(matchKey(label)) ?? null : null);
  };
  const have = new Set(headers.map(normaliseField));
  const links: TextLink[] = [];
  const merged: Bindings = {};
  for (const o of doc.objects) {
    if (o.kind !== 'text') continue;
    const field = o.binding ?? null;
    let template = '';
    let source: TextLink['source'] = 'fixed';
    if (o.id in stored) {
      template = stored[o.id];
      source = 'manual';
    } else if (field) {
      const column = columnFor(field);
      template = column ? `{${column}}` : '';
      source = column ? 'auto' : 'unlinked';
    }
    merged[o.id] = template;
    links.push({
      objectId: o.id,
      field,
      label: field ? labels[field] ?? null : null,
      template,
      source,
      columns: templateFields(template).filter(f => have.has(normaliseField(f))),
    });
  }
  const used = new Set(links.flatMap(l => l.columns.map(normaliseField)));
  const unused = headers.map(h => h.trim()).filter(h => h && !isQtyColumn(h) && !used.has(normaliseField(h)));
  return { bindings: activeBindings(merged, doc), links, unusedColumns: [...new Set(unused)] };
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
