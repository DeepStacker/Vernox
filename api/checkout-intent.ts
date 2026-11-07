/**
 * POST /api/checkout-intent — prices the cart on the server, reserves stock and
 * creates the order: with its Razorpay order (prepaid, default) or confirmed as
 * cash on delivery (`paymentMethod: 'cod'`; needs a verification token when SMS confirmation is enabled,
 * otherwise the order is flagged COD_UNVERIFIED, see api/_lib/codOtp.ts). Contract: API.md.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { optionalUser } from './_lib/auth';
import { codOtpEnabled } from './_lib/codOtp';
import { checkoutRequestSchema, createCheckoutIntent } from './_lib/checkout';
import { getRazorpayCredentials } from './_lib/config';
import { sendError } from './_lib/errors';
import { getAdminAuth, getStore } from './_lib/firebaseAdmin';
import { assertMethod, parseBody } from './_lib/http';
import { phoneKey } from './_lib/orders';
import { createRazorpayGateway } from './_lib/razorpay';
import { enforceRateLimit, enforceRateLimitKey, RATE_LIMITS } from './_lib/rateLimit';
import { createShippingProvider } from './_lib/shipping';
import { loadStoreConfig } from './_lib/storeConfig';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['POST']);
    const body = parseBody(req, checkoutRequestSchema);
    // COD never reaches Razorpay; requiring its keys here would take COD down with a payment misconfiguration.
    const keyId = body.paymentMethod === 'cod' ? '' : getRazorpayCredentials().keyId;
    const store = getStore();
    await enforceRateLimit(store, req, RATE_LIMITS.checkoutIntent);
    if (body.paymentMethod === 'cod') {
      await enforceRateLimitKey(store, RATE_LIMITS.codCheckoutPhone, phoneKey(body.customer.phone));
      await enforceRateLimitKey(store, RATE_LIMITS.codCheckoutEmail, body.customer.email);
    }
    const user = await optionalUser(req, getAdminAuth());
    const config = await loadStoreConfig(store);

    const result = await createCheckoutIntent(
      {
        store,
        gateway: createRazorpayGateway(),
        razorpayKeyId: keyId,
        codOtpEnabled: codOtpEnabled(config),
        config,
        shipping: createShippingProvider(store, config),
      },
      body,
      user?.uid ?? null,
    );
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err, 'checkout-intent');
  }
}
