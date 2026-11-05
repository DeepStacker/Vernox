/**
 * GET /api/order-status?orderId=...&email=...
 * Guest-safe order summary for the confirmation and track-order pages. Access
 * requires the order's email (or a bearer token of the owning user). A wrong
 * email and an unknown order return the same 404 so orders can't be enumerated.
 */
import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { optionalUser } from './_lib/auth';
import { ApiError, sendError } from './_lib/errors';
import { getAdminAuth, getStore } from './_lib/firebaseAdmin';
import { assertMethod } from './_lib/http';
import { asOrder, orderPath, publicOrderSummary } from './_lib/orders';
import { enforceRateLimit, RATE_LIMITS } from './_lib/rateLimit';

const querySchema = z.object({
  orderId: z.string().trim().regex(/^[A-Za-z0-9]{10,40}$/),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
});

const sameEmail = (a: string, b: string) => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    const order = asOrder(await store.get(orderPath(parsed.data.orderId)));
    const authorised =
      !!order &&
      ((parsed.data.email !== undefined && sameEmail(order.email, parsed.data.email)) ||
        (user !== null && order.userId === user.uid));
    if (!order || !authorised) throw new ApiError(404, 'NOT_FOUND', 'No order matches these details.');

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, order: publicOrderSummary(order) });
  } catch (err) {
    return sendError(res, err, 'order-status');
  }
}
