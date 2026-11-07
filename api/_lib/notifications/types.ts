/**
 * Customer notification model.
 *
 * Business transactions never send anything themselves: they write one
 * `notifications_outbox/{orderId}_{event}[_{discriminator}]` document in the same
 * transaction as the status change (outbox.ts). The cron
 * api/cron/send-notifications.ts delivers pending documents through the
 * configured channels with retry/backoff (deliver.ts). The deterministic id makes
 * "one notification per order + event" an invariant: a repeated transition or a
 * retried transaction finds the existing document and does not enqueue again.
 *
 * Design consultations (api/_lib/consultations.ts) use the same outbox: the consultation id is its
 * order id, `order_confirmed` carries `service: 'consultation'` for the purchase receipt, and
 * `proposal_ready` is enqueued with a per-version discriminator.
 *
 * `support_ticket` is an internal event: a new contact-form ticket (api/_lib/tickets.ts) alerts the
 * support inbox. The ticket id is its `orderId`, `orderNumber` is the ticket reference, `email` is the
 * support address (settings/store `supportEmail`) and `note` carries the sender and subject. `ticket_reply`
 * emails a staff reply to the customer (discriminator = message index); `note` is the reply text.
 * `newsletter_confirm` is the double opt-in email of a newsletter signup (api/_lib/newsletter.ts): `orderId` is
 * `nl_<emailHash>` and `payload.newsletter` carries the link parts. It is the one event that is HELD, not
 * skipped, while the email channel is unconfigured (HELD_WITHOUT_CHANNEL in deliver.ts), so the signup is not lost.
 * `trade_enquiry` is internal too: a Trade page enquiry (api/_lib/tradeEnquiry.ts) alerts the same inbox,
 * with the enquiry id as `orderId` and its reference as `orderNumber`.
 */

export const NOTIFICATION_EVENTS = [
  'order_confirmed',
  'in_production',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'refund_processed',
  'return_requested',
  'return_approved',
  'return_rejected',
  'return_received',
  'proposal_ready',
  'support_ticket',
  'ticket_reply',
  'trade_enquiry',
  'newsletter_confirm',
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** Snapshot of what a template needs, frozen when the event happens. Contains customer PII: server-only. */
export interface NotificationPayload {
  orderId: string;
  orderNumber: string;
  customerName: string;
  email: string;
  /** 10-digit Indian mobile, or '' when unknown. */
  phone: string;
  paymentMethod: 'prepaid' | 'cod' | 'replacement';
  totalPaise: number;
  courier?: string | null;
  awb?: string | null;
  trackingUrl?: string | null;
  refundAmountPaise?: number;
  note?: string | null;
  /** Set for design-consultation orders: the confirmation copy differs (nothing ships). */
  service?: 'consultation';
  /** Credit coupon issued with a consultation, shown in the receipt. */
  creditCode?: string | null;
  creditPaise?: number;
  creditExpiresAt?: number | null;
  /** newsletter_confirm: the confirmation link is `/newsletter/confirm?h=<emailHash>&t=<token>`. */
  newsletter?: { emailHash: string; token: string };
}

export type ChannelName = 'email' | 'sms' | 'whatsapp';

export type ChannelState = 'pending' | 'sent' | 'skipped';

export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'dead';

export interface OutboxDoc {
  id: string;
  orderId: string;
  event: NotificationEvent;
  payload: NotificationPayload;
  channels: Record<ChannelName, ChannelState>;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  /** While `sending`, the claim expires at this time so a crashed run is retried. */
  leaseUntil: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  sentAt: number | null;
}

export interface RenderedMessage {
  subject: string;
  text: string;
  html: string;
  /** Ordered variables for DLT-registered SMS templates (MSG91 var1, var2, ...). */
  smsVars: string[];
}

/** One delivery channel. `send` throws on a failure worth retrying; returns 'skipped' when the channel cannot apply. */
export interface NotificationChannel {
  readonly name: ChannelName;
  /** False for the placeholder that stands in for an unconfigured provider. Absent means configured. */
  readonly configured?: boolean;
  send(message: RenderedMessage, outbox: OutboxDoc): Promise<'sent' | 'skipped'>;
}
