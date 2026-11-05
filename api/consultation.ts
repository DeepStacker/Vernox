/**
 * POST /api/consultation — the customer's side of a design consultation (staff actions live in
 * /api/admin). Requires a signed-in customer; a consultation is reachable only by its owner.
 * Body: { action, ...params }:
 *   PURCHASE         { spaceId, idempotencyKey, name, phone, state }  -> prepaid checkout response (Razorpay)
 *   REQUEST_REVISION { consultationId, message }                      -> the one free revision
 *   CLOSE            { consultationId, outcome: 'accepted'|'declined' }
 * Payment is completed through the ordinary /api/verify-payment. See API.md.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from './_lib/auth';
import { getRazorpayCredentials } from './_lib/config';
import { purchaseConsultation, purchaseRequestSchema } from './_lib/consultationPurchase';
import { sendError } from './_lib/errors';
import { getAdminAuth, getStore } from './_lib/firebaseAdmin';
import { assertMethod, parseBody } from './_lib/http';
import { closeConsultation, requestRevision } from './_lib/proposals';
import { createRazorpayGateway } from './_lib/razorpay';
import { enforceRateLimit, RATE_LIMITS } from './_lib/rateLimit';
import { loadStoreConfig } from './_lib/storeConfig';

const consultationId = z.string().trim().regex(/^[A-Za-z0-9]{10,40}$/);

type Body =
  | { action: 'PURCHASE' }
  | { action: 'REQUEST_REVISION'; consultationId: string; message: string }
  | { action: 'CLOSE'; consultationId: string; outcome: 'accepted' | 'declined' };

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('PURCHASE') }).passthrough(),
  z.object({ action: z.literal('REQUEST_REVISION'), consultationId, message: z.string().trim().min(3).max(1000) }),
  z.object({ action: z.literal('CLOSE'), consultationId, outcome: z.enum(['accepted', 'declined']) }),
]) as unknown as z.ZodType<Body, z.ZodTypeDef, unknown>;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['POST']);
    const body = parseBody(req, bodySchema);
    const store = getStore();
    await enforceRateLimit(store, req, RATE_LIMITS.consultation);
    const user = await requireUser(req, getAdminAuth());

    if (body.action === 'PURCHASE') {
      const purchase = parseBody(req, purchaseRequestSchema);
      const config = await loadStoreConfig(store);
      const result = await purchaseConsultation(
        { store, gateway: createRazorpayGateway(), razorpayKeyId: getRazorpayCredentials().keyId, config },
        user,
        purchase,
      );
      return res.status(200).json(result);
    }
    if (body.action === 'REQUEST_REVISION') {
      await requestRevision(store, { id: body.consultationId, uid: user.uid, message: body.message });
      return res.status(200).json({ success: true });
    }
    await closeConsultation(store, { id: body.consultationId, uid: user.uid, outcome: body.outcome });
    return res.status(200).json({ success: true });
  } catch (err) {
    return sendError(res, err, 'consultation');
  }
}
