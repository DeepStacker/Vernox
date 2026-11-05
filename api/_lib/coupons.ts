/**
 * Coupon evaluation (pure) and coupon persistence paths.
 *
 * Coupons live only in Firestore `coupons/{id}` (money fields in rupees, as the
 * admin UI edits them). They are evaluated against server-priced lines, so the
 * eligible subtotal and categories can't be influenced by the client.
 *
 * Usage accounting:
 *  - `coupons/{id}.usedCount` — total redemptions.
 *  - `coupons/{id}/customer_usage/{sha256(email)}.count` — per-customer redemptions.
 *  - `coupon_usages/{orderId}` — one redemption record per paid order.
 * All three are written by writeCouponRedemption() in the transaction that
 * confirms the order: when it is marked Paid (payments.ts) or, for cash on
 * delivery, when the COD order is created (checkout.ts).
 */
import crypto from 'crypto';
import type { CouponValidationResult, DiscountType } from '../../src/types/coupon';
import { isNonNegativeFinite, rupeesToPaise } from './money';
import type { PricedLine } from './pricing';
import { increment, type DocData, type DocStore, type StoreTransaction } from './store';

export interface CouponRecord {
  id: string;
  code: string;
  description: string;
  discountType: DiscountType;
  /** Percent for percentage coupons; paise for fixed coupons. */
  discountValue: number;
  maxDiscountPaise: number | null;
  minOrderPaise: number | null;
  maxUsageCount: number | null;
  usedCount: number;
  maxUsagePerCustomer: number | null;
  startsAt: number | null;
  expiresAt: number | null;
  isActive: boolean;
  applicableCategories: string[];
  applicableProductIds: string[];
  /** When set, only this customer (checkout email, lower case) may redeem the coupon. */
  boundEmail: string | null;
  /** Consultation whose fee this coupon credits (api/_lib/consultations.ts); redemption is recorded on it. */
  consultationId: string | null;
}

export type CouponErrorCode = NonNullable<CouponValidationResult['errorCode']>;

export type CouponEvaluation =
  | { ok: true; coupon: CouponRecord; discountPaise: number; eligibleSubtotalPaise: number }
  | { ok: false; errorCode: CouponErrorCode; message: string };

export const normaliseCouponCode = (code: string) => code.trim().toUpperCase();

export const customerKey = (email: string) =>
  crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

export const couponPath = (id: string) => `coupons/${id}`;
export const customerUsagePath = (couponId: string, email: string) =>
  `coupons/${couponId}/customer_usage/${customerKey(email)}`;

const IST_OFFSET = '+05:30';

