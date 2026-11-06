import { describe, expect, it } from 'vitest';
import { ORDER_LIMITS } from '@/lib/pricing/orderLimits';
import { batchTotals, checkRows, fitsCart, groupVariants, qtyColumn, splitQuantity } from '../plan';

const bindings = { t1: '{name}' };

describe('row checks', () => {
  const headers = ['Name', 'Qty'];
  it('flags empty rows, empty variable values and bad quantities inline', () => {
    const checks = checkRows(headers, [['Asha', '2'], ['', ''], ['', '3'], ['Ravi', 'two'], ['Mina', '0'], ['Dev', '101'], ['Lee', '']], bindings);
    expect(checks.map(c => c.state)).toEqual(['valid', 'empty', 'invalid', 'invalid', 'invalid', 'invalid', 'valid']);
    expect(checks[2].problems).toEqual([{ code: 'empty-value', field: 'name' }]);
    expect(checks[3].problems[0]).toMatchObject({ code: 'bad-qty', value: 'two' });
    expect(checks[5].problems[0]).toMatchObject({ code: 'qty-too-high', max: ORDER_LIMITS.maxQuantityPerLine });
    expect(checks.map(c => c.quantity)).toEqual([2, 0, 3, 1, 1, 1, 1]);
  });

  it('finds the qty column by name', () => {
    expect(qtyColumn(['a', ' QTY '])).toBe(1);
    expect(qtyColumn(['Quantity'])).toBe(0);
    expect(qtyColumn(['a'])).toBe(-1);
  });
});

describe('variants and totals', () => {
  const checks = checkRows(['name', 'qty'], [['A', '2'], ['B', ''], ['A', '3'], ['', '1']], bindings);

  it('merges rows with identical text and sums their quantities', () => {
    const variants = groupVariants(checks);
    expect(variants.map(v => [v.texts.t1, v.quantity, v.rowIndexes])).toEqual([['A', 5, [0, 2]], ['B', 1, [1]]]);
  });

  it('totals price x quantity per row and counts flagged and pending', () => {
    const [a, b] = groupVariants(checks);
    const all = batchTotals(checks, new Map([[a.key, 100_00], [b.key, 250_00]]), new Set());
    expect(all).toMatchObject({ validRows: 3, flaggedRows: 1, variants: 2, units: 6, totalPaise: 100_00 * 5 + 250_00, pending: 0 });
    const partial = batchTotals(checks, new Map([[a.key, 100_00]]), new Set());
    expect(partial.pending).toBe(1);
    expect(partial.totalPaise).toBe(500_00);
    const failed = batchTotals(checks, new Map([[a.key, 100_00]]), new Set([b.key]));
    expect(failed).toMatchObject({ flaggedRows: 2, validRows: 2, pending: 0 });
  });

  it('excludes empty rows from the totals but not from the row count', () => {
    const t = batchTotals(checkRows(['name'], [['A'], ['']], bindings), new Map(), new Set());
    expect(t.rows).toBe(2);
    expect(t.flaggedRows).toBe(0);
  });
});

describe('cart limits', () => {
  it('splits quantities above the per-line maximum', () => {
    expect(splitQuantity(5)).toEqual([5]);
    expect(splitQuantity(250)).toEqual([100, 100, 50]);
  });

  it('respects line count and design byte limits', () => {
    expect(fitsCart({ lines: 0, designChars: 0 }, 1000)).toBe(true);
    expect(fitsCart({ lines: ORDER_LIMITS.maxLines, designChars: 0 }, 1)).toBe(false);
    expect(fitsCart({ lines: ORDER_LIMITS.maxLines - 1, designChars: 0 }, 1)).toBe(true);
    expect(fitsCart({ lines: 0, designChars: ORDER_LIMITS.maxTotalDesignRefChars - 10 }, 11)).toBe(false);
    expect(fitsCart({ lines: 0, designChars: 0 }, ORDER_LIMITS.maxDesignRefChars + 1)).toBe(false);
  });
});
