/**
 * Batch expiry of unpaid orders (driven by api/cron/release-reservations.ts).
 * Uses the composite index orders(status, reservationExpiresAt).
 */
import { expireOrder } from './payments';
import type { DocStore } from './store';

const BATCH_SIZE = 200;

export async function releaseExpiredReservations(store: DocStore, now = Date.now()) {
  const candidates = await store.query('orders', {
    where: [
      { field: 'status', op: '==', value: 'Pending_Payment' },
      { field: 'reservationExpiresAt', op: '<=', value: now },
    ],
    orderBy: { field: 'reservationExpiresAt', direction: 'asc' },
    limit: BATCH_SIZE,
  });

  let expired = 0;
  let failed = 0;
  // Sequential on purpose: bounded load on Firestore, and each order is its own transaction.
  for (const { id } of candidates) {
    try {
      if (await expireOrder(store, id, now)) expired += 1;
    } catch (err) {
      failed += 1;
      console.error(`[reservations] failed to expire order ${id}`, err);
    }
  }
  return { scanned: candidates.length, expired, failed, more: candidates.length === BATCH_SIZE };
}