/** `YYYY-MM-DD` dates are whole days in India Standard Time; full ISO strings are used as-is. */
export function parseCouponDate(value: unknown, endOfDay: boolean): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}${IST_OFFSET}` : v;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

const positiveIntOrNull = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);
const stringList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function couponFromDoc(id: string, data: DocData | null): CouponRecord | null {
  if (!data || typeof data.code !== 'string') return null;
  const discountType: DiscountType = data.discountType === 'fixed' ? 'fixed' : 'percentage';
  if (!isNonNegativeFinite(data.discountValue)) return null;
  if (discountType === 'percentage' && data.discountValue > 100) return null;
  return {
    id,
    code: normaliseCouponCode(data.code),
    description: typeof data.description === 'string' ? data.description : '',
    discountType,
    discountValue: discountType === 'fixed' ? rupeesToPaise(data.discountValue) : data.discountValue,
    maxDiscountPaise: isNonNegativeFinite(data.maxDiscountLimit) && data.maxDiscountLimit > 0 ? rupeesToPaise(data.maxDiscountLimit) : null,
    minOrderPaise: isNonNegativeFinite(data.minOrderValue) && data.minOrderValue > 0 ? rupeesToPaise(data.minOrderValue) : null,
    maxUsageCount: positiveIntOrNull(data.maxUsageCount),
    usedCount: typeof data.usedCount === 'number' ? data.usedCount : 0,
    maxUsagePerCustomer: positiveIntOrNull(data.maxUsagePerCustomer),
    startsAt: parseCouponDate(data.startDate, false),
    expiresAt: parseCouponDate(data.expiryDate, true),
    isActive: data.isActive !== false,
    applicableCategories: stringList(data.applicableCategories),
    applicableProductIds: stringList(data.applicableProductIds),
    boundEmail: typeof data.boundEmail === 'string' && data.boundEmail.trim() ? data.boundEmail.trim().toLowerCase() : null,
    consultationId: typeof data.consultationId === 'string' && data.consultationId ? data.consultationId : null,
  };
}

const reject = (errorCode: CouponErrorCode, message: string): CouponEvaluation => ({ ok: false, errorCode, message });

export interface CouponContext {
  now: number;
  /** Redemptions already recorded for this customer; null when no email is known. */
  customerUsageCount: number | null;
  /** Checkout email, for coupons bound to one customer. A bound coupon is refused when it is missing. */
  customerEmail?: string | null;
}

export function evaluateCoupon(coupon: CouponRecord | null, lines: PricedLine[], ctx: CouponContext): CouponEvaluation {
  if (!coupon) return reject('COUPON_NOT_FOUND', 'This coupon code is not recognised.');
  if (!coupon.isActive) return reject('COUPON_INACTIVE', 'This promotion is currently disabled.');
  if (coupon.boundEmail !== null && coupon.boundEmail !== ctx.customerEmail?.trim().toLowerCase()) {
    return reject('COUPON_NOT_FOR_CUSTOMER', 'This coupon was issued to another customer.');
  }
  if (coupon.startsAt !== null && ctx.now < coupon.startsAt) {
    return reject('COUPON_NOT_STARTED', 'This promotion has not started yet.');
  }
  if (coupon.expiresAt !== null && ctx.now > coupon.expiresAt) {
    return reject('COUPON_EXPIRED', 'This coupon code has expired.');
  }
  if (coupon.maxUsageCount !== null && coupon.usedCount >= coupon.maxUsageCount) {
    return reject('USAGE_LIMIT_EXCEEDED', 'This coupon has reached its redemption limit.');
  }
  if (
    coupon.maxUsagePerCustomer !== null &&
    ctx.customerUsageCount !== null &&
    ctx.customerUsageCount >= coupon.maxUsagePerCustomer
  ) {
    return reject('CUSTOMER_LIMIT_EXCEEDED', 'You have already used this coupon the maximum number of times.');
  }

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotalPaise, 0);
  if (subtotal <= 0) return reject('MIN_ORDER_NOT_MET', 'Your cart is empty.');
  if (coupon.minOrderPaise !== null && subtotal < coupon.minOrderPaise) {
    return reject('MIN_ORDER_NOT_MET', `A minimum order of ₹${coupon.minOrderPaise / 100} is required for this coupon.`);
  }

  const restricted = coupon.applicableCategories.length > 0 || coupon.applicableProductIds.length > 0;
  const eligible = restricted
    ? lines.filter(
        l =>
          (coupon.applicableCategories.length === 0 || (l.category !== null && coupon.applicableCategories.includes(l.category))) &&
          (coupon.applicableProductIds.length === 0 || coupon.applicableProductIds.includes(l.productId)),
      )
    : lines;
  const eligibleSubtotalPaise = eligible.reduce((sum, l) => sum + l.lineTotalPaise, 0);
  if (eligibleSubtotalPaise <= 0) {
    return reject('NO_APPLICABLE_ITEMS', 'This coupon does not apply to any item in your cart.');
  }

  let discountPaise =
    coupon.discountType === 'percentage'
      ? Math.round((eligibleSubtotalPaise * coupon.discountValue) / 100)
      : coupon.discountValue;
  if (coupon.maxDiscountPaise !== null) discountPaise = Math.min(discountPaise, coupon.maxDiscountPaise);
  discountPaise = Math.min(discountPaise, eligibleSubtotalPaise);

  return { ok: true, coupon, discountPaise, eligibleSubtotalPaise };
}

/** Finds a coupon by code (outside any transaction). Codes are unique; SAVE_COUPON enforces it. */
export async function findCouponByCode(store: DocStore, code: string): Promise<CouponRecord | null> {
  const results = await store.query('coupons', {
    where: [{ field: 'code', op: '==', value: normaliseCouponCode(code) }],
    limit: 1,
  });
  return results[0] ? couponFromDoc(results[0].id, results[0].data) : null;
}

/** Records one redemption (write phase of a transaction; the caller has read the coupon and usage docs). */
export function writeCouponRedemption(
  tx: StoreTransaction,
  params: { couponId: string; couponCode: string; orderId: string; email: string; discountPaise: number; orderTotalPaise: number; now: number; consultationId?: string | null },
) {
  const { couponId, email, now } = params;
  if (params.consultationId) {
    tx.update(`consultations/${params.consultationId}`, { creditRedeemedAt: now, creditRedeemedOrderId: params.orderId, updatedAt: now });
  }
  tx.update(couponPath(couponId), { usedCount: increment(1), updatedAt: now });
  tx.set(customerUsagePath(couponId, email), { count: increment(1), customerKey: customerKey(email), updatedAt: now }, { merge: true });
  tx.set(`coupon_usages/${params.orderId}`, {
    couponId,
    couponCode: params.couponCode,
    orderId: params.orderId,
    customerEmail: email,
    discountPaise: params.discountPaise,
    orderTotalPaise: params.orderTotalPaise,
    usedAt: now,
  });
}
