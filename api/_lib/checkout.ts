/**
 * Checkout intent: validate → price → reserve stock + create order (one
 * transaction) → create the Razorpay order → attach its id.
 *
 * Idempotency: `idempotency/{key}` is created in the same transaction as the
 * order, so concurrent duplicates cannot both reserve stock. A repeated request
 * with the same key and body returns the original order; a different body is
 * rejected. If Razorpay is unavailable the order is cancelled, stock returned
 * and the key freed (cancelUnstartedCheckout), so a retry starts clean.
 *
 * Cash on delivery (`paymentMethod: 'cod'`, see cod.ts): eligibility is checked
 * (no custom items, COD-serviceable PIN, order value limit, open COD orders per
 * mobile), the COD fee is added as its own taxable line, and the order is created
 * as `Confirmed_COD` with stock committed and the coupon redeemed in the same
 * transaction. No Razorpay order is created.
 *
 * Staff-entered orders (`options.staff`, api/_lib/staffOrders.ts) use the same path, so pricing, GST, stock and
 * coupons cannot drift from the storefront: an `offlinePayment` order is created already `Paid` (stock
 * committed, coupon redeemed, customer notified), and with `handover` it is also `Delivered` with its GST
 * invoice issued in the same transaction (a counter sale). A prepaid staff order without an offline payment
 * gets a Razorpay payment link instead of a checkout order, and holds stock for as long as the link lives.
 */
import crypto from 'crypto';
import { z } from 'zod';
import { ORDER_LIMITS } from '../../src/lib/pricing/orderLimits';
import { assertCodOrderAllowed, codRejection, countOpenCodOrders } from './cod';
import { COD_UNVERIFIED_FLAG, consumeVerification, verificationTokenSchema } from './codOtp';
import {
  couponFromDoc,
  couponPath,
  customerUsagePath,
  evaluateCoupon,
  findCouponByCode,
  normaliseCouponCode,
  writeCouponRedemption,
} from './coupons';
import type { ConsultationPurchase } from './consultations';
import { ApiError } from './errors';
import { paiseToRupees } from './money';
import { applyInvoice, planInvoice } from './gst/invoice';
import { recordWhatsAppOptIn } from './whatsapp';
import { enqueueNotification, payloadFromOrder, planNotification } from './notifications/outbox';
import {
  buildOrderDoc,
  asOrder,
  generateOrderNumber,
  orderPath,
  phoneKey,
  pricingPayload,
  type CustomerDetails,
  type OfflinePayment,
  type OrderDoc,
  type OrderSource,
  type PaymentMethod,
} from './orders';
import { cancelUnstartedCheckout } from './payments';
import {
  CUSTOM_PRODUCT_ID,
  computeTotals,
  priceConsultationLine,
  priceLines,
  productFromDoc,
  stockRequirements,
  type CheckoutItemInput,
  type ProductRecord,
} from './pricing';
import type { PaymentGateway, PaymentLinkGateway } from './razorpay';
import { PAYMENT_LINK_TTL_HOURS } from '../../src/types/staffOrders';
import { itemLeadTimeDays, serviceabilityFor } from './shipping';
import type { ShippingProvider } from './shipping/types';
import { increment, type DocStore } from './store';
import type { StoreConfig } from './storeConfig';

const MAX_DESIGN_REF_CHARS = ORDER_LIMITS.maxDesignRefChars;
const MAX_TOTAL_DESIGN_REF_CHARS = ORDER_LIMITS.maxTotalDesignRefChars;
const MIN_PAYABLE_PAISE = 100; // Razorpay minimum order amount (₹1)
const IDEMPOTENCY_TTL_MS = 24 * 3600_000;

export const itemSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  sizeLabel: z.string().trim().min(1).max(120).optional(),
  widthMm: z.number().int().positive().max(10_000).optional(),
  heightMm: z.number().int().positive().max(10_000).optional(),
  finish: z.string().trim().min(1).max(64),
  quantity: z.number().int().min(1).max(ORDER_LIMITS.maxQuantityPerLine),
  customDesignRef: z.string().min(1).max(MAX_DESIGN_REF_CHARS).optional(),
});

