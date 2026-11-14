/**
 * Thermal receipt (58 / 80 mm) for any order: a pure mapping from the order, the seller settings and the
 * invoice summary to the lines the printable component renders. Money is read from the order (paise written by
 * the server) and the GST split comes from finance.ts; nothing is recalculated here.
 */
import { finishName } from '@/lib/catalog';
import type { OrderDocuments } from '@/lib/data/orderOps';
import type { Order, StoreConfig } from '@/types/store';
import type { OfflinePaymentMode } from '@/types/staffOrders';
import { collectedPaise, formatInr, gstSplit, NOT_PAYABLE, totalPaise } from './finance';

export type ReceiptWidth = '80' | '58';

const OFFLINE_LABELS: Record<OfflinePaymentMode, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer' };

export interface ReceiptRow { label: string; value: string; strong?: boolean }

export interface Receipt {
  seller: { name: string; addressLines: string[]; gstin: string | null; phone: string | null };
  /** "Tax invoice" when the order has an invoice, otherwise "Order receipt". */
  title: string;
  invoiceNumber: string | null;
  orderNumber: string;
  dateText: string;
  customer: { name: string; phone: string } | null;
  lines: Array<{ name: string; detail: string; quantity: number; amount: string }>;
  totals: ReceiptRow[];
  payment: ReceiptRow[];
  footer: string[];
}

export interface ReceiptInput {
  order: Order;
  config: Pick<StoreConfig, 'storeName' | 'seller' | 'supportPhone' | 'workshopAddress' | 'returnWindowDays'> | undefined;
  /** Invoice summary from GET_ORDER_DOCUMENTS; its stored totals are exact, the order-level split can differ by a paisa. */
  invoice?: OrderDocuments['invoice'];
}

/** Keeps only the last four digits ("XXXXXX1234"); a number of four digits or fewer is shown as is. */
export function maskPhone(phone: string | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length <= 4 ? digits : `${'X'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/** "14 Nov 2026, 3:05 pm" in IST, whatever the staff device's time zone. */
export function formatReceiptDate(ms: number): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms));
}

function sellerBlock(config: ReceiptInput['config']): Receipt['seller'] {
  const s = config?.seller ?? {};
  const cityLine = [s.city, s.state, s.pincode].filter(Boolean).join(', ');
  const addressLines = [s.address || config?.workshopAddress, cityLine].filter((l): l is string => Boolean(l));
  return { name: s.tradeName || s.legalName || config?.storeName || 'Vernox', addressLines, gstin: s.gstin || null, phone: s.phone || config?.supportPhone || null };
}

function taxRows(order: Order, sellerState: string | undefined, invoice: ReceiptInput['invoice']): ReceiptRow[] {
  if (invoice) {
    const t = invoice.totals;
    if (invoice.supplyType === 'intra_state') return [{ label: 'CGST', value: formatInr(t.cgstPaise ?? 0) }, { label: 'SGST', value: formatInr(t.sgstPaise ?? 0) }];
    return [{ label: 'IGST', value: formatInr(t.igstPaise ?? 0) }];
  }
  const g = gstSplit(order, sellerState);
  if (g.supply === 'intra_state') return [{ label: 'CGST', value: formatInr(g.cgstPaise) }, { label: 'SGST', value: formatInr(g.sgstPaise) }];
  if (g.supply === 'inter_state') return [{ label: 'IGST', value: formatInr(g.igstPaise) }];
  return [{ label: 'GST', value: formatInr(g.taxPaise) }];
}

function paymentRows(order: Order): ReceiptRow[] {
  const total = totalPaise(order);
  // Partial payments: the order carries the balance still owed; absent means the plain rules below apply.
  const partial = typeof order.balanceDuePaise === 'number';
  const paid = partial ? Math.max(0, total - (order.balanceDuePaise as number)) : collectedPaise(order);
  const rows: ReceiptRow[] = [];
  const offline = order.offlinePayment;
  if (order.payments?.length) {
    for (const p of order.payments) {
      rows.push({ label: `${p.kind === 'advance' ? 'Advance' : 'Balance'} ${OFFLINE_LABELS[p.mode as OfflinePaymentMode] ?? p.mode}`, value: formatInr(p.amountPaise) });
      if (p.reference) rows.push({ label: 'Ref', value: p.reference });
    }
  } else if (offline) {
    rows.push({ label: 'Paid by', value: OFFLINE_LABELS[offline.mode] ?? offline.mode });
    if (offline.reference) rows.push({ label: 'Ref', value: offline.reference });
  } else if (order.ops?.paymentMethod === 'cod') {
    rows.push({ label: 'Payment', value: 'Cash on delivery' });
  } else if (order.ops?.paymentMethod === 'replacement') {
    rows.push({ label: 'Payment', value: 'Replacement (no charge)' });
  } else if (order.ops?.razorpayPaymentId) {
    rows.push({ label: 'Paid by', value: 'Online' }, { label: 'Ref', value: order.ops.razorpayPaymentId });
  } else {
    rows.push({ label: 'Payment', value: 'Not yet paid' });
  }
  // A replacement owes nothing; an order that can no longer be paid shows no balance.
  const owes = order.ops?.paymentMethod !== 'replacement' && !NOT_PAYABLE.includes(order.status);
  rows.push({ label: 'Amount paid', value: formatInr(paid) });
  if (owes && total > paid && (!partial || (order.balanceDuePaise as number) > 0)) rows.push({ label: 'Balance due', value: formatInr(total - paid), strong: true });
  return rows;
}

export function buildReceipt({ order, config, invoice }: ReceiptInput): Receipt {
  const invoiceNumber = invoice?.number ?? order.ops?.invoiceNumber ?? null;
  const ops = order.ops;
  const totals: ReceiptRow[] = [{ label: 'Subtotal', value: formatInr(ops?.subtotalPaise || Math.round(order.subtotal * 100)) }];
  const discount = ops?.discountPaise || Math.round(order.discountTotal * 100);
  if (discount > 0) totals.push({ label: 'Discount', value: `-${formatInr(discount)}` });
  const shipping = ops?.shippingPaise || Math.round(order.shippingTotal * 100);
  if (shipping > 0) totals.push({ label: 'Shipping', value: formatInr(shipping) });
  const codFee = ops?.codFeePaise ?? 0;
  if (codFee > 0) totals.push({ label: 'COD fee', value: formatInr(codFee) });
  totals.push(...taxRows(order, config?.seller?.state, invoice), { label: 'TOTAL', value: formatInr(totalPaise(order)), strong: true });

  const footer = ['Thank you for shopping with us.'];
  if (config?.returnWindowDays) footer.push(`Returns accepted within ${config.returnWindowDays} days of delivery.`);

  return {
    seller: sellerBlock(config),
    title: invoiceNumber ? 'Tax invoice' : 'Order receipt',
    invoiceNumber,
    orderNumber: order.orderNumber ?? order.id,
    dateText: formatReceiptDate(order.placedAt),
    customer: order.customerName || order.phone ? { name: order.customerName ?? '', phone: maskPhone(order.phone) } : null,
    lines: order.items.map(i => ({
      name: i.productName,
      detail: [i.sizeLabel, i.finish && finishName(i.finish)].filter(Boolean).join(' · '),
      quantity: i.quantity,
      amount: formatInr(Math.round(i.lineTotal * 100)),
    })),
    totals,
    payment: paymentRows(order),
    footer,
  };
}
