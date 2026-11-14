/**
 * GET /api/cron/release-reservations — Vercel Cron (vercel.json), every 5 minutes.
 * Expires unpaid orders whose reservation TTL has passed and returns their stock
 * (atomic increments, one transaction per order). Protected by CRON_SECRET, which
 * Vercel sends as `Authorization: Bearer <CRON_SECRET>`. Also releases refunds that were reserved but never
 * reached Razorpay (refunds.ts releaseStaleRefunds).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireCron } from '../_lib/auth';
import { sendError } from '../_lib/errors';
import { getStore } from '../_lib/firebaseAdmin';
import { assertMethod } from '../_lib/http';
import { releaseStaleRefunds } from '../_lib/refunds';
import { releaseExpiredReservations } from '../_lib/reservations';
import { withStoredIntegrations } from '../_lib/withIntegrations';

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['GET', 'POST']);
    requireCron(req);
    const store = getStore();
    const result = await releaseExpiredReservations(store);
    if (result.failed > 0) console.error(`[cron] ${result.failed} reservation releases failed; they will be retried next run`);
    const staleRefunds = await releaseStaleRefunds(store);
    return res.status(200).json({ success: true, ...result, staleRefunds });
  } catch (err) {
    return sendError(res, err, 'cron/release-reservations');
  }
}

export default withStoredIntegrations(handler);