const INDIA = new Set(['in', 'india', 'bharat']);

export const customerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{8,15}$/, 'must be a valid phone number'),
    address: z.string().trim().min(1).max(500),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    pincode: z.string().trim().regex(/^[A-Za-z0-9 -]{3,12}$/, 'must be a valid postal code'),
    country: z.string().trim().min(2).max(56),
  })
  .superRefine((c, ctx) => {
    if (INDIA.has(c.country.toLowerCase()) && !/^[1-9][0-9]{5}$/.test(c.pincode)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pincode'], message: 'must be a 6-digit Indian PIN code' });
    }
  });

const checkoutRequestObject = z
  .object({
    items: z.array(itemSchema).min(1).max(ORDER_LIMITS.maxLines),
    couponCode: z.string().trim().max(40).optional().transform(v => (v ? v : undefined)),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, 'must be 8-128 characters of [A-Za-z0-9_-]'),
    customer: customerSchema,
    paymentMethod: z.enum(['prepaid', 'cod']).default('prepaid'),
    /** The customer ticked "Send me order updates on WhatsApp" (Meta requires opt-in). */
    whatsappOptIn: z.boolean().optional(),
    /** From COD_OTP_VERIFY; required for COD when SMS confirmation is enabled (see codOtp.ts). */
    codVerificationToken: verificationTokenSchema.optional(),
  })
  .superRefine((body, ctx) => {
    const total = body.items.reduce((sum, i) => sum + (i.customDesignRef?.length ?? 0), 0);
    if (total > MAX_TOTAL_DESIGN_REF_CHARS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'custom design data is too large' });
    }
    if (body.paymentMethod === 'cod' && !INDIA.has(body.customer.country.toLowerCase())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paymentMethod'], message: 'cash on delivery is available only in India' });
    }
  });

export interface CheckoutRequest {
  items: CheckoutItemInput[];
  couponCode?: string;
  idempotencyKey: string;
  customer: CustomerDetails;
  paymentMethod: Exclude<PaymentMethod, 'replacement'>;
  whatsappOptIn?: boolean;
  codVerificationToken?: string;
}

// Explicit output type: the app tsconfig is non-strict, where z.infer would make every field optional.
export const checkoutRequestSchema = checkoutRequestObject as unknown as z.ZodType<CheckoutRequest, z.ZodTypeDef, unknown>;

export interface PrepaidCheckoutResponse {
  success: true;
  orderId: string;
  orderNumber: string;
  paymentMethod: 'prepaid';
  razorpayOrderId: string;
  keyId: string;
  amount: number;
  currency: 'INR';
  pricing: ReturnType<typeof pricingPayload>;
}

export interface CodCheckoutResponse {
  success: true;
  orderId: string;
  orderNumber: string;
  paymentMethod: 'cod';
  pricing: ReturnType<typeof pricingPayload>;
}

/** Every staff-entered order answers with this shape, whatever the payment. */
export interface StaffCheckoutResponse {
  success: true;
  staff: true;
  orderId: string;
  orderNumber: string;
  status: OrderDoc['status'];
  paymentMethod: PaymentMethod;
  paymentLink: { id: string; url: string; expiresAt: number } | null;
  invoiceNumber: string | null;
  pricing: ReturnType<typeof pricingPayload>;
  /** Advance orders: the advance (₹) and what is still owed once it is paid (₹). Null when paid in full. */
  advance: number | null;
  balanceDue: number | null;
}

export type CheckoutResponse = PrepaidCheckoutResponse | CodCheckoutResponse | StaffCheckoutResponse;

