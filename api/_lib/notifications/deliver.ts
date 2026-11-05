/**
 * Outbox delivery (driven by api/cron/send-notifications.ts).
 *
 * Each document is claimed in a transaction (status `sending` + a lease) so
 * overlapping cron runs never send the same message twice; a run that crashes
 * mid-send leaves a lease that expires and the document is retried. Channel
 * results are stored per channel, so a retry re-sends only the channels that
 * failed. Backoff: 1, 2, 4, ... minutes capped at 6 h; after MAX_ATTEMPTS the
 * document is `dead` (visible to staff, never retried automatically).
 */
import type { DocStore } from '../store';
import { OUTBOX_COLLECTION } from './outbox';
import { renderNotification } from './templates';
import type { ChannelName, ChannelState, NotificationChannel, OutboxDoc } from './types';

export const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 50;
const LEASE_MS = 2 * 60_000;

export function backoffMs(attempts: number): number {
  return Math.min(6 * 3600_000, 60_000 * 2 ** Math.max(0, attempts - 1));
}

async function claim(store: DocStore, id: string, now: number): Promise<OutboxDoc | null> {
  const path = `${OUTBOX_COLLECTION}/${id}`;
  return store.runTransaction(async tx => {
    const doc = (await tx.get(path)) as unknown as OutboxDoc | null;
    if (!doc) return null;
    const claimable =
      (doc.status === 'pending' && doc.nextAttemptAt <= now) || (doc.status === 'sending' && doc.leaseUntil <= now);
    if (!claimable) return null;
    tx.update(path, { status: 'sending', leaseUntil: now + LEASE_MS, updatedAt: now });
    return doc;
  });
}

export interface DeliveryRunResult {
  scanned: number;
  sent: number;
  retrying: number;
  dead: number;
}

export async function deliverOne(store: DocStore, doc: OutboxDoc, channels: NotificationChannel[], now: number) {
  const message = renderNotification(doc.event, doc.payload);
  const states: Record<ChannelName, ChannelState> = { ...doc.channels };
  const errors: string[] = [];
  for (const channel of channels) {
    if (states[channel.name] !== 'pending') continue;
    try {
      states[channel.name] = await channel.send(message, doc);
    } catch (err) {
      errors.push(`${channel.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // A channel with no implementation configured counts as skipped.
  for (const name of Object.keys(states) as ChannelName[]) {
    if (states[name] === 'pending' && !channels.some(c => c.name === name)) states[name] = 'skipped';
  }

  const attempts = doc.attempts + 1;
  const done = Object.values(states).every(s => s !== 'pending');
  const outcome: OutboxDoc['status'] = done ? 'sent' : attempts >= MAX_ATTEMPTS ? 'dead' : 'pending';
  if (errors.length > 0) {
    console.error(`[notifications] ${doc.id} attempt ${attempts} failed (${outcome}): ${errors.join('; ')}`);
  }
  await store.update(`${OUTBOX_COLLECTION}/${doc.id}`, {
    channels: states,
    status: outcome,
    attempts,
    nextAttemptAt: outcome === 'pending' ? now + backoffMs(attempts) : doc.nextAttemptAt,
    leaseUntil: 0,
    lastError: errors.length > 0 ? errors.join('; ').slice(0, 1000) : null,
    sentAt: outcome === 'sent' ? now : null,
    updatedAt: now,
  });
  return outcome;
}

export async function deliverPendingNotifications(
  store: DocStore,
  channels: NotificationChannel[],
  now = Date.now(),
): Promise<DeliveryRunResult> {
  const [due, stale] = await Promise.all([
    store.query(OUTBOX_COLLECTION, {
      where: [
        { field: 'status', op: '==', value: 'pending' },
        { field: 'nextAttemptAt', op: '<=', value: now },
      ],
      orderBy: { field: 'nextAttemptAt', direction: 'asc' },
      limit: BATCH_SIZE,
    }),
    store.query(OUTBOX_COLLECTION, {
      where: [
        { field: 'status', op: '==', value: 'sending' },
        { field: 'leaseUntil', op: '<=', value: now },
      ],
      orderBy: { field: 'leaseUntil', direction: 'asc' },
      limit: BATCH_SIZE,
    }),
  ]);

  const result: DeliveryRunResult = { scanned: due.length + stale.length, sent: 0, retrying: 0, dead: 0 };
  // Sequential: bounded provider and Firestore load; each document is independent.
  for (const { id } of [...due, ...stale]) {
    try {
      const doc = await claim(store, id, now);
      if (!doc) continue;
      const outcome = await deliverOne(store, doc, channels, now);
      if (outcome === 'sent') result.sent += 1;
      else if (outcome === 'dead') result.dead += 1;
      else result.retrying += 1;
    } catch (err) {
      // The lease expires and the next run retries this document.
      console.error(`[notifications] failed to process ${id}`, err);
      result.retrying += 1;
    }
  }
  return result;
}
