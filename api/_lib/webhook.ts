/**
 * Razorpay webhook event processing (signature already verified by the handler).
 *
 * Idempotency: each delivery's `x-razorpay-event-id` is recorded in
 * `webhook_events/{eventId}` after processing; repeats are acknowledged without
 * re-processing. The payment functions are themselves idempotent, so a crash
 * between processing and recording is also safe.
 *
 * Unknown orders: Razorpay retries non-2xx deliveries and disables webhooks that
 * keep failing, and events for orders this store did not create (other
 * integrations, dashboard test payments) would fail forever. So an event whose
 * order cannot be found is stored in `webhook_events` with outcome `unmatched`
 * for reconciliation, logged as an error, and acknowledged with 200.
 * Transient failures (Firestore errors) still return 500 so Razorpay retries.
 *
 * Payment links (staff orders, api/_lib/checkout.ts): `payment_link.paid` carries the link, whose notes hold
 * our order id; it is accepted only when that order records the same link id. Its `payment.captured` twin
 * then resolves by payment id (duplicate) or, when the link's order id was known at creation, by order id.
 * Docs: https://razorpay.com/docs/webhooks/payment-links/
 */
import { ApiError } from './errors';
import {
  confirmPayment,
  findOrderIdByPaymentId,
  findOrderIdByRazorpayOrderId,
  markPaymentFailed,
  recordRefund,
} from './payments';
import type { DocStore } from './store';

interface RazorpayEntity {
  id?: string;
  order_id?: string;
  payment_id?: string;
  amount?: number;
  currency?: string;
  notes?: Record<string, string> | unknown[];
  error_description?: string;
  error_reason?: string;
}

interface RazorpayPaymentLinkEntity {
  id?: string;
  notes?: Record<string, string> | unknown[];
}

export interface RazorpayWebhookEvent {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayEntity };
    order?: { entity?: RazorpayEntity };
    refund?: { entity?: RazorpayEntity };
    payment_link?: { entity?: RazorpayPaymentLinkEntity };
  };
}

export type WebhookOutcome =
  | 'paid'
  | 'duplicate_payment'
  | 'payment_discrepancy'
  | 'payment_for_closed_order'
  | 'payment_failed'
  | 'payment_failed_ignored'
  | 'refund_recorded'
  | 'refund_duplicate'
  | 'unmatched'
  | 'ignored_event'
  | 'duplicate_event';

const HANDLED_EVENTS = new Set(['payment.captured', 'order.paid', 'payment.failed', 'refund.processed', 'payment_link.paid']);

async function orderIdForPaymentLink(store: DocStore, link: RazorpayPaymentLinkEntity | undefined): Promise<string | null> {
  const notes = link?.notes && !Array.isArray(link.notes) ? link.notes : {};
  const orderId = typeof notes.orderId === 'string' && /^[A-Za-z0-9]{10,40}$/.test(notes.orderId) ? notes.orderId : null;
  if (!orderId || !link?.id) return null;
  const order = await store.get(`orders/${orderId}`);
  const recorded = (order?.paymentLink as { id?: unknown } | null | undefined)?.id;
  return recorded === link.id ? orderId : null;
}

async function resolveOrderId(store: DocStore, event: RazorpayWebhookEvent): Promise<string | null> {
  const payment = event.payload?.payment?.entity;
  const order = event.payload?.order?.entity;
  const refund = event.payload?.refund?.entity;
  if (event.event === 'payment_link.paid') return orderIdForPaymentLink(store, event.payload?.payment_link?.entity);
  const razorpayOrderId = payment?.order_id || order?.id;
  if (razorpayOrderId) {
    const found = await findOrderIdByRazorpayOrderId(store, razorpayOrderId);
    if (found) return found;
  }
  const paymentId = refund?.payment_id || payment?.id;
  return paymentId ? findOrderIdByPaymentId(store, paymentId) : null;
}

export async function processWebhookEvent(
  store: DocStore,
  event: RazorpayWebhookEvent,
  eventId: string,
  now = Date.now(),
): Promise<WebhookOutcome> {
  const eventPath = `webhook_events/${eventId}`;
  if (await store.get(eventPath)) return 'duplicate_event';

  const type = event.event ?? 'unknown';
  let outcome: WebhookOutcome;
  let orderId: string | null = null;

  if (!HANDLED_EVENTS.has(type)) {
    outcome = 'ignored_event';
  } else {
    orderId = await resolveOrderId(store, event);
    if (!orderId) {
      console.error(`[webhook] ${type} event ${eventId} does not match any order; stored for reconciliation`);
      outcome = 'unmatched';
    } else {
      outcome = await applyEvent(store, type, event, orderId, now);
    }
  }

  const payment = event.payload?.payment?.entity;
  const refund = event.payload?.refund?.entity;
  await store.set(eventPath, {
    event: type,
    outcome,
    orderId,
    razorpayOrderId: payment?.order_id ?? event.payload?.order?.entity?.id ?? null,
    razorpayPaymentId: payment?.id ?? refund?.payment_id ?? null,
    razorpayRefundId: refund?.id ?? null,
    amountPaise: refund?.amount ?? payment?.amount ?? null,
    receivedAt: now,
    expiresAt: new Date(now + 90 * 24 * 3600_000),
  });
  return outcome;
}

async function applyEvent(
  store: DocStore,
  type: string,
  event: RazorpayWebhookEvent,
  orderId: string,
  now: number,
): Promise<WebhookOutcome> {
  const payment = event.payload?.payment?.entity;
  switch (type) {
    case 'payment.captured':
    case 'order.paid':
    case 'payment_link.paid': {
      if (!payment?.id || typeof payment.amount !== 'number' || !payment.currency) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Webhook payment entity is incomplete.');
      }
      const result = await confirmPayment(store, {
        orderId,
        razorpayPaymentId: payment.id,
        source: 'webhook',
        captured: { amountPaise: payment.amount, currency: payment.currency },
        now,
      });
      return (
        {
          paid: 'paid',
          duplicate: 'duplicate_payment',
          discrepancy: 'payment_discrepancy',
          unexpected: 'payment_for_closed_order',
        } as const
      )[result.outcome];
    }
    case 'payment.failed': {
      const reason = payment?.error_description || payment?.error_reason || 'Payment failed';
      const result = await markPaymentFailed(store, { orderId, razorpayPaymentId: payment?.id ?? null, reason, now });
      return result === 'failed' ? 'payment_failed' : 'payment_failed_ignored';
    }
    case 'refund.processed': {
      const refund = event.payload?.refund?.entity;
      if (!refund?.id || typeof refund.amount !== 'number') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Webhook refund entity is incomplete.');
      }
      // Refunds created by this store carry our refund document id in notes (refunds.ts).
      const notes = refund.notes && !Array.isArray(refund.notes) ? refund.notes : {};
      const refundDocId = typeof notes.refundDocId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(notes.refundDocId) ? notes.refundDocId : null;
      const result = await recordRefund(store, { orderId, refundId: refund.id, amountPaise: refund.amount, refundDocId, now });
      return result === 'recorded' ? 'refund_recorded' : 'refund_duplicate';
    }
    default:
      return 'ignored_event';
  }
}