export interface CheckoutDeps {
  store: DocStore;
  /** Razorpay; not used for COD orders. */
  gateway: PaymentGateway;
  razorpayKeyId: string;
  config: StoreConfig;
  /** Needed for COD PIN eligibility. */
  shipping?: ShippingProvider;
  /** Customer COD orders need a verification token (codOtpEnabled in codOtp.ts); otherwise they are flagged COD_UNVERIFIED. */
  codOtpEnabled?: boolean;
  /** Needed for staff orders paid by payment link. */
  paymentLinks?: PaymentLinkGateway;
  now?: () => number;
}

function requestHash(req: CheckoutRequest, consultation: ConsultationPurchase | null, staff: StaffCheckout | null): string {
  const canonical = JSON.stringify({
    ...(consultation ? { consultationSpace: consultation.spaceId } : {}),
    items: req.items.map(i => [i.productId, i.sizeLabel ?? null, i.widthMm ?? null, i.heightMm ?? null, i.finish, i.quantity, i.customDesignRef ?? null]),
    coupon: req.couponCode ? normaliseCouponCode(req.couponCode) : null,
    email: req.customer.email,
    // Only COD changes the hash, so prepaid hashes are unchanged from Phase 1.
    ...(req.paymentMethod === 'cod' ? { paymentMethod: 'cod' } : {}),
    ...(staff ? { staff: [staff.source.channel, req.customer.phone, staff.offlinePayment?.mode ?? null, staff.offlinePayment?.reference ?? null, Boolean(staff.handover), ...(staff.advancePaise ? [staff.advancePaise] : [])] } : {}),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

const toResponse = (order: OrderDoc, keyId: string): PrepaidCheckoutResponse => ({
  success: true,
  orderId: order.id,
  orderNumber: order.orderNumber,
  paymentMethod: 'prepaid',
  razorpayOrderId: order.razorpayOrderId as string,
  keyId,
  amount: order.amounts.totalPaise,
  currency: 'INR',
  pricing: pricingPayload(order),
});

const toCodResponse = (order: OrderDoc): CodCheckoutResponse => ({
  success: true,
  orderId: order.id,
  orderNumber: order.orderNumber,
  paymentMethod: 'cod',
  pricing: pricingPayload(order),
});

const toStaffResponse = (order: OrderDoc): StaffCheckoutResponse => ({
  success: true,
  staff: true,
  orderId: order.id,
  orderNumber: order.orderNumber,
  status: order.status,
  paymentMethod: order.paymentMethod,
  paymentLink: order.paymentLink ?? null,
  invoiceNumber: order.invoiceNumber ?? null,
  pricing: pricingPayload(order),
  advance: order.advancePaise ? paiseToRupees(order.advancePaise) : null,
  balanceDue: order.advancePaise ? paiseToRupees(order.balanceDuePaise ?? order.amounts.totalPaise - order.advancePaise) : null,
});

async function resolveDuplicate(deps: CheckoutDeps, orderId: string): Promise<CheckoutResponse> {
  const order = asOrder(await deps.store.get(orderPath(orderId)));
  if (order?.source) {
    if (order.status === 'Pending_Payment' && order.paymentMethod === 'prepaid' && !order.paymentLink) {
      throw new ApiError(409, 'VALIDATION_ERROR', 'This order is still being prepared. Please retry in a few seconds.');
    }
    return toStaffResponse(order);
  }
  if (order?.paymentMethod === 'cod') return toCodResponse(order);
  if (order?.status === 'Pending_Payment' && order.razorpayOrderId) return toResponse(order, deps.razorpayKeyId);
  if (order?.status === 'Pending_Payment') {
    throw new ApiError(409, 'VALIDATION_ERROR', 'This checkout is still being prepared. Please retry in a few seconds.');
  }
  throw new ApiError(409, 'VALIDATION_ERROR', 'This checkout has already been completed or closed. Start a new checkout.');
}

export interface CheckoutOptions {
  /**
   * Sells the design consultation instead of `req.items` (which must be empty): one prepaid service
   * line priced from settings, no stock, no shipping, no coupon. Only api/consultation.ts passes it.
   */
  consultation?: ConsultationPurchase;
  /** A staff-entered order (api/_lib/staffOrders.ts); `userId` is then null. */
  staff?: StaffCheckout;
}

export interface StaffCheckout {
  source: OrderSource;
  /** Money already taken in person: the order is created `Paid`. Without it a prepaid order gets a payment link. */
  offlinePayment?: OfflinePayment;
  /** Counter sale: the customer takes the pieces now, so the order is `Delivered` and invoiced at once. */
  handover?: boolean;
  /**
   * Part payment: the amount taken in person (with `offlinePayment`) or asked for by the payment link; must be
   * less than the total. The rest is collected later (api/_lib/orderBalance.ts). Not with `handover`.
   */
  advancePaise?: number;
  /** Staff note saved as the order's first note. */
  note?: string;
}

export async function createCheckoutIntent(
  deps: CheckoutDeps,
  req: CheckoutRequest,
  userId: string | null,
  options: CheckoutOptions = {},
): Promise<CheckoutResponse> {
  const { store, config } = deps;
  const consultation = options.consultation ?? null;
  const staff = options.staff ?? null;
  const now = (deps.now ?? Date.now)();
  const hash = requestHash(req, consultation, staff);
  const idempotencyPath = `idempotency/${req.idempotencyKey}`;
  const cod = req.paymentMethod === 'cod';
  const paidOffline = Boolean(staff?.offlinePayment) && !cod;
  const viaPaymentLink = Boolean(staff) && !cod && !paidOffline;
  /** Confirmed when created: redeem the coupon and notify now (a prepaid order does both when paid). */
  const confirmedAtCreation = cod || paidOffline;
  if (staff?.handover && !paidOffline) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'A counter handover needs the payment taken first.');
  }
  if (staff?.advancePaise !== undefined && (cod || staff.handover || !Number.isInteger(staff.advancePaise) || staff.advancePaise < MIN_PAYABLE_PAISE)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'An advance needs a prepaid order that is not handed over now, of at least the minimum payable amount.');
  }
  if (viaPaymentLink && !deps.paymentLinks) {
    throw new ApiError(500, 'CONFIG_ERROR', 'Payment links are not configured.', 'checkout deps.paymentLinks missing');
  }
  if (consultation && (cod || req.items.length > 0 || req.couponCode)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'A design consultation is prepaid and cannot be combined with items or a coupon.');
  }

  if (cod && !(await store.get(idempotencyPath))) {
    // Cheap checks before the transaction; a retried request with a used key skips them.
    if (!config.cod.enabled) throw codRejection('COD_DISABLED');
    if (req.items.some(i => i.productId === CUSTOM_PRODUCT_ID)) throw codRejection('CUSTOM_ITEM');
    if (!deps.shipping) throw new ApiError(500, 'CONFIG_ERROR', 'Cash on delivery is not configured.', 'checkout deps.shipping missing');
    const lane = await serviceabilityFor(store, deps.shipping, req.customer.pincode, now);
    if (!lane.serviceable || !lane.codAvailable) throw codRejection('PINCODE_NOT_ELIGIBLE', req.customer.pincode);
    const open = await countOpenCodOrders(store, phoneKey(req.customer.phone));
    if (open >= config.cod.maxOpenOrdersPerPhone) throw codRejection('TOO_MANY_OPEN_COD_ORDERS', `${open} open`);
  }

  let couponId: string | null = null;
  if (req.couponCode) {
    couponId = (await findCouponByCode(store, req.couponCode))?.id ?? null;
    if (!couponId) throw new ApiError(400, 'INVALID_COUPON', 'This coupon code is not recognised.');
  }

  // Stable across transaction retries.
  const orderId = store.newId('orders');
  const orderNumber = generateOrderNumber(now);
  const catalogIds = [...new Set(req.items.filter(i => i.productId !== CUSTOM_PRODUCT_ID).map(i => i.productId))];

  const result = await store.runTransaction(async tx => {
    const existing = await tx.get(idempotencyPath);
    if (existing) return { duplicateOf: existing.orderId as string, existingHash: existing.requestHash as string };

    // ---- reads ----
    const customerCod = cod && !staff;
    const spendVerification = customerCod && deps.codOtpEnabled
      ? await consumeVerification(tx, phoneKey(req.customer.phone), req.codVerificationToken, now)
      : null;
    const productDocs = await Promise.all(catalogIds.map(id => tx.get(`products/${id}`)));
    const couponDoc = couponId ? await tx.get(couponPath(couponId)) : null;
    const usageDoc = couponId ? await tx.get(customerUsagePath(couponId, req.customer.email)) : null;

    // ---- price ----
    const products = new Map<string, ProductRecord | null>(catalogIds.map((id, idx) => [id, productFromDoc(id, productDocs[idx])]));
    const lines = consultation ? [priceConsultationLine(config)] : priceLines(req.items, products, config);

    let discountPaise = 0;
    let coupon: OrderDoc['coupon'] = null;
    let couponConsultationId: string | null = null;
    if (couponId) {
      const evaluation = evaluateCoupon(couponFromDoc(couponId, couponDoc), lines, {
        now,
        customerUsageCount: typeof usageDoc?.count === 'number' ? usageDoc.count : 0,
        customerEmail: req.customer.email,
      });
      if ('errorCode' in evaluation) throw new ApiError(400, 'INVALID_COUPON', evaluation.message);
      discountPaise = evaluation.discountPaise;
      coupon = { id: evaluation.coupon.id, code: evaluation.coupon.code, discountPaise };
      couponConsultationId = evaluation.coupon.consultationId;
    }
    const totals = computeTotals(lines, discountPaise, config, { cod, collected: Boolean(staff?.handover) });
    if (totals.totalPaise < MIN_PAYABLE_PAISE) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'The order total is below the minimum payable amount.');
    }
    if (staff?.advancePaise !== undefined && staff.advancePaise >= totals.totalPaise) {
      throw new ApiError(400, 'VALIDATION_ERROR', `The advance must be less than the order total of ₹${paiseToRupees(totals.totalPaise)}. To take the full amount, leave the advance empty.`);
    }
    if (cod) assertCodOrderAllowed(lines, totals.totalPaise, config.cod);
    const leadTimeDays = consultation
      ? undefined
      : Math.max(...lines.map(l => itemLeadTimeDays(l.isCustom, l.isCustom ? null : products.get(l.productId)?.leadTimeDays ?? null, config)));
    const notification = confirmedAtCreation ? await planNotification(tx, orderId, 'order_confirmed') : null;

    // ---- stock ----
    const reserved: Array<{ productId: string; quantity: number }> = [];
    for (const [productId, quantity] of stockRequirements(lines)) {
      const product = products.get(productId)!;
      if (!product.trackInventory) continue;
      if (product.stock < quantity) {
        throw new ApiError(
          409,
          'INSUFFICIENT_STOCK',
          product.stock > 0
            ? `Only ${product.stock} of ${product.name} left in stock.`
            : `${product.name} is out of stock.`,
        );
      }
      reserved.push({ productId, quantity });
    }

    if (staff?.handover && lines.some(l => l.isCustom)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Custom pieces are made to order, so they cannot be handed over at the counter.');
    }
    let order = buildOrderDoc({
      id: orderId,
      orderNumber,
      userId,
      customer: req.customer,
      lines,
      totals,
      coupon,
      reservedItems: reserved,
      idempotencyKey: req.idempotencyKey,
      now,
      paymentMethod: req.paymentMethod,
      leadTimeDays,
      consultation: consultation ?? undefined,
      source: staff?.source,
      offlinePayment: paidOffline ? staff!.offlinePayment : undefined,
      advancePaise: staff?.advancePaise,
      reservationTtlMs: viaPaymentLink ? PAYMENT_LINK_TTL_HOURS * 3600_000 : config.reservationTtlMs,
    });
    if (staff?.note) order = { ...order, notes: staff.note };
    // Nobody confirmed this COD order with the customer: staff must phone before production (CONFIRM_COD_ORDER).
    if (customerCod && !deps.codOtpEnabled) order = { ...order, flags: [...order.flags, COD_UNVERIFIED_FLAG] };
    if (staff?.handover) {
      order = {
        ...order,
        status: 'Delivered',
        statusHistory: [...order.statusHistory, { status: 'Delivered', at: now, by: staff.source.by, note: 'handed over at the counter' }],
        deliveredAt: now,
      };
    }
    // Time of supply for a counter sale is the handover, so the invoice is issued now (read phase here).
    const invoicePlan = staff?.handover ? await planInvoice(tx, order, config.seller, now) : null;

    // ---- writes ----
    spendVerification?.();
    for (const r of reserved) tx.update(`products/${r.productId}`, { stock: increment(-r.quantity), updatedAt: now });
    if (invoicePlan) order = { ...order, ...applyInvoice(tx, invoicePlan, order, config.seller, now) };
    tx.create(orderPath(orderId), order as unknown as Record<string, unknown>);
    if (req.whatsappOptIn) recordWhatsAppOptIn(tx, order.phoneKey, staff ? 'staff' : 'checkout', now);
    tx.create(idempotencyPath, { orderId, requestHash: hash, createdAt: now, expiresAt: new Date(now + IDEMPOTENCY_TTL_MS) });
    if (confirmedAtCreation) {
      if (coupon) {
        writeCouponRedemption(tx, {
          couponId: coupon.id,
          couponCode: coupon.code,
          orderId,
          email: order.email,
          discountPaise: coupon.discountPaise,
          orderTotalPaise: order.amounts.totalPaise,
          now,
          consultationId: couponConsultationId,
        });
      }
      if (notification) enqueueNotification(tx, notification, payloadFromOrder(order), now);
    }
    return { order };
  });

  if ('duplicateOf' in result) {
    if (result.existingHash !== hash) {
      throw new ApiError(409, 'VALIDATION_ERROR', 'This idempotency key was already used for a different checkout.');
    }
    return resolveDuplicate(deps, result.duplicateOf);
  }

  const { order } = result;
  if (staff && !viaPaymentLink) return toStaffResponse(order);
  if (cod) return toCodResponse(order);
  if (viaPaymentLink) return attachPaymentLink(deps, order, now);
  let razorpayOrderId: string;
  try {
    const rzp = await deps.gateway.createOrder({
      amountPaise: order.amounts.totalPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });
    razorpayOrderId = rzp.id;
  } catch (err) {
    try {
      await cancelUnstartedCheckout(store, order.id, now);
    } catch (compensationErr) {
      // The order stays Pending_Payment and the reservation cron expires it.
      console.error(`[checkout] could not cancel order ${order.id} after provider failure`, compensationErr);
    }
    throw err;
  }

  // If this write fails the client never receives a Razorpay id, so no payment can be made;
  // the order expires with its reservation.
  await store.update(orderPath(order.id), { razorpayOrderId, updatedAt: (deps.now ?? Date.now)() });
  return toResponse({ ...order, razorpayOrderId }, deps.razorpayKeyId);
}

