/**
 * Newsletter subscribers (`newsletter_subscribers/{emailHash}`).
 *
 * The document id is sha256(normalised email), so the same address is one document and signing up
 * again is idempotent. No email provider is configured: the collection is the list of record and is
 * exported with `npm run export:newsletter` (see DATABASE.md). Each subscriber has a random
 * `unsubscribeToken`; links in future campaigns are `/newsletter/unsubscribe?h=<emailHash>&t=<token>`.
 * The token is never returned to the signup request, otherwise anyone could unsubscribe an address
 * they merely typed in.
 */
import crypto from 'crypto';
import { z } from 'zod';
import { ApiError } from './errors';
import type { DocStore } from './store';

export const NEWSLETTER_SOURCES = ['footer', 'checkout', 'account'] as const;

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

export interface SubscriberDoc {
  email: string;
  status: 'subscribed' | 'unsubscribed';
  source: string;
  consentAt: number;
  unsubscribedAt: number | null;
  unsubscribeToken: string;
  updatedAt: number;
}

export const emailHash = (email: string) => crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

const path = (hash: string) => `newsletter_subscribers/${hash}`;

/** Subscribes (or re-subscribes) an address. Repeating it for a current subscriber changes nothing. */
export async function subscribe(store: DocStore, input: z.infer<typeof subscribeRequestSchema>, now = Date.now()): Promise<void> {
  const hash = emailHash(input.email);
  await store.runTransaction(async tx => {
    const current = (await tx.get(path(hash))) as unknown as SubscriberDoc | null;
    if (current?.status === 'subscribed') return;
    const doc: SubscriberDoc = {
      email: input.email,
      status: 'subscribed',
      // Someone returning after unsubscribing gets a fresh consent record; the token stays stable.
      source: input.source,
      consentAt: now,
      unsubscribedAt: null,
      unsubscribeToken: current?.unsubscribeToken ?? crypto.randomBytes(24).toString('hex'),
      updatedAt: now,
    };
    tx.set(path(hash), doc as unknown as Record<string, unknown>);
  });
}

function tokensMatch(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
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
