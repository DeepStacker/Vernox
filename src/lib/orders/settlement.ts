/**
 * Razorpay settlement reconciliation: matches the dashboard's settlement report (Reports → Settlement
 * recon, CSV) against the loaded orders by payment id. Pure and client-side: nothing is written, finance
 * reads the result and follows up. Column names vary a little between report versions, so they are
 * looked up case-insensitively with aliases; amounts in the report are rupees.
 */
import { parseCsv } from '@/lib/csv/parseCsv';
import type { Order } from '@/types/store';
import { collectedPaise } from './finance';

/** Settlement files hold one row per payment, refund or adjustment; a busy month is a few thousand rows. */
export const MAX_SETTLEMENT_ROWS = 20_000;

const COLUMN_ALIASES = {
  id: ['entity_id', 'payment_id', 'id'],
  type: ['type', 'entity_type'],
  amount: ['amount', 'credit'],
  debit: ['debit'],
  fee: ['fee', 'fees'],
  tax: ['tax', 'gst'],
  settlementId: ['settlement_id'],
  settledAt: ['settled_at', 'settlement_date'],
} as const;

type Column = keyof typeof COLUMN_ALIASES;

export interface SettlementLine {
  id: string;
  type: 'payment' | 'refund' | 'adjustment' | 'other';
  amountPaise: number;
  feePaise: number;
  taxPaise: number;
  settlementId: string;
}

export interface SettlementMismatch {
  line: SettlementLine;
  order: Order;
  expectedPaise: number;
}

export interface SettlementReport {
  payments: number;
  matched: number;
  amountMismatches: SettlementMismatch[];
  /** Payment ids in the file that no loaded order carries (older orders, or not ours). */
  unknownPayments: SettlementLine[];
  /** Loaded prepaid orders with a captured payment that the file does not settle. */
  notInFile: Order[];
  grossPaise: number;
  refundsPaise: number;
  /** Gateway fees including their GST. */
  feesPaise: number;
  /** GST portion of the fees (input tax credit for the books). */
  taxPaise: number;
  netPaise: number;
  settlementIds: string[];
  truncated: boolean;
}

export class SettlementFileError extends Error {}

const rupeesToPaise = (raw: string) => {
  const value = Number(raw.replace(/[₹,\s]/g, ''));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
};

function columnIndex(headers: readonly string[]): Partial<Record<Column, number>> {
  const lower = headers.map(h => h.trim().toLowerCase());
  const out: Partial<Record<Column, number>> = {};
  for (const [column, aliases] of Object.entries(COLUMN_ALIASES) as Array<[Column, readonly string[]]>) {
    const idx = lower.findIndex(h => aliases.includes(h));
    if (idx >= 0) out[column] = idx;
  }
  return out;
}

const lineType = (raw: string, id: string): SettlementLine['type'] => {
  const t = raw.trim().toLowerCase();
  if (t === 'payment' || id.startsWith('pay_')) return 'payment';
  if (t === 'refund' || id.startsWith('rfnd_')) return 'refund';
  if (t === 'adjustment' || id.startsWith('adj_')) return 'adjustment';
  return 'other';
};

export function parseSettlementCsv(text: string): { lines: SettlementLine[]; truncated: boolean } {
  const csv = parseCsv(text, { maxRows: MAX_SETTLEMENT_ROWS });
  const col = columnIndex(csv.headers);
  if (col.id === undefined || col.amount === undefined) {
    throw new SettlementFileError('This does not look like a Razorpay settlement report: it needs entity_id and amount columns.');
  }
  const cell = (row: string[], c: Column) => (col[c] === undefined ? '' : row[col[c]!] ?? '');
  const lines = csv.rows
    .map(row => {
      const id = cell(row, 'id').trim();
      const credit = rupeesToPaise(cell(row, 'amount'));
      const debit = rupeesToPaise(cell(row, 'debit'));
      return {
        id,
        type: lineType(cell(row, 'type'), id),
        amountPaise: credit || debit,
        feePaise: rupeesToPaise(cell(row, 'fee')),
        taxPaise: rupeesToPaise(cell(row, 'tax')),
        settlementId: cell(row, 'settlementId').trim(),
      };
    })
    .filter(l => l.id);
  return { lines, truncated: csv.truncated || csv.inputTruncated };
}

export function reconcileSettlement(lines: readonly SettlementLine[], orders: readonly Order[], truncated = false): SettlementReport {
  const byPayment = new Map<string, Order>();
  for (const o of orders) if (o.ops?.razorpayPaymentId) byPayment.set(o.ops.razorpayPaymentId, o);

  const payments = lines.filter(l => l.type === 'payment');
  const seen = new Set<string>();
  const amountMismatches: SettlementMismatch[] = [];
  const unknownPayments: SettlementLine[] = [];
  let matched = 0;
  for (const line of payments) {
    const order = byPayment.get(line.id);
    if (!order) {
      unknownPayments.push(line);
      continue;
    }
    seen.add(line.id);
    const expectedPaise = collectedPaise(order);
    if (line.amountPaise === expectedPaise) matched += 1;
    else amountMismatches.push({ line, order, expectedPaise });
  }
  const notInFile = orders.filter(o => o.ops?.paymentMethod !== 'cod' && o.ops?.razorpayPaymentId && !seen.has(o.ops.razorpayPaymentId));

  const sum = (pick: (l: SettlementLine) => number, of = lines) => of.reduce((s, l) => s + pick(l), 0);
  const grossPaise = sum(l => l.amountPaise, payments);
  const refundsPaise = sum(l => l.amountPaise, lines.filter(l => l.type === 'refund'));
  const feesPaise = sum(l => l.feePaise);
  const taxPaise = sum(l => l.taxPaise);
  return {
    payments: payments.length,
    matched,
    amountMismatches,
    unknownPayments,
    notInFile,
    grossPaise,
    refundsPaise,
    feesPaise,
    taxPaise,
    // Razorpay's `fee` already includes the GST on it (`tax`), so tax is reported, not subtracted again.
    netPaise: grossPaise - refundsPaise - feesPaise,
    settlementIds: [...new Set(lines.map(l => l.settlementId).filter(Boolean))],
    truncated,
  };
}
