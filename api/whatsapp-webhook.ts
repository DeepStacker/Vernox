/**
 * /api/whatsapp-webhook — WhatsApp Cloud API (Meta) webhook receiver.
 *  - GET: subscription handshake. Meta sends hub.mode=subscribe, hub.verify_token and hub.challenge; when the
 *    token equals WHATSAPP_VERIFY_TOKEN the challenge is echoed.
 *  - POST: `messages` notifications. X-Hub-Signature-256 is HMAC-SHA256 of the exact raw body with the app secret
 *    (WHATSAPP_APP_SECRET), so Vercel's body parser is disabled. Processing is idempotent per message id
 *    (api/_lib/whatsappInbound.ts) and a valid signature always gets 200, so Meta does not retry-storm us.
 */
import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireEnv } from './_lib/config';
import { ApiError, sendError } from './_lib/errors';
import { getStore } from './_lib/firebaseAdmin';
import { assertMethod, getHeader, readRawBody } from './_lib/http';
import { verifyMetaSignature } from './_lib/whatsapp';
import { processWhatsAppWebhook, type WhatsAppWebhookPayload } from './_lib/whatsappInbound';

export const config = { api: { bodyParser: false } };

function safeEqualText(a: string, b: string): boolean {
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['GET', 'POST']);

    if (req.method === 'GET') {
      const query = req.query as Record<string, string | string[] | undefined>;
      const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
      const token = first(query['hub.verify_token']);
      const challenge = first(query['hub.challenge']);
      if (first(query['hub.mode']) !== 'subscribe' || !token || !challenge || !safeEqualText(token, requireEnv('WHATSAPP_VERIFY_TOKEN'))) {
        throw new ApiError(403, 'FORBIDDEN', 'Verification failed.', 'whatsapp verify token mismatch');
      }
      res.setHeader('Content-Type', 'text/plain');
      res.status(200).end(challenge); // end(): the local router's response has no send()
      return;
    }

    const rawBody = await readRawBody(req);
    if (!verifyMetaSignature(rawBody, getHeader(req, 'x-hub-signature-256'), requireEnv('WHATSAPP_APP_SECRET'))) {
      throw new ApiError(400, 'SIGNATURE_INVALID', 'Invalid webhook signature.', 'whatsapp webhook signature mismatch');
    }
    let payload: WhatsAppWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Webhook body is not valid JSON.');
    }
    const outcomes = await processWhatsAppWebhook(getStore(), payload);
    return res.status(200).json({ received: true, messages: outcomes.length });
  } catch (err) {
    return sendError(res, err, 'whatsapp-webhook');
  }
}
