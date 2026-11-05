// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { couponFromDoc, evaluateCoupon, parseCouponDate } from '../../api/_lib/coupons';
import { priceLines, productFromDoc } from '../../api/_lib/pricing';
import { NOW, PRODUCT_CHEAP, PRODUCT_FRAME, TEST_CONFIG } from './support/serverFixtures';

const products = new Map([
  ['p-01', productFromDoc('p-01', PRODUCT_FRAME)],
  ['p-11', productFromDoc('p-11', PRODUCT_CHEAP)],
]);
// p-01 medium ×2 = ₹538 (frames), p-11 ×1 = ₹89 (geometric) → subtotal ₹627
const lines = priceLines(
  [
    { productId: 'p-01', sizeLabel: 'Medium · 50cm', finish: 'gold', quantity: 2 },
    { productId: 'p-11', finish: 'steel', quantity: 1 },
  ],
  products,
  TEST_CONFIG,
);

const coupon = (overrides: Record<string, unknown> = {}) =>
  couponFromDoc('c1', {
    code: 'save10',
    discountType: 'percentage',
    discountValue: 10,
    isActive: true,
    usedCount: 0,
    ...overrides,
  });

const ctx = { now: NOW, customerUsageCount: 0 };

describe('coupon evaluation', () => {
  it('applies a percentage discount to server-priced lines', () => {
    const result = evaluateCoupon(coupon(), lines, ctx);
    expect(result).toMatchObject({ ok: true, discountPaise: 6_270, eligibleSubtotalPaise: 62_700 });
  });

  it('normalises the code and converts rupee fields to paise', () => {
    const c = coupon({ discountType: 'fixed', discountValue: 50, minOrderValue: 200, maxDiscountLimit: 0 })!;
    expect(c.code).toBe('SAVE10');
    expect(c.discountValue).toBe(5_000);
    expect(c.minOrderPaise).toBe(20_000);
    expect(evaluateCoupon(c, lines, ctx)).toMatchObject({ ok: true, discountPaise: 5_000 });
  });

  it('caps percentage discounts at maxDiscountLimit', () => {
    expect(evaluateCoupon(coupon({ discountValue: 50, maxDiscountLimit: 100 }), lines, ctx)).toMatchObject({ ok: true, discountPaise: 10_000 });
  });

  it('restricts eligibility using server-side categories and product ids', () => {
    expect(evaluateCoupon(coupon({ applicableCategories: ['geometric'] }), lines, ctx)).toMatchObject({ ok: true, discountPaise: 890 });
    expect(evaluateCoupon(coupon({ applicableProductIds: ['p-01'] }), lines, ctx)).toMatchObject({ ok: true, discountPaise: 5_380 });
    expect(evaluateCoupon(coupon({ applicableCategories: ['sculptures'] }), lines, ctx)).toMatchObject({ ok: false, errorCode: 'NO_APPLICABLE_ITEMS' });
  });

  it('rejects unknown, inactive, exhausted and per-customer-exhausted coupons', () => {
    expect(evaluateCoupon(null, lines, ctx)).toMatchObject({ ok: false, errorCode: 'COUPON_NOT_FOUND' });
    expect(evaluateCoupon(coupon({ isActive: false }), lines, ctx)).toMatchObject({ ok: false, errorCode: 'COUPON_INACTIVE' });
    expect(evaluateCoupon(coupon({ maxUsageCount: 5, usedCount: 5 }), lines, ctx)).toMatchObject({ ok: false, errorCode: 'USAGE_LIMIT_EXCEEDED' });
    expect(evaluateCoupon(coupon({ maxUsagePerCustomer: 1 }), lines, { now: NOW, customerUsageCount: 1 })).toMatchObject({
      ok: false,
      errorCode: 'CUSTOMER_LIMIT_EXCEEDED',
    });
  });

  it('enforces the minimum order on the merchandise subtotal', () => {
    expect(evaluateCoupon(coupon({ minOrderValue: 1000 }), lines, ctx)).toMatchObject({ ok: false, errorCode: 'MIN_ORDER_NOT_MET' });
  });

  it('treats YYYY-MM-DD dates as whole days in IST', () => {
    expect(parseCouponDate('2026-11-05', true)).toBe(Date.parse('2026-11-05T23:59:59.999+05:30'));
    expect(evaluateCoupon(coupon({ expiryDate: '2026-11-05' }), lines, ctx).ok).toBe(true);
    expect(evaluateCoupon(coupon({ expiryDate: '2026-11-04' }), lines, ctx)).toMatchObject({ ok: false, errorCode: 'COUPON_EXPIRED' });
    expect(evaluateCoupon(coupon({ startDate: '2026-11-06' }), lines, ctx)).toMatchObject({ ok: false, errorCode: 'COUPON_NOT_STARTED' });
  });

  it('refuses malformed coupon documents', () => {
    expect(coupon({ discountValue: 150 })).toBeNull();
    expect(couponFromDoc('c', { discountType: 'fixed', discountValue: 10 })).toBeNull();
  });
});
