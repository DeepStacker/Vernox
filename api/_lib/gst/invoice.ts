/**
 * GST tax invoices and credit notes.
 *
 * Timing (time of supply for goods, CGST Act s.12 / s.31): the tax invoice is
 * issued when the goods are removed for delivery — in this store, when the
 * shipment is created (CREATE_SHIPMENT). That is the same for prepaid and COD
 * orders; the invoice must travel with the goods, so it cannot wait for COD
 * delivery. A prepaid order cancelled before dispatch has no invoice, so its
 * refund needs no credit note (GST on advances for goods is exempt).
 *
 * Amounts are the order's frozen paise values (prices are GST-exclusive; tax is
 * added on top, stated on the document). Intra-state supply (seller state code ==
 * delivery state code) splits each line's GST into CGST + SGST (SGST gets the odd
 * paisa); inter-state supply charges IGST.
 *
 * Records are immutable: `invoices/{orderId}` (one per order) and
 * `credit_notes/{refundId}` (one per refund), both server-only.
 */
import { isPlaceholderSeller } from '../../../src/types/settings';
import { configError } from '../errors';
import type { OrderDoc } from '../orders';
import { allocateProRata } from '../pricing';
import type { SellerDetails } from '../storeConfig';
import { GSTIN_PATTERN } from '../storeConfig';
import type { StoreTransaction } from '../store';
import { commitNumber, reserveNumber, type NumberReservation } from './numbering';
import { gstStateCode } from './stateCodes';

export type SupplyType = 'intra_state' | 'inter_state';

