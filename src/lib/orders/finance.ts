/**
 * Pure finance logic for the staff Finance console: what was collected, the refund ceiling,
 * reconciliation lists and CSV exports. Money is read from `Order.ops` (paise, written by the
 * server); nothing here calls the API, and the server stays the authority on every refund
 * (CREATE_REFUND re-checks the ceiling). collectedPaise mirrors api/_lib/payments.ts.
 */
import { PAID_STATUSES } from '@/types/orderStatus';
import type { Order } from '@/types/store';
import { ORDER_STATUS_LABELS } from './orderStateMachine';

const IST_OFFSET_MS = 5.5 * 3600_000;

export const rupees = (paise: number): number => paise / 100;

export const formatInr = (paise: number): string =>
  `₹${rupees(paise).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Order total in paise: the server value, else the rupee display copy. */
export const totalPaise = (order: Order): number => order.ops?.totalPaise || Math.round(order.total * 100);

/** Money actually collected: the captured online payment, or the COD cash recorded on delivery. */
export function collectedPaise(order: Order): number {
  const ops = order.ops;
  if (!ops) return 0;
  if (ops.paymentMethod === 'cod') return ops.codCollectedPaise;
  if (ops.paymentMethod === 'replacement') return 0;
  return ops.razorpayPaymentId ? totalPaise(order) : 0;
}

/** Largest refund the server will accept now: collected minus refunded minus refunds in flight. */
export function refundCeilingPaise(order: Order): number {
  const ops = order.ops;
  return Math.max(0, collectedPaise(order) - (ops?.refundedPaise ?? 0) - (ops?.refundPendingPaise ?? 0));
}

export type PaymentState = 'prepaid_captured' | 'prepaid_unpaid' | 'cod_collected' | 'cod_pending' | 'replacement';

const NOT_PAYABLE: readonly string[] = ['Cancelled', 'Expired', 'Payment_Failed', 'RTO_Delivered', 'Refunded'];

export function paymentState(order: Order): PaymentState {
  const method = order.ops?.paymentMethod ?? 'prepaid';
  if (method === 'replacement') return 'replacement';
  if (method === 'cod') return order.ops && order.ops.codCollectedPaise > 0 ? 'cod_collected' : 'cod_pending';
  return order.ops?.razorpayPaymentId ? 'prepaid_captured' : 'prepaid_unpaid';
}

export interface PaymentTotals {
  prepaidCapturedPaise: number;
  codCollectedPaise: number;
  codPendingPaise: number;
  refundedPaise: number;
}

/** Totals over a set of orders. Pending COD counts only orders that can still be delivered and paid. */
export function paymentTotals(orders: readonly Order[]): PaymentTotals {
  const t: PaymentTotals = { prepaidCapturedPaise: 0, codCollectedPaise: 0, codPendingPaise: 0, refundedPaise: 0 };
  for (const o of orders) {
    const state = paymentState(o);
    if (state === 'prepaid_captured') t.prepaidCapturedPaise += totalPaise(o);
    if (state === 'cod_collected') t.codCollectedPaise += collectedPaise(o);
    if (state === 'cod_pending' && !NOT_PAYABLE.includes(o.status) && o.status !== 'Pending_Payment') t.codPendingPaise += totalPaise(o);
    t.refundedPaise += o.ops?.refundedPaise ?? 0;
  }
  return t;
}

/** Order flags that mean money needs a human look. */
export const RECONCILIATION_FLAGS = ['AMOUNT_MISMATCH', 'DUPLICATE_PAYMENT', 'REFUND_NOT_STARTED', 'INVOICE_PENDING_SELLER_SETTINGS'] as const;

export interface Reconciliation {
  /** Prepaid orders past payment with no Razorpay payment id on record. */
  paidWithoutPaymentId: Order[];
  /** Payment_Discrepancy orders and orders carrying a payment or refund flag. */
  flagged: Order[];
  /** Refunds requested from Razorpay and not yet confirmed by the webhook. */
  refundsPending: Order[];
  /** Delivered COD orders with no cash recorded as collected. */
  codNotCollected: Order[];
}

export function reconcile(orders: readonly Order[]): Reconciliation {
  const paidStatuses: readonly string[] = PAID_STATUSES;
  return {
    paidWithoutPaymentId: orders.filter(o => (o.ops?.paymentMethod ?? 'prepaid') === 'prepaid' && paidStatuses.includes(o.status) && !o.ops?.razorpayPaymentId),
    flagged: orders.filter(o => o.status === 'Payment_Discrepancy' || (o.ops?.flags ?? []).some(f => (RECONCILIATION_FLAGS as readonly string[]).includes(f))),
    refundsPending: orders.filter(o => (o.ops?.refundPendingPaise ?? 0) > 0),
    codNotCollected: orders.filter(o => o.ops?.paymentMethod === 'cod' && o.status === 'Delivered' && (o.ops.codCollectedPaise ?? 0) === 0),
  };
}

// ---------------------------------------------------------------- GST split

export type SupplyKind = 'intra_state' | 'inter_state' | 'unknown';

export interface GstSplit {
  supply: SupplyKind;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
}

const normState = (value: string | undefined): string => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * GST split of an order's tax: CGST + SGST when the delivery state is the seller's state, IGST
 * otherwise. With no seller state configured the split is left empty (supply "unknown") rather
 * than guessed. The invoice PDF stays authoritative: it rounds per line, this splits the order
 * tax total, so the two can differ by a paisa.
 */
export function gstSplit(order: Order, sellerState: string | undefined): GstSplit {
  const taxPaise = order.ops?.taxPaise || Math.round(order.taxTotal * 100);
  const taxablePaise = Math.max(0, totalPaise(order) - taxPaise);
  const seller = normState(sellerState);
  if (!seller || !normState(order.shippingState)) return { supply: 'unknown', taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, taxPaise };
  if (normState(order.shippingState) === seller) {
    const cgstPaise = Math.round(taxPaise / 2);
    return { supply: 'intra_state', taxablePaise, cgstPaise, sgstPaise: taxPaise - cgstPaise, igstPaise: 0, taxPaise };
  }
  return { supply: 'inter_state', taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise, taxPaise };
}

// ---------------------------------------------------------------- CSV

/** Quotes a CSV cell; text starting with a formula character is prefixed so spreadsheets do not execute it. */
export function csvCell(value: string | number): string {
  const text = typeof value === 'number' ? String(value) : value;
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const toCsv = (header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number>>): string =>
  [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export const istDate = (ms: number): string => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

const amount = (paise: number): string => (paise / 100).toFixed(2);

export interface ExportOptions {
  /** Seller state name (settings/store.seller.state) used to decide CGST/SGST versus IGST. */
  sellerState?: string;
}

/**
 * Orders with their GST split. Columns carry what finance and the CA need (order number, date,
 * status, payment method, place of supply by state, amounts); no name, email, phone or address.
 */
export function buildOrdersCsv(orders: readonly Order[], { sellerState }: ExportOptions = {}): string {
  const header = [
    'order_number', 'placed_on_ist', 'status', 'payment_method', 'place_of_supply_state', 'supply_type', 'taxable_value',
    'cgst', 'sgst', 'igst', 'total_tax', 'shipping', 'cod_fee', 'discount', 'order_total', 'collected', 'refunded', 'invoice_number',
  ] as const;
  const rows = orders.map(o => {
    const g = gstSplit(o, sellerState);
    return [
      o.orderNumber ?? o.id, istDate(o.placedAt), ORDER_STATUS_LABELS[o.status] ?? o.status, o.ops?.paymentMethod ?? 'prepaid',
      o.shippingState ?? '', g.supply, amount(g.taxablePaise),
      g.supply === 'unknown' ? '' : amount(g.cgstPaise), g.supply === 'unknown' ? '' : amount(g.sgstPaise), g.supply === 'unknown' ? '' : amount(g.igstPaise),
      amount(g.taxPaise), amount(o.ops?.shippingPaise ?? Math.round(o.shippingTotal * 100)), amount(o.ops?.codFeePaise ?? 0),
      amount(o.ops?.discountPaise ?? Math.round(o.discountTotal * 100)), amount(totalPaise(o)), amount(collectedPaise(o)),
      amount(o.ops?.refundedPaise ?? 0), o.ops?.invoiceNumber ?? '',
    ];
  });
  return toCsv(header, rows);
}

/** One row per processed refund recorded on an order. */
export function buildRefundsCsv(orders: readonly Order[]): string {
  const rows = orders.flatMap(o =>
    (o.ops?.refunds ?? []).map(r => [o.orderNumber ?? o.id, r.refundId, r.at ? istDate(r.at) : '', amount(r.amountPaise), o.ops?.invoiceNumber ?? '']),
  );
  return toCsv(['order_number', 'refund_id', 'refunded_on_ist', 'amount', 'invoice_number'], rows);
}

/** COD orders with the cash expected, collected and still outstanding. */
export function buildCodCsv(orders: readonly Order[]): string {
  const rows = orders.filter(o => o.ops?.paymentMethod === 'cod').map(o => {
    const collected = collectedPaise(o);
    const settled = NOT_PAYABLE.includes(o.status) && collected === 0;
    return [
      o.orderNumber ?? o.id, ORDER_STATUS_LABELS[o.status] ?? o.status, o.ops?.deliveredAt ? istDate(o.ops.deliveredAt) : '',
      amount(totalPaise(o)), amount(collected), o.ops?.codCollectedAt ? istDate(o.ops.codCollectedAt) : '',
      amount(settled ? 0 : Math.max(0, totalPaise(o) - collected)),
    ];
  });
  return toCsv(['order_number', 'status', 'delivered_on_ist', 'cod_amount', 'collected', 'collected_on_ist', 'outstanding'], rows);
}

// ---------------------------------------------------------------- refund amount entry

/** Rupee text as typed ("1,250.50") to paise, or null when it is not a positive amount with at most two decimals. */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const paise = Math.round(Number(cleaned) * 100);
  return paise > 0 ? paise : null;
}

/** Why a refund amount cannot be submitted, or null when it is within the ceiling. The server re-checks. */
export function refundAmountError(input: string, ceilingPaise: number): string | null {
  const paise = parseRupeesToPaise(input);
  if (paise === null) return 'Enter an amount in rupees, with at most two decimals.';
  if (ceilingPaise <= 0) return 'Nothing is left to refund on this order.';
  if (paise > ceilingPaise) return `The most you can refund now is ${formatInr(ceilingPaise)}.`;
  return null;
}

/** Start and end (epoch ms) of the IST calendar days `fromDate`..`toDate` (YYYY-MM-DD, inclusive). */
export function istRange(fromDate: string, toDate: string): { from: number; to: number } | null {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(fromDate) || !pattern.test(toDate)) return null;
  const from = Date.parse(`${fromDate}T00:00:00Z`) - IST_OFFSET_MS;
  const to = Date.parse(`${toDate}T23:59:59.999Z`) - IST_OFFSET_MS;
  return Number.isNaN(from) || Number.isNaN(to) || to < from ? null : { from, to };
}
