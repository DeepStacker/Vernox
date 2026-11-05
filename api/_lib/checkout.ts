/**
 * Checkout intent: validate → price → reserve stock + create order (one
 * transaction) → create the Razorpay order → attach its id.
 *
 * Idempotency: `idempotency/{key}` is created in the same transaction as the
 * order, so concurrent duplicates cannot both reserve stock. A repeated request
 * with the same key and body returns the original order; a different body is
 * rejected. If Razorpay is unavailable the order is cancelled, stock returned
 * and the key freed (cancelUnstartedCheckout), so a retry starts clean.
 */
import crypto from 'crypto';
import { z } from 'zod';
import { couponFromDoc, couponPath, customerUsagePath, evaluateCoupon, findCouponByCode, normaliseCouponCode } from './coupons';
import { ApiError } from './errors';
import { buildOrderDoc, asOrder, generateOrderNumber, orderPath, pricingPayload, type CustomerDetails, type OrderDoc } from './orders';
import { cancelUnstartedCheckout } from './payments';
import {
  CUSTOM_PRODUCT_ID,
  computeTotals,
  priceLines,
  productFromDoc,
  stockRequirements,
  type CheckoutItemInput,
  type ProductRecord,
} from './pricing';
import type { PaymentGateway } from './razorpay';
import { increment, type DocStore } from './store';
import type { StoreConfig } from './storeConfig';

const MAX_DESIGN_REF_CHARS = 200_000;
const MAX_TOTAL_DESIGN_REF_CHARS = 700_000; // keeps the order document under Firestore's 1 MiB limit
const MIN_PAYABLE_PAISE = 100; // Razorpay minimum order amount (₹1)
const IDEMPOTENCY_TTL_MS = 24 * 3600_000;

const itemSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  sizeLabel: z.string().trim().min(1).max(120).optional(),
  widthMm: z.number().int().positive().max(10_000).optional(),
  heightMm: z.number().int().positive().max(10_000).optional(),
  finish: z.string().trim().min(1).max(64),
  quantity: z.number().int().min(1).max(100),
  customDesignRef: z.string().min(1).max(MAX_DESIGN_REF_CHARS).optional(),
});

const INDIA = new Set(['in', 'india', 'bharat']);

const customerSchema = z
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
    items: z.array(itemSchema).min(1).max(50),
    couponCode: z.string().trim().max(40).optional().transform(v => (v ? v : undefined)),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, 'must be 8-128 characters of [A-Za-z0-9_-]'),
    customer: customerSchema,
  })
  .superRefine((body, ctx) => {
    const total = body.items.reduce((sum, i) => sum + (i.customDesignRef?.length ?? 0), 0);
    if (total > MAX_TOTAL_DESIGN_REF_CHARS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'custom design data is too large' });
    }
  });

export interface CheckoutRequest {
  items: CheckoutItemInput[];
  couponCode?: string;
  idempotencyKey: string;
  customer: CustomerDetails;
}

// Explicit output type: the app tsconfig is non-strict, where z.infer would make every field optional.
export const checkoutRequestSchema = checkoutRequestObject as unknown as z.ZodType<CheckoutRequest, z.ZodTypeDef, unknown>;

export interface CheckoutResponse {
  success: true;
  orderId: string;
  orderNumber: string;
  razorpayOrderId: string;
  keyId: string;
  amount: number;
  currency: 'INR';
  pricing: ReturnType<typeof pricingPayload>;
}

export interface CheckoutDeps {
  store: DocStore;
  gateway: PaymentGateway;
  razorpayKeyId: string;
  config: StoreConfig;
  now?: () => number;
}

