/**
 * Courier COD remittance reconciliation: matches a remittance report (Shiprocket → Billing → COD
 * Remittance, exported as CSV; other couriers' exports work when they carry an AWB and an amount
 * column) against the loaded COD orders by AWB. Pure and client-side, like settlement.ts: it reports
 * what was remitted, what differs and what is still owed; it writes nothing.
 */
import { parseCsv } from '@/lib/csv/parseCsv';
import type { Order } from '@/types/store';
import { parseReportAmountPaise, totalPaise } from './finance';

export const MAX_REMITTANCE_ROWS = 20_000;

const ALIASES = {
  awb: ['awb', 'awb code', 'awb no', 'awb number', 'tracking number', 'waybill'],
  amount: ['cod amount', 'remitted amount', 'remittance amount', 'collected amount', 'amount'],
  utr: ['utr', 'utr no', 'utr number', 'bank reference', 'reference'],
  date: ['remittance date', 'remitted on', 'remitted date', 'date'],
} as const;
type Column = keyof typeof ALIASES;

export interface RemittanceLine {
  awb: string;
  amountPaise: number;
  utr: string;
  date: string;
}

export interface RemittanceReport {
  lines: number;
  matched: number;
  amountMismatches: Array<{ line: RemittanceLine; order: Order; expectedPaise: number }>;
  unknownAwbs: RemittanceLine[];
  /** Delivered COD orders in the loaded set whose AWB the file does not remit. */
  outstanding: Order[];
  remittedPaise: number;
  utrs: string[];
  truncated: boolean;
}

export class RemittanceFileError extends Error {}

const normaliseHeader = (h: string) => h.trim().toLowerCase().replace(/[_.]+/g, ' ').replace(/\s+/g, ' ');
const normaliseAwb = (awb: string) => awb.trim().toUpperCase();

/** Rows with an amount that is not a number are left out of `lines` and described in `rowErrors`, never read as 0. */
export function parseRemittanceCsv(text: string): { lines: RemittanceLine[]; truncated: boolean; rowErrors: string[] } {
  const csv = parseCsv(text, { maxRows: MAX_REMITTANCE_ROWS });
  const headers = csv.headers.map(normaliseHeader);
  const col: Partial<Record<Column, number>> = {};
  for (const [key, aliases] of Object.entries(ALIASES) as Array<[Column, readonly string[]]>) {
    const idx = headers.findIndex(h => aliases.includes(h));
    if (idx >= 0) col[key] = idx;
  }
  if (col.awb === undefined || col.amount === undefined) {
    throw new RemittanceFileError('This does not look like a COD remittance report: it needs an AWB column and an amount column.');
  }
  const cell = (row: string[], c: Column) => (col[c] === undefined ? '' : row[col[c]!] ?? '');
  const lines: RemittanceLine[] = [];
  const rowErrors: string[] = [];
  csv.rows.forEach((row, index) => {
    const awb = normaliseAwb(cell(row, 'awb'));
    if (!awb) return;
    const amountPaise = parseReportAmountPaise(cell(row, 'amount'));
    if (amountPaise === null) {
      rowErrors.push(`Row ${index + 2} (AWB ${awb}): the amount is not a number.`);
      return;
    }
    lines.push({ awb, amountPaise, utr: cell(row, 'utr').trim(), date: cell(row, 'date').trim() });
  });
  return { lines, truncated: csv.truncated || csv.inputTruncated, rowErrors };
}

export function reconcileRemittance(lines: readonly RemittanceLine[], orders: readonly Order[], truncated = false): RemittanceReport {
  const cod = orders.filter(o => o.ops?.paymentMethod === 'cod');
  const byAwb = new Map<string, Order>();
  for (const o of cod) if (o.ops?.shipment?.awb) byAwb.set(normaliseAwb(o.ops.shipment.awb), o);

  const remitted = new Set<string>();
  const amountMismatches: RemittanceReport['amountMismatches'] = [];
  const unknownAwbs: RemittanceLine[] = [];
  let matched = 0;
  for (const line of lines) {
    const order = byAwb.get(line.awb);
    if (!order) {
      unknownAwbs.push(line);
      continue;
    }
    remitted.add(line.awb);
    const expectedPaise = totalPaise(order);
    if (line.amountPaise === expectedPaise) matched += 1;
    else amountMismatches.push({ line, order, expectedPaise });
  }
  const outstanding = cod.filter(o => o.status === 'Delivered' && o.ops?.shipment?.awb && !remitted.has(normaliseAwb(o.ops.shipment.awb)));
  return {
    lines: lines.length,
    matched,
    amountMismatches,
    unknownAwbs,
    outstanding,
    remittedPaise: lines.reduce((s, l) => s + l.amountPaise, 0),
    utrs: [...new Set(lines.map(l => l.utr).filter(Boolean))],
    truncated,
  };
}
