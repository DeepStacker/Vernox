/**
 * GET /api/cron/send-notifications — Vercel Cron (vercel.json), every 2 minutes.
 * Delivers pending `notifications_outbox` documents (email via Resend, SMS via
 * MSG91; unconfigured channels are skipped) with retry/backoff. Protected by
 * CRON_SECRET (`Authorization: Bearer <CRON_SECRET>`). Logic: api/_lib/notifications/deliver.ts.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireCron } from '../_lib/auth';
import { sendError } from '../_lib/errors';
import { getStore } from '../_lib/firebaseAdmin';
import { assertMethod } from '../_lib/http';
import { createChannels } from '../_lib/notifications/channels';
import { deliverPendingNotifications } from '../_lib/notifications/deliver';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['GET', 'POST']);
    requireCron(req);
    const result = await deliverPendingNotifications(getStore(), createChannels(process.env, undefined, getStore()));
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendError(res, err, 'cron/send-notifications');
  }
}
