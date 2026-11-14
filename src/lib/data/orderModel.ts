/**
 * Order documents and public order summaries as the browser sees them: pure mapping plus the
 * /api/order-status call. Free of the Firestore SDK so guest pages (order tracking, confirmation) do not
 * load it; the Firestore reads for customers and staff stay in orders.ts.
 */
import { auth } from '@/lib/firebase';
import { normalizeOrderStatus } from '@/lib/orders/orderStateMachine';
import type { Order, OrderItem, OrderTracking, PaymentStatus, PublicOrderSummary, StatusHistoryEntry } from '@/types/store';
import type { OrderOps } from '@/types/orderOps';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- Firestore documents are untyped at the boundary

/** Firestore Timestamp | millis | ISO string -> epoch millis. */
export function toMillis(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function normalizeItem(raw: Raw, index: number): OrderItem {
  const quantity = Number(raw.quantity) || 1;
  const unitPrice = Number(raw.unitPrice) || 0;
  return {
    id: raw.id ?? `${raw.productId ?? 'item'}-${index}`,
    productId: raw.productId ?? '',
    productName: raw.productName ?? raw.name ?? 'Item',
    productSlug: raw.productSlug ?? '',
    shapeId: raw.shapeId ?? '',
    sizeLabel: raw.sizeLabel ?? '',
    widthMm: Number(raw.widthMm) || 0,
    heightMm: Number(raw.heightMm) || 0,
    finish: raw.finish ?? '',
    unitPrice,
    quantity,
    lineTotal: Number(raw.lineTotal) || unitPrice * quantity,
    customDesignThumb: raw.customDesignThumb,
    customDesignRef: raw.customDesignRef,
    userUploadedImage: raw.userUploadedImage,
    uploadedArtworkName: raw.uploadedArtworkName,
  };
}

/**
 * Maps a stored order document to the client shape. Tolerates the server's nested
 * `customer`/`pricing`/`tracking`/`notes` layout and legacy flat fields; legacy statuses
 * are mapped onto the current state machine.
 */
export function normalizeOrder(id: string, raw: Raw): Order {
  const customer: Raw = raw.customer ?? {};
  const pricing: Raw = raw.pricing ?? {};
  const tracking: Raw = raw.tracking ?? {};
  const items = Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [];
  const total = Number(pricing.total ?? raw.total) || 0;
  const history: StatusHistoryEntry[] = Array.isArray(raw.statusHistory)
    ? raw.statusHistory.map((h: Raw) => ({ status: normalizeOrderStatus(h.status), at: toMillis(h.at), by: String(h.by ?? 'system') }))
    : [];

  return {
    id,
    orderNumber: raw.orderNumber,
    userId: raw.userId,
    email: String(raw.email ?? customer.email ?? ''),
    status: normalizeOrderStatus(raw.status),
    paymentStatus: raw.paymentStatus as PaymentStatus | undefined,
    ...(raw.kind === 'service' ? { kind: 'service' as const } : {}),
    ...(raw.hold && typeof raw.hold === 'object' ? { hold: raw.hold as Order['hold'] } : {}),
    placedAt: toMillis(raw.placedAt ?? raw.createdAt),
    updatedAt: toMillis(raw.updatedAt) || undefined,
    items,
    subtotal: Number(pricing.subtotal ?? raw.subtotal) || items.reduce((s, i) => s + i.lineTotal, 0),
    discountTotal: Number(pricing.discount ?? raw.discount ?? raw.discountTotal) || 0,
    shippingTotal: Number(pricing.shipping ?? raw.shipping) || 0,
    taxTotal: Number(pricing.tax ?? raw.tax) || 0,
    total,
    couponCode: raw.couponCode,
    customerName: customer.name ?? raw.customerName ?? raw.shippingName,
    phone: customer.phone ?? raw.phone,
    shippingAddress: customer.address ?? raw.shippingAddress,
    shippingCity: customer.city ?? raw.shippingCity,
    shippingState: customer.state ?? raw.shippingState,
    shippingPincode: customer.pincode ?? raw.shippingPincode ?? raw.shippingZip,
    shippingCountry: customer.country ?? raw.shippingCountry,
    tracking: {
      carrier: tracking.carrier ?? raw.trackingCarrier,
      trackingNumber: tracking.trackingNumber ?? tracking.number ?? raw.trackingNumber,
      url: tracking.url,
      estimatedDelivery: tracking.estimatedDelivery ?? raw.estimatedDelivery,
    },
    assignedTo: raw.assignedTo,
    adminNotes: raw.notes ?? raw.adminNotes,
    statusHistory: history,
    ops: normalizeOps(raw),
    ...(raw.offlinePayment && typeof raw.offlinePayment === 'object'
      ? { offlinePayment: { mode: raw.offlinePayment.mode, reference: String(raw.offlinePayment.reference ?? '') } }
      : {}),
    ...(typeof raw.balanceDuePaise === 'number' ? { balanceDuePaise: raw.balanceDuePaise } : {}),
    ...(Array.isArray(raw.payments)
      ? {
          payments: raw.payments.map((p: Raw) => ({
            id: String(p.id ?? ''), kind: p.kind === 'balance' ? 'balance' as const : 'advance' as const, amountPaise: paise(p.amountPaise),
            mode: String(p.mode ?? ''), reference: String(p.reference ?? ''), at: toMillis(p.at),
          })),
        }
      : {}),
    ...(raw.source && typeof raw.source === 'object' && raw.source.channel ? { channel: raw.source.channel } : {}),
  };
}

const orNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const paise = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Staff view of the server-written money, payment and shipment fields. Absent on pre-Phase-2 orders (defaults apply). */
function normalizeOps(raw: Raw): OrderOps {
  const a: Raw = raw.amounts ?? {};
  const ship: Raw | null = raw.shipment && typeof raw.shipment === 'object' ? raw.shipment : null;
  return {
    paymentMethod: raw.paymentMethod === 'cod' || raw.paymentMethod === 'replacement' ? raw.paymentMethod : 'prepaid',
    razorpayPaymentId: orNull(raw.razorpayPaymentId),
    paidAt: toMillis(raw.paidAt) || null,
    subtotalPaise: paise(a.subtotalPaise),
    discountPaise: paise(a.discountPaise),
    shippingPaise: paise(a.shippingPaise),
    codFeePaise: paise(a.codFeePaise),
    taxPaise: paise(a.taxPaise),
    totalPaise: paise(a.totalPaise),
    refundedPaise: paise(raw.refundedPaise),
    refundPendingPaise: paise(raw.refundPendingPaise),
    refunds: Array.isArray(raw.refunds)
      ? raw.refunds.map((r: Raw) => ({ refundId: String(r.refundId ?? ''), amountPaise: paise(r.amountPaise), at: toMillis(r.at) }))
      : [],
    codCollectedPaise: paise(raw.codCollectedPaise),
    codCollectedAt: toMillis(raw.codCollectedAt) || null,
    deliveredAt: toMillis(raw.deliveredAt) || null,
    invoiceNumber: orNull(raw.invoiceNumber),
    flags: Array.isArray(raw.flags) ? raw.flags.filter((f: unknown): f is string => typeof f === 'string') : [],
    shipment: ship
      ? {
          provider: ship.provider === 'shiprocket' ? 'shiprocket' : 'manual',
          status: ship.status ?? 'created',
          awb: orNull(ship.awb),
          courier: orNull(ship.courier),
          trackingUrl: orNull(ship.trackingUrl),
          labelUrl: orNull(ship.labelUrl),
          manifestUrl: orNull(ship.manifestUrl),
          error: orNull(ship.error),
        }
      : null,
    parentOrderId: orNull(raw.parentOrderId),
  };
}

/**
 * Maps the `order` object of GET /api/order-status to the summary the storefront renders. The
 * server owns canCancel and returnEligibleUntil (state machine and return window), so every
 * customer lookup (guest or signed-in owner) reads them from here.
 */
export function parsePublicOrder(order: Raw, fallbackOrderId = ''): PublicOrderSummary {
  // /api/order-status returns `timeline` and `shipTo`; the other names cover the owner-read shape.
  const timeline = order.timeline ?? order.statusHistory;
  const codFee = Number(order.pricing?.codFee ?? order.codFee);
  return {
    orderId: String(order.orderId ?? order.id ?? fallbackOrderId),
    orderNumber: String(order.orderNumber ?? ''),
    status: normalizeOrderStatus(order.status),
    placedAt: toMillis(order.placedAt) || undefined,
    total: typeof order.total === 'number' ? order.total : order.pricing?.total,
    currency: order.currency,
    items: Array.isArray(order.items)
      ? order.items.map((i: Raw) => ({ productId: i.productId, name: i.name ?? i.productName ?? 'Item', quantity: Number(i.quantity) || 1, lineTotal: i.lineTotal }))
      : undefined,
    tracking: order.tracking as OrderTracking | undefined,
    statusHistory: Array.isArray(timeline)
      ? timeline.map((h: Raw) => ({ status: normalizeOrderStatus(h.status), at: toMillis(h.at) }))
      : undefined,
    shippingCity: order.shipTo?.city ?? order.shippingCity ?? order.city,
    shippingState: order.shippingState ?? order.state,
    paymentMethod: order.paymentMethod === 'cod' || order.paymentMethod === 'replacement' ? order.paymentMethod : 'prepaid',
    invoiceNumber: typeof order.invoiceNumber === 'string' ? order.invoiceNumber : null,
    canCancel: order.canCancel === true,
    returnEligibleUntil: typeof order.returnEligibleUntil === 'number' ? order.returnEligibleUntil : null,
    codFee: Number.isFinite(codFee) ? codFee : 0,
  };
}

/**
 * Order lookup through /api/order-status. Guests identify the order with its email; a signed-in
 * owner's bearer token is sent as well, so the email becomes optional for them.
 */
export async function fetchPublicOrderStatus(orderId: string, email?: string): Promise<PublicOrderSummary> {
  const params = new URLSearchParams({ orderId: orderId.trim() });
  if (email?.trim()) params.set('email', email.trim());
  const user = auth.currentUser;
  const res = await fetch(`/api/order-status?${params.toString()}`, user ? { headers: { Authorization: `Bearer ${await user.getIdToken()}` } } : undefined);
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success === false) {
    const msg = (body?.message as string) || (res.status === 404 ? 'No order matches that number and email.' : `Lookup failed (${res.status}).`);
    throw new Error(msg);
  }
  return parsePublicOrder((body.order ?? body) as Raw, orderId);
}
