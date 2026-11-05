/**
 * Order document model (`orders/{orderId}`), written only by the server.
 *
 * Money is stored as integer paise in `amounts` and in each item's
 * `unitPricePaise` / `lineTotalPaise`; these are authoritative. The rupee fields
 * (`total`, `subtotal`, ..., `items[].unitPrice`) and flat `shipping*` fields are
 * display copies written once at creation, for the existing admin UI; never read
 * them back for money logic.
 */
import crypto from 'crypto';
import { paiseToRupees } from './money';
import { CUSTOMER_CANCELLABLE_STATUSES, type OrderStatus, type StatusHistoryEntry } from './orderLifecycle';
import type { LineTax, OrderTotals, PricedLine } from './pricing';
import type { DocData } from './store';

export interface CustomerDetails {
  email: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface OrderItemSnapshot {
  productId: string;
  name: string;
  productName: string; // legacy alias of name for the admin UI
  category: string | null;
  sizeLabel: string | null;
  widthMm: number | null;
  heightMm: number | null;
  finish: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  unitPrice: number; // ₹ display copy
  lineTotal: number; // ₹ display copy
  isCustom: boolean;
  customDesignRef: string | null;
  hsnCode: string;
  gstRateBps: number;
  /** Share of the order discount, taxable value and GST of this line (see pricing.computeTotals). */
  discountPaise: number;
  taxablePaise: number;
  taxPaise: number;
}

export type PaymentMethod = 'prepaid' | 'cod' | 'replacement';

export type ReservationStatus = 'held' | 'released' | 'committed' | 'none';

export interface StockReservation {
  status: ReservationStatus;
  items: Array<{ productId: string; quantity: number }>;
}

export interface RefundRecord {
  refundId: string;
  amountPaise: number;
  at: number;
}

/** Courier shipment (api/_lib/shipping/shipments.ts). */
export interface ShipmentRecord {
  provider: 'shiprocket' | 'manual';
  status: 'created' | 'awb_assigned' | 'pickup_scheduled' | 'in_transit' | 'delivered' | 'rto' | 'cancelled';
  shipmentId: string | null;
  providerOrderId: string | null;
  awb: string | null;
  courier: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  manifestUrl: string | null;
  pickupScheduledAt: string | null;
  lastEvent: { status: string; at: string } | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface OrderDoc {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  statusHistory: StatusHistoryEntry[];
  userId: string | null;
  email: string;
  customer: CustomerDetails;
  items: OrderItemSnapshot[];
  currency: 'INR';
  amounts: OrderTotals;
  coupon: { id: string; code: string; discountPaise: number } | null;
  couponCode: string | null;
  stockReservation: StockReservation;
  reservationExpiresAt: number;
  idempotencyKey: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  refunds: RefundRecord[];
  refundedPaise: number;
  /** Refunds requested from the provider but not yet processed (counted against the refund ceiling). */
  refundPendingPaise?: number;
  paymentMethod: PaymentMethod;
  /** Normalised 10-digit mobile number, for COD abuse limits. */
  phoneKey: string;
  /** Production days promised at checkout (max over lines). */
  leadTimeDays?: number;
  shipment?: ShipmentRecord | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  deliveredAt?: number | null;
  /** COD cash collected by the courier on delivery (paise). */
  codCollectedPaise?: number;
  codCollectedAt?: number | null;
  /** Replacement orders point at the order they replace. */
  parentOrderId?: string | null;
  replacementOrderId?: string | null;
  flags: string[];
  placedAt: number;
  createdAt: number;
  updatedAt: number;
  // Display copies (₹) — see file comment.
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  shippingName: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  shippingCountry: string;
  phone: string;
  tracking?: { carrier?: string; trackingNumber?: string; url?: string } | null;
  /** Staff notes: free text plus the structured `#vernox:v1` block (src/lib/orders/orderNotes.ts). Staff-written only. */
  notes?: string;
}

/** Indian mobile as 10 digits (strips +91 / 0 and separators); other formats are returned digits-only. */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 && /^(91|0)/.test(digits) ? digits.slice(-10) : digits;
}

const ORDER_NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human-facing order number, e.g. VX-20261105-7KQ2MZ. Also used as the Razorpay receipt (≤ 40 chars). */
export function generateOrderNumber(now: number): string {
  const date = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10).replace(/-/g, ''); // IST date
  const bytes = crypto.randomBytes(6);
  const suffix = Array.from(bytes, b => ORDER_NUMBER_ALPHABET[b % ORDER_NUMBER_ALPHABET.length]).join('');
  return `VX-${date}-${suffix}`;
}

export function snapshotItem(line: PricedLine, tax: LineTax): OrderItemSnapshot {
  return {
    productId: line.productId,
    name: line.name,
    productName: line.name,
    category: line.category,
    sizeLabel: line.sizeLabel,
    widthMm: line.widthMm,
    heightMm: line.heightMm,
    finish: line.finish,
    quantity: line.quantity,
    unitPricePaise: line.unitPricePaise,
    lineTotalPaise: line.lineTotalPaise,
    unitPrice: paiseToRupees(line.unitPricePaise),
    lineTotal: paiseToRupees(line.lineTotalPaise),
    isCustom: line.isCustom,
    customDesignRef: line.customDesignRef,
    hsnCode: line.hsnCode,
    gstRateBps: tax.gstRateBps,
    discountPaise: tax.discountPaise,
    taxablePaise: tax.taxablePaise,
    taxPaise: tax.taxPaise,
  };
}

