/**
 * Newsletter subscribers (`newsletter_subscribers/{emailHash}`) with double opt-in.
 *
 * The document id is sha256(normalised email), so the same address is one document and signing up
 * again is idempotent. Signing up creates a `pending` subscriber and queues a `newsletter_confirm`
 * email in the notifications outbox (a link to `/newsletter/confirm?h=<emailHash>&t=<confirmToken>`);
 * only opening that link makes the subscriber `subscribed`, which is the consent record under the DPDP
 * Act: what was agreed (source), when it was asked (`consentAt`) and when it was confirmed
 * (`confirmedAt`, plus a hash of the confirming IP). Documents written before double opt-in have no
 * `confirmedAt`; a `subscribed` (or missing) status counts as confirmed, so existing subscribers stay.
 * No email provider list exists: the collection is the list of record and is exported with
 * `npm run export:newsletter` (confirmed subscribers only, see DATABASE.md). Each subscriber has a random
 * `unsubscribeToken`; campaign links are `/newsletter/unsubscribe?h=<emailHash>&t=<token>`.
 * Neither token is ever returned to the signup request, otherwise anyone could confirm or unsubscribe an
 * address they merely typed in. The signup answer is the same for new, pending and existing addresses.
 */
import crypto from 'crypto';
import { z } from 'zod';
import { ApiError } from './errors';
import { enqueueNotification, planNotification } from './notifications/outbox';
import type { DocStore } from './store';

export const NEWSLETTER_SOURCES = ['footer', 'checkout', 'account'] as const;

/** A pending subscriber is sent at most one confirmation email per hour, so the form cannot be used to mail-bomb an address. */
export const CONFIRMATION_RESEND_MS = 3600_000;

export const subscribeRequestSchema = z.object({
  action: z.literal('NEWSLETTER_SUBSCRIBE'),
  email: z.string().trim().toLowerCase().email().max(254),
  source: z.enum(NEWSLETTER_SOURCES).default('footer'),
  /** Honeypot, see contactRequestSchema. */
  website: z.string().max(200).optional(),
});

export const unsubscribeRequestSchema = z.object({
  action: z.literal('NEWSLETTER_UNSUBSCRIBE'),
  emailHash: z.string().regex(/^[0-9a-f]{64}$/),
  token: z.string().regex(/^[0-9a-f]{48}$/),
});

export const confirmSubscriptionRequestSchema = z.object({
  action: z.literal('NEWSLETTER_CONFIRM'),
  emailHash: z.string().regex(/^[0-9a-f]{64}$/),
  token: z.string().regex(/^[0-9a-f]{48}$/),
});

export type SubscriberStatus = 'pending' | 'subscribed' | 'unsubscribed';

export interface SubscriberDoc {
  email: string;
  status: SubscriberStatus;
  source: string;
  /** When consent was asked for (the signup). */
  consentAt: number;
  /** When the address owner confirmed through the emailed link; absent on subscribers from before double opt-in. */
  confirmedAt?: number | null;
  /** sha256 of the IP that confirmed (consent evidence without storing the address itself). */
  confirmedIpHash?: string | null;
  confirmToken?: string;
  confirmationSentAt?: number;
  unsubscribedAt: number | null;
  unsubscribeToken: string;
  updatedAt: number;
}

export const emailHash = (email: string) => crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

const path = (hash: string) => `newsletter_subscribers/${hash}`;

/** Confirmed (or grandfathered) subscribers: the only ones a campaign may reach. A missing status is a pre-opt-in subscriber. */
export const isDeliverableSubscriber = (doc: Pick<SubscriberDoc, 'status'>) => doc.status === 'subscribed' || doc.status === undefined;

/**
 * Starts (or repeats) a signup. New and returning addresses become `pending` and get a confirmation email;
 * a pending address is re-sent the email at most hourly; a confirmed subscriber changes nothing.
 */
export async function subscribe(store: DocStore, input: z.infer<typeof subscribeRequestSchema>, now = Date.now()): Promise<void> {
  const hash = emailHash(input.email);
  await store.runTransaction(async tx => {
    const current = (await tx.get(path(hash))) as unknown as SubscriberDoc | null;
    if (current && isDeliverableSubscriber(current)) return;
    const pending = current?.status === 'pending' ? current : null;
    if (pending && now - (pending.confirmationSentAt ?? 0) < CONFIRMATION_RESEND_MS) return;

    const resend = pending !== null && Boolean(pending.confirmToken);
    const confirmToken = pending?.confirmToken ? pending.confirmToken : crypto.randomBytes(24).toString('hex');
    // The same token may be emailed again on a resend, so the outbox id carries the time bucket.
    const plan = await planNotification(tx, `nl_${hash}`, 'newsletter_confirm', resend ? String(Math.floor(now / CONFIRMATION_RESEND_MS)) : confirmToken.slice(0, 12));
    const doc: SubscriberDoc = {
      email: input.email,
      status: 'pending',
      source: input.source,
      // Someone returning after unsubscribing gets a fresh consent record; the unsubscribe token stays stable.
      consentAt: pending ? pending.consentAt : now,
      confirmedAt: null,
      confirmedIpHash: null,
      confirmToken,
      confirmationSentAt: now,
      unsubscribedAt: null,
      unsubscribeToken: current?.unsubscribeToken ?? crypto.randomBytes(24).toString('hex'),
      updatedAt: now,
    };
    tx.set(path(hash), doc as unknown as Record<string, unknown>);
    enqueueNotification(
      tx,
      plan,
      {
        orderId: `nl_${hash}`,
        orderNumber: '',
        customerName: '',
        email: input.email,
        phone: '',
        paymentMethod: 'prepaid',
        totalPaise: 0,
        newsletter: { emailHash: hash, token: confirmToken },
      },
      now,
    );
  });
}

function tokensMatch(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const hashIp = (ip: string) => crypto.createHash('sha256').update(`newsletter-consent:${ip}`).digest('hex');

/**
 * Idempotent: confirming twice succeeds. A wrong token, an unknown hash and a link for an address that has
 * since unsubscribed are the same 404, so a stale link can never resubscribe someone.
 */
export async function confirmSubscription(
  store: DocStore,
  params: z.infer<typeof confirmSubscriptionRequestSchema>,
  ip: string,
  now = Date.now(),
): Promise<void> {
  await store.runTransaction(async tx => {
    const current = (await tx.get(path(params.emailHash))) as unknown as SubscriberDoc | null;
    if (!current || current.status === 'unsubscribed' || !current.confirmToken || !tokensMatch(current.confirmToken, params.token)) {
      throw new ApiError(404, 'NOT_FOUND', 'This confirmation link is not valid.');
    }
    if (current.status === 'subscribed') return;
    tx.update(path(params.emailHash), { status: 'subscribed', confirmedAt: now, confirmedIpHash: hashIp(ip), updatedAt: now });
  });
}

/** Idempotent: unsubscribing twice succeeds. A wrong token and an unknown hash are the same 404. */
export async function unsubscribe(store: DocStore, params: z.infer<typeof unsubscribeRequestSchema>, now = Date.now()): Promise<void> {
  await store.runTransaction(async tx => {
    const current = (await tx.get(path(params.emailHash))) as unknown as SubscriberDoc | null;
    if (!current || !tokensMatch(current.unsubscribeToken, params.token)) {
      throw new ApiError(404, 'NOT_FOUND', 'This unsubscribe link is not valid.');
    }
    if (current.status === 'unsubscribed') return;
    tx.update(path(params.emailHash), { status: 'unsubscribed', unsubscribedAt: now, updatedAt: now });
  });
}
