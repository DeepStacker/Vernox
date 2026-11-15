/**
 * POST /api/cart-quote — the server's price of a basket (api/_lib/cartQuote.ts).
 * Body: { items: CheckoutItem[] without customDesignRef, couponCode?, customerEmail? }. Lines are priced on the server
 * with the checkout engine, including the volume discount; client prices are never accepted. Advisory only.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cartQuoteSchema, quoteCart } from './_lib/cartQuote';
import { sendError } from './_lib/errors';
import { getStore } from './_lib/firebaseAdmin';
import { assertMethod, parseBody } from './_lib/http';
import { enforceRateLimit, RATE_LIMITS } from './_lib/rateLimit';
import { loadStoreConfig } from './_lib/storeConfig';
import { withStoredIntegrations } from './_lib/withIntegrations';

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['POST']);
    const body = parseBody(req, cartQuoteSchema);
    const store = getStore();
    await enforceRateLimit(store, req, RATE_LIMITS.cartQuote);
    return res.status(200).json(await quoteCart(store, await loadStoreConfig(store), body));
  } catch (err) {
    return sendError(res, err, 'cart-quote');
  }
}

export default withStoredIntegrations(handler);