export interface TaxDocumentLine {
  description: string;
  hsnCode: string;
  quantity: number;
  unitPricePaise: number;
  /** Value before discount (unit × quantity, or the charge amount). */
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  gstRateBps: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface TaxDocumentTotals {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  totalPaise: number;
}

export interface TaxDocument {
  id: string;
  type: 'invoice' | 'credit_note';
  number: string;
  financialYear: string;
  orderId: string;
  orderNumber: string;
  issuedAt: number;
  seller: SellerDetails;
  buyer: { name: string; email: string; address: string; city: string; state: string; stateCode: string | null; pincode: string };
  placeOfSupply: { state: string; stateCode: string | null };
  supplyType: SupplyType;
  lines: TaxDocumentLine[];
  totals: TaxDocumentTotals;
  /** Prices are GST-exclusive; GST is shown separately and added to reach the total. */
  taxInclusive: false;
  reverseCharge: false;
  paymentMethod: OrderDoc['paymentMethod'];
  /** Issued under placeholder seller details: not a valid tax invoice (see PLACEHOLDER_GSTIN). */
  specimen?: boolean;
  /** Credit notes only. */
  againstInvoice?: { id: string; number: string } | null;
  refundId?: string | null;
  reason?: string | null;
}

/**
 * Codes printed on charge lines. They are taxed at the goods' rate (composite
 * supply); the codes themselves are informational — the owner's CA should confirm
 * (SAC 996812 courier services, 999799 other services).
 */
const SHIPPING_SAC = '996812';
const COD_FEE_SAC = '999799';

function split(taxPaise: number, supplyType: SupplyType) {
  if (supplyType === 'inter_state') return { cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise };
  const cgstPaise = Math.floor(taxPaise / 2);
  return { cgstPaise, sgstPaise: taxPaise - cgstPaise, igstPaise: 0 };
}

function line(params: Omit<TaxDocumentLine, 'cgstPaise' | 'sgstPaise' | 'igstPaise' | 'totalPaise'> & { taxPaise: number }, supplyType: SupplyType): TaxDocumentLine {
  const { taxPaise, ...rest } = params;
  return { ...rest, ...split(taxPaise, supplyType), totalPaise: params.taxablePaise + taxPaise };
}

const taxOf = (l: TaxDocumentLine) => l.cgstPaise + l.sgstPaise + l.igstPaise;

function totalsOf(lines: TaxDocumentLine[]): TaxDocumentTotals {
  const sum = (pick: (l: TaxDocumentLine) => number) => lines.reduce((a, l) => a + pick(l), 0);
  return {
    taxablePaise: sum(l => l.taxablePaise),
    cgstPaise: sum(l => l.cgstPaise),
    sgstPaise: sum(l => l.sgstPaise),
    igstPaise: sum(l => l.igstPaise),
    taxPaise: sum(taxOf),
    totalPaise: sum(l => l.totalPaise),
  };
}

export function supplyTypeFor(seller: SellerDetails, buyerStateCode: string | null): SupplyType {
  return buyerStateCode !== null && buyerStateCode === seller.stateCode ? 'intra_state' : 'inter_state';
}

/** Missing seller details make every invoice invalid, so issuing fails loudly instead. */
export function assertSellerConfigured(seller: SellerDetails) {
  const missing = (['legalName', 'gstin', 'address', 'state', 'stateCode', 'pincode'] as const).filter(k => !seller[k]);
  if (missing.length > 0) throw configError(`settings/store.seller is missing ${missing.join(', ')}; GST invoices cannot be issued`);
  if (!GSTIN_PATTERN.test(seller.gstin)) throw configError('settings/store.seller.gstin is not a valid GSTIN');
  if (seller.gstin.slice(0, 2) !== seller.stateCode) throw configError('settings/store.seller.stateCode does not match the GSTIN');
}

/**
 * Per-line tax of an order. Orders created since Phase 2 store it on each item and
 * in amounts.taxBreakdown; older orders (single rate, GST on goods only) are
 * reconstructed with the same allocation rules.
 */
function orderTaxLines(order: OrderDoc, supplyType: SupplyType): TaxDocumentLine[] {
  const a = order.amounts;
  const legacy = order.items.some(i => typeof i.taxablePaise !== 'number');
  const discounts = legacy ? allocateProRata(a.discountPaise, order.items.map(i => i.lineTotalPaise)) : [];
  const items = order.items.map((item, idx) => {
    const discountPaise = legacy ? discounts[idx] : item.discountPaise;
    const taxablePaise = legacy ? item.lineTotalPaise - discountPaise : item.taxablePaise;
    const gstRateBps = legacy ? a.gstRateBps : item.gstRateBps;
    const taxPaise = legacy ? Math.round((taxablePaise * gstRateBps) / 10_000) : item.taxPaise;
    return line(
      {
        description: [item.name, item.sizeLabel, item.finish].filter(Boolean).join(' · '),
        hsnCode: item.hsnCode ?? '830629',
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
        grossPaise: item.lineTotalPaise,
        discountPaise,
        taxablePaise,
        gstRateBps,
        taxPaise,
      },
      supplyType,
    );
  });
  if (legacy) {
    // Phase 1 rounded GST once on the whole order; put any rounding difference on the first line.
    const drift = a.taxPaise - items.reduce((s, l) => s + taxOf(l), 0);
    if (drift !== 0 && items[0]) {
      const first = items[0];
      items[0] = line({ ...first, taxPaise: taxOf(first) + drift }, supplyType);
    }
    if (a.shippingPaise > 0) {
      items.push(line({ description: 'Shipping', hsnCode: SHIPPING_SAC, quantity: 1, unitPricePaise: a.shippingPaise, grossPaise: a.shippingPaise, discountPaise: 0, taxablePaise: a.shippingPaise, gstRateBps: 0, taxPaise: 0 }, supplyType));
    }
    return items;
  }
  for (const charge of a.taxBreakdown.charges) {
    items.push(
      line(
        {
          description: charge.kind === 'shipping' ? 'Shipping and handling' : 'Cash on delivery fee',
          hsnCode: charge.kind === 'shipping' ? SHIPPING_SAC : COD_FEE_SAC,
          quantity: 1,
          unitPricePaise: charge.taxablePaise,
          grossPaise: charge.taxablePaise,
          discountPaise: 0,
          taxablePaise: charge.taxablePaise,
          gstRateBps: charge.gstRateBps,
          taxPaise: charge.taxPaise,
        },
        supplyType,
      ),
    );
  }
  return items;
}

function buyerOf(order: OrderDoc) {
  const c = order.customer;
  const stateCode = gstStateCode(c.state);
  return {
    buyer: { name: c.name, email: order.email, address: c.address, city: c.city, state: c.state, stateCode, pincode: c.pincode },
    placeOfSupply: { state: c.state, stateCode },
  };
}

export function buildInvoice(order: OrderDoc, seller: SellerDetails, reservation: NumberReservation, now: number): TaxDocument {
  const { buyer, placeOfSupply } = buyerOf(order);
  const supplyType = supplyTypeFor(seller, placeOfSupply.stateCode);
  const lines = orderTaxLines(order, supplyType);
  const totals = totalsOf(lines);
  if (totals.totalPaise !== order.amounts.totalPaise) {
    // Never issue an invoice that disagrees with what the customer was charged.
    throw new Error(`invoice total ${totals.totalPaise} != order total ${order.amounts.totalPaise} for ${order.id}`);
  }
  return {
    id: order.id,
    type: 'invoice',
    number: reservation.number,
    financialYear: reservation.fy,
    orderId: order.id,
    orderNumber: order.orderNumber,
    issuedAt: now,
    seller: { ...seller },
    buyer,
    placeOfSupply,
    supplyType,
    lines,
    totals,
    taxInclusive: false,
    reverseCharge: false,
    paymentMethod: order.paymentMethod ?? 'prepaid',
    ...(reservation.series === 'specimen_invoice' ? { specimen: true } : {}),
    againstInvoice: null,
    refundId: null,
    reason: null,
  };
}

/**
 * Credit note for `amountPaise` (GST-inclusive) against an invoice. The amount is
 * spread over the invoice lines pro rata to their totals; within a line the
 * taxable/GST proportion of the original line is kept, so a full credit note
 * mirrors the invoice exactly.
 */
export function buildCreditNote(params: {
  invoice: TaxDocument;
  refundId: string;
  amountPaise: number;
  reason: string;
  reservation: NumberReservation;
  now: number;
}): TaxDocument {
  const { invoice, amountPaise } = params;
  if (amountPaise <= 0 || amountPaise > invoice.totals.totalPaise) {
    throw new Error(`credit note amount ${amountPaise} outside invoice total ${invoice.totals.totalPaise}`);
  }
  const shares = allocateProRata(amountPaise, invoice.lines.map(l => l.totalPaise));
  const lines = invoice.lines
    .map((l, idx) => {
      const gross = shares[idx];
      if (gross === 0) return null;
      const full = gross === l.totalPaise;
      const taxablePaise = full ? l.taxablePaise : Math.round((gross * l.taxablePaise) / l.totalPaise);
      return line(
        {
          description: l.description,
          hsnCode: l.hsnCode,
          quantity: full ? l.quantity : 1,
          unitPricePaise: full ? l.unitPricePaise : taxablePaise,
          grossPaise: full ? l.grossPaise : taxablePaise,
          discountPaise: full ? l.discountPaise : 0,
          taxablePaise,
          gstRateBps: l.gstRateBps,
          taxPaise: gross - taxablePaise,
        },
        invoice.supplyType,
      );
    })
    .filter((l): l is TaxDocumentLine => l !== null);
  return {
    ...invoice,
    id: params.refundId,
    type: 'credit_note',
    number: params.reservation.number,
    financialYear: params.reservation.fy,
    issuedAt: params.now,
    lines,
    totals: totalsOf(lines),
    againstInvoice: { id: invoice.id, number: invoice.number },
    refundId: params.refundId,
    reason: params.reason.slice(0, 300),
  };
}

export const invoicePath = (orderId: string) => `invoices/${orderId}`;
export const creditNotePath = (refundId: string) => `credit_notes/${refundId.replace(/[^A-Za-z0-9_-]/g, '')}`;

export interface InvoicePlan {
  existing: TaxDocument | null;
  reservation: NumberReservation | null;
}

/** Read phase for issuing an order's invoice (idempotent: an existing invoice is reused). */
export async function planInvoice(tx: StoreTransaction, order: OrderDoc, seller: SellerDetails, now: number): Promise<InvoicePlan> {
  const existing = (await tx.get(invoicePath(order.id))) as unknown as TaxDocument | null;
  if (existing) return { existing, reservation: null };
  if (order.paymentMethod === 'replacement') return { existing: null, reservation: null }; // no consideration: delivery challan, not an invoice
  assertSellerConfigured(seller);
  return { existing: null, reservation: await reserveNumber(tx, isPlaceholderSeller(seller) ? 'specimen_invoice' : 'invoice', now) };
}

/** Write phase. Returns the order fields to set (`invoiceId`, `invoiceNumber`), or {} when none is issued. */
export function applyInvoice(tx: StoreTransaction, plan: InvoicePlan, order: OrderDoc, seller: SellerDetails, now: number) {
  if (plan.existing) return { invoiceId: plan.existing.id, invoiceNumber: plan.existing.number };
  if (!plan.reservation) return {};
  const invoice = buildInvoice(order, seller, plan.reservation, now);
  tx.create(invoicePath(order.id), invoice as unknown as Record<string, unknown>);
  commitNumber(tx, plan.reservation, now);
  return { invoiceId: invoice.id, invoiceNumber: invoice.number };
}

export interface CreditNotePlan {
  invoice: TaxDocument | null;
  existing: boolean;
  reservation: NumberReservation | null;
}

/** Read phase for a refund's credit note; no invoice (refund before dispatch) means no credit note. */
export async function planCreditNote(tx: StoreTransaction, orderId: string, refundId: string, now: number): Promise<CreditNotePlan> {
  const invoice = (await tx.get(invoicePath(orderId))) as unknown as TaxDocument | null;
  if (!invoice) return { invoice: null, existing: false, reservation: null };
  if (await tx.get(creditNotePath(refundId))) return { invoice, existing: true, reservation: null };
  return { invoice, existing: false, reservation: await reserveNumber(tx, invoice.specimen ? 'specimen_credit_note' : 'credit_note', now) };
}

export function applyCreditNote(tx: StoreTransaction, plan: CreditNotePlan, params: { refundId: string; amountPaise: number; reason: string; now: number }) {
  if (!plan.invoice || plan.existing || !plan.reservation) return null;
  const amountPaise = Math.min(params.amountPaise, plan.invoice.totals.totalPaise);
  const note = buildCreditNote({ invoice: plan.invoice, refundId: params.refundId, amountPaise, reason: params.reason, reservation: plan.reservation, now: params.now });
  tx.create(creditNotePath(params.refundId), note as unknown as Record<string, unknown>);
  commitNumber(tx, plan.reservation, params.now);
  return note;
}
