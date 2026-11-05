/**
 * GET /api/serviceability?pincode=560001&productId=p-01
 * PIN-code serviceability, COD availability and delivery estimate for the product
 * page and checkout. Public, rate-limited per IP; answers are cached per PIN
 * (api/_lib/shipping/index.ts). Contract: API.md.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { ApiError, sendError } from './_lib/errors';
import { getStore } from './_lib/firebaseAdmin';
import { assertMethod } from './_lib/http';
import { CUSTOM_PRODUCT_ID, productFromDoc } from './_lib/pricing';
import { enforceRateLimit, RATE_LIMITS } from './_lib/rateLimit';
import { buildDeliveryEstimate, createShippingProvider, itemLeadTimeDays, serviceabilityFor } from './_lib/shipping';
import { loadStoreConfig } from './_lib/storeConfig';

const querySchema = z.object({
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'must be a 6-digit Indian PIN code'),
  productId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['GET']);
    const parsed = querySchema.safeParse({
      pincode: typeof req.query.pincode === 'string' ? req.query.pincode : undefined,
      productId: typeof req.query.productId === 'string' && req.query.productId ? req.query.productId : undefined,
    });
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Enter a valid 6-digit PIN code.');
    const { pincode, productId } = parsed.data;

    const store = getStore();
    await enforceRateLimit(store, req, RATE_LIMITS.serviceability);
    const config = await loadStoreConfig(store);

    const isCustom = productId === CUSTOM_PRODUCT_ID;
    const product = productId && !isCustom ? productFromDoc(productId, await store.get(`products/${productId}`)) : null;
    const leadTimeDays = itemLeadTimeDays(isCustom, product?.leadTimeDays ?? null, config);
    const now = Date.now();
    const serviceability = await serviceabilityFor(store, createShippingProvider(store, config), pincode, now);
    const estimate = buildDeliveryEstimate({ serviceability, leadTimeDays, codAllowedForItem: !isCustom, config, now });

    return res.status(200).json({ success: true, pincode, ...estimate });
  } catch (err) {
    return sendError(res, err, 'serviceability');
  }
}
