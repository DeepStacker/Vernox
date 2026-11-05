/**
 * Shiprocket tracking webhook processing (token already verified by the handler).
 *
 * Idempotency: each event is keyed by sha256(awb | status | timestamp) in
 * `courier_events/{key}`; repeats are acknowledged without re-processing. Events
 * for AWBs this store did not book are stored as `unmatched` and acknowledged
 * (Shiprocket disables webhooks that keep failing). Unknown statuses are
 * recorded and ignored.
 */
import crypto from 'crypto';
import { getHeader } from '../http';
import type { DocStore } from '../store';
import { applyCourierStatus } from './shipments';
import { mapCourierStatus, normaliseCourierStatus } from './statusMap';
import type { VercelRequest } from '@vercel/node';

export interface ShiprocketTrackingEvent {
  awb?: string | number;
  current_status?: string;
  shipment_status?: string;
  current_status_id?: number;
  shipment_status_id?: number;
  current_timestamp?: string;
  order_id?: string;
  courier_name?: string;
}

export type CourierWebhookOutcome = 'applied' | 'ignored' | 'unmapped_status' | 'unmatched' | 'duplicate_event' | 'invalid';

/** Constant-time check of the `x-api-key` token Shiprocket sends with each webhook call. */
export function verifyCourierWebhookToken(req: VercelRequest, expected: string): boolean {
  const received = getHeader(req, 'x-api-key') ?? '';
  const a = crypto.createHash('sha256').update(received).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return received.length > 0 && crypto.timingSafeEqual(a, b);
}

export async function processCourierEvent(store: DocStore, event: ShiprocketTrackingEvent, now = Date.now()): Promise<CourierWebhookOutcome> {
  const awb = event.awb !== undefined && event.awb !== null ? String(event.awb).trim() : '';
  const status = normaliseCourierStatus(event.current_status ?? event.shipment_status);
  if (!/^[A-Za-z0-9-]{4,40}$/.test(awb) || !status) return 'invalid';
  const at = String(event.current_timestamp ?? '').slice(0, 40);
  const key = crypto.createHash('sha256').update(`${awb}|${status}|${at}`).digest('hex').slice(0, 40);
  const eventPath = `courier_events/${key}`;
  if (await store.get(eventPath)) return 'duplicate_event';

  const matches = await store.query('orders', { where: [{ field: 'shipmentAwb', op: '==', value: awb }], limit: 1 });
  const orderId = matches[0]?.id ?? null;
  const target = mapCourierStatus(status, event.current_status_id ?? event.shipment_status_id);
  let outcome: CourierWebhookOutcome;
  if (!orderId) {
    console.error(`[courier-webhook] event for unknown AWB ${awb}; stored for reconciliation`);
    outcome = 'unmatched';
  } else if (!target) {
    outcome = 'unmapped_status';
  } else {
    const result = await applyCourierStatus(store, { orderId, target, event: { status, at }, by: 'courier', now });
    outcome = result === 'applied' ? 'applied' : 'ignored';
  }
  await store.set(eventPath, {
    awb,
    status,
    statusId: event.current_status_id ?? event.shipment_status_id ?? null,
    eventAt: at,
    orderId,
    target,
    outcome,
    receivedAt: now,
    expiresAt: new Date(now + 90 * 24 * 3600_000),
  });
  return outcome;
}
