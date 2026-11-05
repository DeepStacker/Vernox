/**
 * Coupon preview for the cart. Coupons are not readable by the storefront, so the server
 * evaluates them (POST /api/validate-coupon). The authoritative discount is still computed
 * again by /api/checkout-intent; this is only a display estimate.
 */
import type { CartItem } from '@/lib/cartContext';
import { toCheckoutItems } from '@/lib/checkout/checkoutApi';
import type { CouponValidationResult } from '@/types/coupon';

export async function previewCoupon(params: {
  code: string;
  items: CartItem[];
  email?: string;
}): Promise<CouponValidationResult> {
  const res = await fetch('/api/validate-coupon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: params.code,
      items: toCheckoutItems(params.items),
      customerEmail: params.email || undefined,
    }),
  });
  const data = (await res.json().catch(() => null)) as CouponValidationResult | null;
  if (!data) throw new Error(`Coupon service unavailable (${res.status}).`);
  if (!res.ok && !data.error) throw new Error(`Coupon service unavailable (${res.status}).`);
  return data;
}