export function buildOrderDoc(params: {
  id: string;
  orderNumber: string;
  userId: string | null;
  customer: CustomerDetails;
  lines: PricedLine[];
  totals: OrderTotals;
  coupon: OrderDoc['coupon'];
  reservedItems: StockReservation['items'];
  idempotencyKey: string;
  reservationTtlMs: number;
  now: number;
  paymentMethod?: PaymentMethod;
  leadTimeDays?: number;
  parentOrderId?: string | null;
}): OrderDoc {
  const { customer, totals, now } = params;
  const paymentMethod = params.paymentMethod ?? 'prepaid';
  // Prepaid orders hold stock until paid; COD and replacement orders commit it immediately.
  const status: OrderStatus = paymentMethod === 'prepaid' ? 'Pending_Payment' : paymentMethod === 'cod' ? 'Confirmed_COD' : 'Paid';
  const reservationStatus: ReservationStatus =
    params.reservedItems.length === 0 ? 'none' : paymentMethod === 'prepaid' ? 'held' : 'committed';
  return {
    id: params.id,
    orderNumber: params.orderNumber,
    status,
    statusHistory: [
      { status, at: now, by: paymentMethod === 'replacement' ? 'system' : 'customer', ...(paymentMethod === 'replacement' ? { note: `replacement for ${params.parentOrderId}` } : {}) },
    ],
    userId: params.userId,
    email: customer.email,
    customer,
    items: params.lines.map((line, idx) => snapshotItem(line, totals.taxBreakdown.lines[idx])),
    currency: 'INR',
    amounts: totals,
    coupon: params.coupon,
    couponCode: params.coupon?.code ?? null,
    stockReservation: { status: reservationStatus, items: params.reservedItems },
    reservationExpiresAt: paymentMethod === 'prepaid' ? now + params.reservationTtlMs : 0,
    idempotencyKey: params.idempotencyKey,
    razorpayOrderId: null,
    razorpayPaymentId: null,
    refunds: [],
    refundedPaise: 0,
    refundPendingPaise: 0,
    paymentMethod,
    phoneKey: phoneKey(customer.phone),
    ...(params.leadTimeDays !== undefined ? { leadTimeDays: params.leadTimeDays } : {}),
    shipment: null,
    invoiceId: null,
    invoiceNumber: null,
    deliveredAt: null,
    parentOrderId: params.parentOrderId ?? null,
    flags: [],
    placedAt: now,
    createdAt: now,
    updatedAt: now,
    subtotal: paiseToRupees(totals.subtotalPaise),
    discount: paiseToRupees(totals.discountPaise),
    shipping: paiseToRupees(totals.shippingPaise),
    tax: paiseToRupees(totals.taxPaise),
    total: paiseToRupees(totals.totalPaise),
    shippingName: customer.name,
    shippingAddress: customer.address,
    shippingCity: customer.city,
    shippingState: customer.state,
    shippingZip: customer.pincode,
    shippingCountry: customer.country,
    phone: customer.phone,
  };
}

export const asOrder = (data: DocData | null) => data as unknown as OrderDoc | null;
export const orderPath = (orderId: string) => `orders/${orderId}`;

/** Rupee pricing block returned to the browser (checkout-intent response, order-status). */
export function pricingPayload(order: Pick<OrderDoc, 'amounts' | 'items'>) {
  const a = order.amounts;
  return {
    subtotal: paiseToRupees(a.subtotalPaise),
    discount: paiseToRupees(a.discountPaise),
    shipping: paiseToRupees(a.shippingPaise),
    codFee: paiseToRupees(a.codFeePaise ?? 0),
    tax: paiseToRupees(a.taxPaise),
    total: paiseToRupees(a.totalPaise),
    items: order.items.map(i => ({
      productId: i.productId,
      name: i.name,
      unitPrice: paiseToRupees(i.unitPricePaise),
      quantity: i.quantity,
      lineTotal: paiseToRupees(i.lineTotalPaise),
    })),
  };
}

/** Tracking block for customers: the courier shipment when there is one, else staff-entered tracking. */
function publicTracking(order: OrderDoc) {
  if (order.shipment?.awb) {
    return { carrier: order.shipment.courier, trackingNumber: order.shipment.awb, url: order.shipment.trackingUrl };
  }
  return order.tracking
    ? { carrier: order.tracking.carrier ?? null, trackingNumber: order.tracking.trackingNumber ?? null, url: order.tracking.url ?? null }
    : null;
}

/** Guest-safe order view: no address line, phone, payment ids, design files or internal flags. */
export function publicOrderSummary(order: OrderDoc, returnWindowDays?: number) {
  const { items: pricedItems, ...totals } = pricingPayload(order);
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    placedAt: order.placedAt,
    currency: order.currency,
    couponCode: order.couponCode,
    pricing: totals,
    items: order.items.map((i, idx) => ({
      ...pricedItems[idx],
      sizeLabel: i.sizeLabel,
      finish: i.finish,
      isCustom: i.isCustom,
    })),
    timeline: (order.statusHistory ?? []).map(h => ({ status: h.status, at: h.at })),
    paymentMethod: order.paymentMethod ?? 'prepaid',
    tracking: publicTracking(order),
    invoiceNumber: order.invoiceNumber ?? null,
    canCancel: CUSTOMER_CANCELLABLE_STATUSES.includes(order.status),
    returnEligibleUntil:
      order.status === 'Delivered' && order.deliveredAt && returnWindowDays !== undefined
        ? order.deliveredAt + returnWindowDays * 24 * 3600_000
        : null,
    shipTo: { name: order.customer?.name ?? order.shippingName, city: order.customer?.city ?? order.shippingCity },
  };
}
