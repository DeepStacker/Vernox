/**
 * GET /api/cron/release-reservations — Vercel Cron (vercel.json), every 5 minutes.
 * Expires unpaid orders whose reservation TTL has passed and returns their stock
 * (atomic increments, one transaction per order). Protected by CRON_SECRET, which
 * Vercel sends as `Authorization: Bearer <CRON_SECRET>`.
 */
import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCronSecret } from '../_lib/config';
import { ApiError, sendError } from '../_lib/errors';
import { getStore } from '../_lib/firebaseAdmin';
import { assertMethod, getHeader } from '../_lib/http';
import { releaseExpiredReservations } from '../_lib/reservations';

function authorised(header: string | undefined, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? '');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['GET', 'POST']);
    if (!authorised(getHeader(req, 'authorization'), getCronSecret())) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid cron credentials.');
    }
    const result = await releaseExpiredReservations(getStore());
    if (result.failed > 0) console.error(`[cron] ${result.failed} reservation releases failed; they will be retried next run`);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendError(res, err, 'cron/release-reservations');
  }
}
