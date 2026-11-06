/**
 * Pure batch planning: per-row checks, grouping rows into distinct design variants,
 * totals, and fitting variants into the checkout limits. No React, no geometry — the
 * geometry stage (shaping, fit, price) lives in evaluate.ts.
 */
import { ORDER_LIMITS } from '@/lib/pricing/orderLimits';
import { cellsByHeader, normaliseField, resolveTexts, templateFields, variantKey, type Bindings } from './variables';

export type BatchProblem =
  | { code: 'empty-row' }
  | { code: 'empty-value'; field: string }
  | { code: 'bad-qty'; value: string }
  | { code: 'qty-too-high'; max: number }
  | { code: 'too-long'; overMm: number }
  | { code: 'shape-failed' }
  | { code: 'not-orderable'; message: string }
  | { code: 'unpriced'; reason: string };

export type RowState = 'empty' | 'invalid' | 'valid';

export interface RowCheck {
  index: number;
  state: RowState;
  quantity: number;
  /** Resolved text per bound object; empty for empty rows. */
  texts: Record<string, string>;
  /** De-duplication key of the resulting design. */
  key: string;
  problems: BatchProblem[];
}

const QTY_HEADERS = new Set(['qty', 'quantity']);

/** Column holding the per-row quantity, if any. */
export function qtyColumn(headers: readonly string[]): number {
  return headers.findIndex(h => QTY_HEADERS.has(normaliseField(h)));
}

/** Cheap, synchronous checks of one CSV record (no geometry). */
export function checkRow(index: number, headers: readonly string[], row: readonly string[], bindings: Bindings): RowCheck {
  if (row.every(c => c.trim() === '')) {
    return { index, state: 'empty', quantity: 0, texts: {}, key: '', problems: [{ code: 'empty-row' }] };
  }
  const cells = cellsByHeader(headers, row);
  const problems: BatchProblem[] = [];

  let quantity = 1;
  const q = qtyColumn(headers);
  const rawQty = q >= 0 ? (row[q] ?? '').trim() : '';
  if (rawQty !== '') {
    const n = Number(rawQty);
    if (!/^\d+$/.test(rawQty) || n < 1) problems.push({ code: 'bad-qty', value: rawQty });
    else if (n > ORDER_LIMITS.maxQuantityPerLine) problems.push({ code: 'qty-too-high', max: ORDER_LIMITS.maxQuantityPerLine });
    else quantity = n;
  }

  const texts = resolveTexts(bindings, cells);
  for (const [id, template] of Object.entries(bindings)) {
    // A variable that resolves to nothing would cut a blank plate.
    if (!texts[id].trim()) problems.push({ code: 'empty-value', field: templateFields(template)[0] ?? '' });
  }
  return { index, state: problems.length ? 'invalid' : 'valid', quantity, texts, key: variantKey(texts), problems };
}

export function checkRows(headers: readonly string[], rows: readonly (readonly string[])[], bindings: Bindings): RowCheck[] {
  return rows.map((r, i) => checkRow(i, headers, r, bindings));
}

export interface Variant {
  key: string;
  texts: Record<string, string>;
  /** Total units over all rows that resolve to this design. */
  quantity: number;
  rowIndexes: number[];
}

/** Distinct designs among the valid rows, in first-seen order, with summed quantities. */
export function groupVariants(checks: readonly RowCheck[]): Variant[] {
  const byKey = new Map<string, Variant>();
  for (const c of checks) {
    if (c.state !== 'valid') continue;
    const v = byKey.get(c.key);
    if (v) { v.quantity += c.quantity; v.rowIndexes.push(c.index); }
    else byKey.set(c.key, { key: c.key, texts: c.texts, quantity: c.quantity, rowIndexes: [c.index] });
  }
  return [...byKey.values()];
}

/** Quantities per cart line: a variant above the per-line maximum becomes several lines. */
export function splitQuantity(quantity: number, max: number = ORDER_LIMITS.maxQuantityPerLine): number[] {
  const lines: number[] = [];
  for (let left = quantity; left > 0; left -= max) lines.push(Math.min(left, max));
  return lines;
}

export interface BatchTotals {
  rows: number;
  validRows: number;
  flaggedRows: number;
  variants: number;
  units: number;
  /** Sum of unit price × quantity over priced variants, paise. */
  totalPaise: number;
  /** Variants still being priced. */
  pending: number;
}

/**
 * Totals over the rows that can be ordered. `unitPaise` maps a variant key to its price once
 * evaluated; `failed` holds variants the geometry stage rejected.
 */
export function batchTotals(
  checks: readonly RowCheck[],
  unitPaise: ReadonlyMap<string, number>,
  failed: ReadonlySet<string>,
): BatchTotals {
  let flaggedRows = 0;
  let validRows = 0;
  let units = 0;
  let totalPaise = 0;
  const variants = new Set<string>();
  const pending = new Set<string>();
  for (const c of checks) {
    if (c.state === 'empty') continue; // empty rows are reported as flagged but are not orders
    if (c.state === 'invalid' || failed.has(c.key)) { flaggedRows++; continue; }
    validRows++;
    variants.add(c.key);
    units += c.quantity;
    const unit = unitPaise.get(c.key);
    if (unit === undefined) pending.add(c.key);
    else totalPaise += unit * c.quantity;
  }
  return { rows: checks.length, validRows, flaggedRows, variants: variants.size, units, totalPaise, pending: pending.size };
}

export interface CartRoom {
  lines: number;
  designChars: number;
}

/** True when one more line of `chars` design characters still fits the checkout limits. */
export function fitsCart(room: CartRoom, chars: number): boolean {
  return (
    room.lines + 1 <= ORDER_LIMITS.maxLines &&
    chars <= ORDER_LIMITS.maxDesignRefChars &&
    room.designChars + chars <= ORDER_LIMITS.maxTotalDesignRefChars
  );
}
