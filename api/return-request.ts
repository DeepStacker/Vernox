/**
 * POST /api/return-request — customer return request after delivery.
 * Body: { orderId, email?, reason, details?, photoPaths? } where photoPaths are
 * Firebase Storage object paths under `returns/{orderId}/` uploaded by the
 * customer (storage.rules). Access as for order-status; rate-limited per IP.
 * Rules: api/_lib/returns.ts.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { optionalUser } from './_lib/auth';
import { sendError } from './_lib/errors';
import { getAdminAuth, getStore } from './_lib/firebaseAdmin';
import { assertMethod, parseBody } from './_lib/http';
import { loadCustomerOrder, optionalEmailSchema, orderIdSchema } from './_lib/orderAccess';
import { enforceRateLimit, RATE_LIMITS } from './_lib/rateLimit';
import { RETURN_REASONS, requestReturn, type ReturnReason } from './_lib/returns';
import { loadStoreConfig } from './_lib/storeConfig';
import { withStoredIntegrations } from './_lib/withIntegrations';

interface ReturnRequestBody {
  orderId: string;
  email?: string;
  reason: ReturnReason;
  details: string;
  photoPaths: string[];
}

const bodySchema = z.object({
  orderId: orderIdSchema,
  email: optionalEmailSchema,
  reason: z.enum(RETURN_REASONS),
  details: z.string().trim().max(2000).default(''),
  photoPaths: z.array(z.string().trim().regex(/^returns\/[A-Za-z0-9]{10,40}\/[A-Za-z0-9_.-]{1,120}$/)).max(6).default([]),
}) as unknown as z.ZodType<ReturnRequestBody, z.ZodTypeDef, unknown>;

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['POST']);
    const body = parseBody(req, bodySchema);
    const store = getStore();
    await enforceRateLimit(store, req, RATE_LIMITS.returnRequest);
    const user = await optionalUser(req, getAdminAuth());
    const order = await loadCustomerOrder(store, body.orderId, body.email, user);
    const config = await loadStoreConfig(store);

    const ret = await requestReturn(store, config, {
      orderId: order.id,
      reason: body.reason,
      details: body.details,
      photoPaths: body.photoPaths,
    });
    return res.status(200).json({ success: true, orderId: order.id, status: 'Return_Requested', returnStatus: ret.status });
  } catch (err) {
    return sendError(res, err, 'return-request');
  }
}

export default withStoredIntegrations(handler);
