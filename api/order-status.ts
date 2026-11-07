/**
 * GET /api/order-status?orderId=...&email=...
 * Guest-safe order summary for the confirmation and track-order pages. Access
 * requires the order's email (or a bearer token of the owning user); see
 * api/_lib/orderAccess.ts.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { optionalUser } from './_lib/auth';
import { ApiError, sendError } from './_lib/errors';
import { getAdminAuth, getStore } from './_lib/firebaseAdmin';
import { assertMethod } from './_lib/http';
import { loadCustomerOrder, optionalEmailSchema, orderIdSchema } from './_lib/orderAccess';
import { publicOrderSummary } from './_lib/orders';
import { enforceRateLimit, RATE_LIMITS } from './_lib/rateLimit';
import { loadStoreConfig } from './_lib/storeConfig';
import { withStoredIntegrations } from './_lib/withIntegrations';

const querySchema = z.object({ orderId: orderIdSchema, email: optionalEmailSchema });

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['GET']);
    const parsed = querySchema.safeParse({
      orderId: typeof req.query.orderId === 'string' ? req.query.orderId : undefined,
      email: typeof req.query.email === 'string' && req.query.email ? req.query.email : undefined,
    });
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid orderId and email.');

    const store = getStore();
    await enforceRateLimit(store, req, RATE_LIMITS.orderStatus);
    const user = await optionalUser(req, getAdminAuth());
    const order = await loadCustomerOrder(store, parsed.data.orderId, parsed.data.email, user);
    const config = await loadStoreConfig(store);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, order: publicOrderSummary(order, config.fulfilment.returnWindowDays) });
  } catch (err) {
    return sendError(res, err, 'order-status');
  }
}

export default withStoredIntegrations(handler);