async function attachPaymentLink(deps: CheckoutDeps, order: OrderDoc, now: number): Promise<StaffCheckoutResponse> {
  const expiresAt = order.reservationExpiresAt;
  let link: Awaited<ReturnType<PaymentLinkGateway['createPaymentLink']>>;
  try {
    link = await deps.paymentLinks!.createPaymentLink({
      amountPaise: order.advancePaise ?? order.amounts.totalPaise,
      referenceId: order.orderNumber,
      description: order.advancePaise ? `Advance for Vernox order ${order.orderNumber}` : `Vernox order ${order.orderNumber}`,
      customer: { name: order.customer.name, email: order.email || undefined, contact: order.customer.phone || undefined },
      expireBy: Math.floor(expiresAt / 1000),
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });
  } catch (err) {
    try {
      await cancelUnstartedCheckout(deps.store, order.id, now);
    } catch (compensationErr) {
      console.error(`[checkout] could not cancel staff order ${order.id} after payment-link failure`, compensationErr);
    }
    throw err;
  }
  const paymentLink = { id: link.id, url: link.url, expiresAt, ...(order.advancePaise ? { amountPaise: order.advancePaise } : {}) };
  // The link's Razorpay order id (when known) lets payment.captured find this order like a checkout payment.
  await deps.store.update(orderPath(order.id), {
    paymentLink,
    ...(link.razorpayOrderId ? { razorpayOrderId: link.razorpayOrderId } : {}),
    updatedAt: (deps.now ?? Date.now)(),
  });
  return toStaffResponse({ ...order, paymentLink, razorpayOrderId: link.razorpayOrderId ?? order.razorpayOrderId });
}

