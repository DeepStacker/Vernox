/**
 * POST /api/validate-coupon — coupon preview.
 * Body: { code, items: CheckoutItem[], customerEmail? }. Lines are priced on the
 * server (same engine as checkout); client prices, categories and coupon
 * definitions are not accepted. Advisory only: checkout-intent re-evaluates.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { CouponValidationResult } from '../src/types/coupon';
import { couponPreviewSchema, previewCoupon } from './_lib/checkout';
import { sendError } from './_lib/errors';
import { getStore } from './_lib/firebaseAdmin';
import { assertMethod, parseBody } from './_lib/http';
import { paiseToRupees } from './_lib/money';
import { enforceRateLimit, RATE_LIMITS } from './_lib/rateLimit';
import { loadStoreConfig } from './_lib/storeConfig';
import { withStoredIntegrations } from './_lib/withIntegrations';

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['POST']);
    const body = parseBody(req, couponPreviewSchema);
    const store = getStore();
    await enforceRateLimit(store, req, RATE_LIMITS.validateCoupon);

    const { evaluation, totals } = await previewCoupon(store, await loadStoreConfig(store), body);
    const pricing = {
      subtotal: paiseToRupees(totals.subtotalPaise),
      discount: paiseToRupees(totals.discountPaise),
      shipping: paiseToRupees(totals.shippingPaise),
      tax: paiseToRupees(totals.taxPaise),
      total: paiseToRupees(totals.totalPaise),
    };

    const result: CouponValidationResult & { pricing: typeof pricing } = 'coupon' in evaluation
      ? {
          isValid: true,
          couponId: evaluation.coupon.id,
          couponCode: evaluation.coupon.code,
          discountType: evaluation.coupon.discountType,
          discountValue:
            evaluation.coupon.discountType === 'fixed'
              ? paiseToRupees(evaluation.coupon.discountValue)
              : evaluation.coupon.discountValue,
          discountAmount: paiseToRupees(evaluation.discountPaise),
          description: evaluation.coupon.description,
          pricing,
        }
      : { isValid: false, discountAmount: 0, errorCode: evaluation.errorCode, error: evaluation.message, pricing };
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err, 'validate-coupon');
  }
}

export default withStoredIntegrations(handler);