function requestHash(req: CheckoutRequest): string {
  const canonical = JSON.stringify({
    items: req.items.map(i => [i.productId, i.sizeLabel ?? null, i.widthMm ?? null, i.heightMm ?? null, i.finish, i.quantity, i.customDesignRef ?? null]),
    coupon: req.couponCode ? normaliseCouponCode(req.couponCode) : null,
    email: req.customer.email,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

const toResponse = (order: OrderDoc, keyId: string): CheckoutResponse => ({
  success: true,
  orderId: order.id,
  orderNumber: order.orderNumber,
  razorpayOrderId: order.razorpayOrderId as string,
  keyId,
  amount: order.amounts.totalPaise,
  currency: 'INR',
  pricing: pricingPayload(order),
});

async function resolveDuplicate(deps: CheckoutDeps, orderId: string): Promise<CheckoutResponse> {
  const order = asOrder(await deps.store.get(orderPath(orderId)));
  if (order?.status === 'Pending_Payment' && order.razorpayOrderId) return toResponse(order, deps.razorpayKeyId);
  if (order?.status === 'Pending_Payment') {
    throw new ApiError(409, 'VALIDATION_ERROR', 'This checkout is still being prepared. Please retry in a few seconds.');
  }
  throw new ApiError(409, 'VALIDATION_ERROR', 'This checkout has already been completed or closed. Start a new checkout.');
}

export async function createCheckoutIntent(
  deps: CheckoutDeps,
  req: CheckoutRequest,
  userId: string | null,
): Promise<CheckoutResponse> {
  const { store, config } = deps;
  const now = (deps.now ?? Date.now)();
  const hash = requestHash(req);
  const idempotencyPath = `idempotency/${req.idempotencyKey}`;

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
    const productDocs = await Promise.all(catalogIds.map(id => tx.get(`products/${id}`)));
    const couponDoc = couponId ? await tx.get(couponPath(couponId)) : null;
    const usageDoc = couponId ? await tx.get(customerUsagePath(couponId, req.customer.email)) : null;

    // ---- price ----
    const products = new Map<string, ProductRecord | null>(catalogIds.map((id, idx) => [id, productFromDoc(id, productDocs[idx])]));
    const lines = priceLines(req.items, products, config);

    let discountPaise = 0;
    let coupon: OrderDoc['coupon'] = null;
    if (couponId) {
      const evaluation = evaluateCoupon(couponFromDoc(couponId, couponDoc), lines, {
        now,
        customerUsageCount: typeof usageDoc?.count === 'number' ? usageDoc.count : 0,
      });
      if ('errorCode' in evaluation) throw new ApiError(400, 'INVALID_COUPON', evaluation.message);
      discountPaise = evaluation.discountPaise;
      coupon = { id: evaluation.coupon.id, code: evaluation.coupon.code, discountPaise };
    }
    const totals = computeTotals(lines, discountPaise, config);
    if (totals.totalPaise < MIN_PAYABLE_PAISE) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'The order total is below the minimum payable amount.');
    }

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

    // ---- writes ----
    for (const r of reserved) tx.update(`products/${r.productId}`, { stock: increment(-r.quantity), updatedAt: now });
    const order = buildOrderDoc({
      id: orderId,
      orderNumber,
      userId,
      customer: req.customer,
      lines,
      totals,
      coupon,
      reservedItems: reserved,
      idempotencyKey: req.idempotencyKey,
      reservationTtlMs: config.reservationTtlMs,
      now,
    });
    tx.create(orderPath(orderId), order as unknown as Record<string, unknown>);
    tx.create(idempotencyPath, { orderId, requestHash: hash, createdAt: now, expiresAt: new Date(now + IDEMPOTENCY_TTL_MS) });
    return { order };
  });

  if ('duplicateOf' in result) {
    if (result.existingHash !== hash) {
      throw new ApiError(409, 'VALIDATION_ERROR', 'This idempotency key was already used for a different checkout.');
    }
    return resolveDuplicate(deps, result.duplicateOf);
  }

  const { order } = result;
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
  const catalogIds = [...new Set(req.items.filter(i => i.productId !== CUSTOM_PRODUCT_ID).map(i => i.productId))];
  const [coupon, productDocs] = await Promise.all([
    findCouponByCode(store, req.code),
    Promise.all(catalogIds.map(id => store.get(`products/${id}`))),
  ]);
  const products = new Map<string, ProductRecord | null>(catalogIds.map((id, idx) => [id, productFromDoc(id, productDocs[idx])]));
  const lines = priceLines(req.items, products, config);

  let customerUsageCount: number | null = null;
  if (coupon && req.customerEmail) {
    const usage = await store.get(customerUsagePath(coupon.id, req.customerEmail));
    customerUsageCount = typeof usage?.count === 'number' ? usage.count : 0;
  }
  const evaluation = evaluateCoupon(coupon, lines, { now, customerUsageCount });
  const totals = computeTotals(lines, 'discountPaise' in evaluation ? evaluation.discountPaise : 0, config);
  return { evaluation, totals };
}
