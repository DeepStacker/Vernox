/**
 * POST /api/razorpay-webhook — Razorpay webhook receiver.
 * The signature is computed over the exact raw body, so Vercel's body parser is
 * disabled for this route. Event semantics and the unknown-order policy: api/_lib/webhook.ts.
 */
import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRazorpayWebhookSecret } from './_lib/config';
import { ApiError, sendError } from './_lib/errors';
import { getStore } from './_lib/firebaseAdmin';
import { assertMethod, getHeader, readRawBody } from './_lib/http';
import { verifyWebhookSignature } from './_lib/razorpay';
import { processWebhookEvent, type RazorpayWebhookEvent } from './_lib/webhook';
import { withStoredIntegrations } from './_lib/withIntegrations';

export const config = { api: { bodyParser: false } };

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['POST']);
    const secret = getRazorpayWebhookSecret();
    const rawBody = await readRawBody(req);

    if (!verifyWebhookSignature(rawBody, getHeader(req, 'x-razorpay-signature'), secret)) {
      throw new ApiError(400, 'SIGNATURE_INVALID', 'Invalid webhook signature.', 'webhook signature mismatch');
    }

    let event: RazorpayWebhookEvent;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Webhook body is not valid JSON.');
    }

    const eventId =
      getHeader(req, 'x-razorpay-event-id')?.replace(/[^A-Za-z0-9_-]/g, '') ||
      `sha256_${crypto.createHash('sha256').update(rawBody).digest('hex')}`;

    const outcome = await processWebhookEvent(getStore(), event, eventId);
    return res.status(200).json({ received: true, outcome });
  } catch (err) {
    return sendError(res, err, 'razorpay-webhook');
  }
}

export default withStoredIntegrations(handler);
