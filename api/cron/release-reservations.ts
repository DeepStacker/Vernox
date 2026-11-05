/**
 * GET /api/cron/release-reservations — Vercel Cron (vercel.json), every 5 minutes.
 * Expires unpaid orders whose reservation TTL has passed and returns their stock
 * (atomic increments, one transaction per order). Protected by CRON_SECRET, which
 * Vercel sends as `Authorization: Bearer <CRON_SECRET>`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireCron } from '../_lib/auth';
import { sendError } from '../_lib/errors';
import { getStore } from '../_lib/firebaseAdmin';
import { assertMethod } from '../_lib/http';
import { releaseExpiredReservations } from '../_lib/reservations';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['GET', 'POST']);
    requireCron(req);
    const result = await releaseExpiredReservations(getStore());
    if (result.failed > 0) console.error(`[cron] ${result.failed} reservation releases failed; they will be retried next run`);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendError(res, err, 'cron/release-reservations');
  }
}
