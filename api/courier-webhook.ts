/**
 * POST /api/courier-webhook — Shiprocket shipment tracking webhook.
 *
 * Shiprocket rejects webhook URLs that contain "shiprocket", "kartrocket", "sr"
 * or "kr", hence this route name. It sends the token configured in its panel in
 * the `x-api-key` header; it is compared in constant time with
 * SHIPROCKET_WEBHOOK_TOKEN. Event processing and idempotency:
 * api/_lib/shipping/trackingWebhook.ts. Always 200 for processed or ignored
 * events (Shiprocket disables failing webhooks); 500 on transient errors.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireEnv } from './_lib/config';
import { ApiError, sendError } from './_lib/errors';
import { getStore } from './_lib/firebaseAdmin';
import { assertMethod } from './_lib/http';
import { processCourierEvent, verifyCourierWebhookToken, type ShiprocketTrackingEvent } from './_lib/shipping/trackingWebhook';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['POST']);
    if (!verifyCourierWebhookToken(req, requireEnv('SHIPROCKET_WEBHOOK_TOKEN'))) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid webhook token.', 'courier webhook token mismatch');
    }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'VALIDATION_ERROR', 'Webhook body must be a JSON object.');
    const outcome = await processCourierEvent(getStore(), body as ShiprocketTrackingEvent);
    return res.status(200).json({ received: true, outcome });
  } catch (err) {
    return sendError(res, err, 'courier-webhook');
  }
}
