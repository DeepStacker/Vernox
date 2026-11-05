/**
 * POST /api/checkout-intent — prices the cart on the server, reserves stock,
 * creates the order and its Razorpay order. Contract: API.md.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { optionalUser } from './_lib/auth';
import { checkoutRequestSchema, createCheckoutIntent } from './_lib/checkout';
import { getRazorpayCredentials } from './_lib/config';
import { sendError } from './_lib/errors';
import { getAdminAuth, getStore } from './_lib/firebaseAdmin';
import { assertMethod, parseBody } from './_lib/http';
import { createRazorpayGateway } from './_lib/razorpay';
import { enforceRateLimit, RATE_LIMITS } from './_lib/rateLimit';
import { loadStoreConfig } from './_lib/storeConfig';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['POST']);
    const body = parseBody(req, checkoutRequestSchema);
    const { keyId } = getRazorpayCredentials();
    const store = getStore();
    await enforceRateLimit(store, req, RATE_LIMITS.checkoutIntent);
    const user = await optionalUser(req, getAdminAuth());

    const result = await createCheckoutIntent(
      { store, gateway: createRazorpayGateway(), razorpayKeyId: keyId, config: await loadStoreConfig(store) },
      body,
      user?.uid ?? null,
    );
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err, 'checkout-intent');
  }
}