export interface CouponPreviewRequest {
  code: string;
  items: CheckoutItemInput[];
  customerEmail?: string;
}

export const couponPreviewSchema = z.object({
  code: z.string().trim().min(1).max(40),
  items: z.array(itemSchema).min(1).max(50),
  customerEmail: z.string().trim().toLowerCase().email().max(254).optional(),
}) as unknown as z.ZodType<CouponPreviewRequest, z.ZodTypeDef, unknown>;

/**
 * Coupon preview for /api/validate-coupon: same pricing and coupon engine as
 * checkout, read-only. The result is advisory; checkout re-evaluates it.
 */
export async function previewCoupon(store: DocStore, config: StoreConfig, req: CouponPreviewRequest, now = Date.now()) {
  const { evaluation, totals } = await quoteItems(store, config, req.items, { couponCode: req.code, customerEmail: req.customerEmail, now });
  return { evaluation: evaluation!, totals };
}

/**
 * Read-only price of a basket with the checkout engine: lines, optional coupon and the COD fee. Used by the
 * coupon preview and the staff New order screen; checkout re-prices everything in its transaction.
 */
export async function quoteItems(
  store: DocStore,
  config: StoreConfig,
  items: CheckoutItemInput[],
  opts: { couponCode?: string; customerEmail?: string; cod?: boolean; collected?: boolean; now?: number } = {},
) {
  const catalogIds = [...new Set(items.filter(i => i.productId !== CUSTOM_PRODUCT_ID).map(i => i.productId))];
  const [coupon, productDocs] = await Promise.all([
    opts.couponCode ? findCouponByCode(store, opts.couponCode) : Promise.resolve(null),
    Promise.all(catalogIds.map(id => store.get(`products/${id}`))),
  ]);
  const products = new Map<string, ProductRecord | null>(catalogIds.map((id, idx) => [id, productFromDoc(id, productDocs[idx])]));
  const lines = priceLines(items, products, config);

  let evaluation: ReturnType<typeof evaluateCoupon> | null = null;
  if (opts.couponCode) {
    let customerUsageCount: number | null = null;
    if (coupon && opts.customerEmail) {
      const usage = await store.get(customerUsagePath(coupon.id, opts.customerEmail));
      customerUsageCount = typeof usage?.count === 'number' ? usage.count : 0;
    }
    evaluation = evaluateCoupon(coupon, lines, { now: opts.now ?? Date.now(), customerUsageCount, customerEmail: opts.customerEmail });
  }
  const discountPaise = evaluation && 'discountPaise' in evaluation ? evaluation.discountPaise : 0;
  const totals = computeTotals(lines, discountPaise, config, { cod: opts.cod, collected: opts.collected });
  return { evaluation, totals, lines };
}
