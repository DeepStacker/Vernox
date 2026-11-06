// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emailHash } from '../../api/_lib/newsletter';
import { reviewId } from '../../api/_lib/reviewSubmission';
import { OUTBOX_COLLECTION } from '../../api/_lib/notifications/outbox';
import { PLACEHOLDER_CONTACT } from '../types/settings';
import { renderNotification } from '../../api/_lib/notifications/templates';
import type { OutboxDoc } from '../../api/_lib/notifications/types';
import type { MemoryStore } from './support/memoryStore';
import { seededStore } from './support/serverFixtures';

let store: MemoryStore;
let limited = false;
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getStore: () => store, getAdminAuth: () => ({}) }));
vi.mock('../../api/_lib/rateLimit', async orig => {
  const real = await orig<typeof import('../../api/_lib/rateLimit')>();
  return {
    ...real,
    enforceRateLimit: async (...args: Parameters<typeof real.enforceRateLimit>) => {
      if (limited) return real.enforceRateLimitKey(args[0], { scope: 'test', limit: 0, windowMs: 60_000 }, 'x');
    },
  };
});
vi.mock('../../api/_lib/auth', async orig => {
  const real = await orig<typeof import('../../api/_lib/auth')>();
  return {
    ...real,
    // The bearer value is the caller's uid; no bearer is a guest.
    requireUser: async (req: VercelRequest) => {
      const uid = req.headers.authorization;
      if (!uid) throw new (await import('../../api/_lib/errors')).ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
      return { uid, email: `${uid}@example.com`, emailVerified: true, signInProvider: 'google.com' };
    },
  };
});

const { default: handler } = await import('../../api/engage');

async function call(body: Record<string, unknown>, bearer?: string) {
  const out: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
  const res = {
    setHeader: () => res,
    status: (s: number) => { out.status = s; return res; },
    json: (b: Record<string, unknown>) => { out.body = b; return res; },
  } as unknown as VercelResponse;
  await handler({ method: 'POST', headers: bearer ? { authorization: bearer } : {}, body, query: {}, socket: {} } as unknown as VercelRequest, res);
  return out;
}

const contact = { action: 'CONTACT', name: 'Asha Rao', email: 'Asha@Example.com', topic: 'Order help', message: 'Where is my order?', website: '' };

beforeEach(() => {
  store = seededStore();
  limited = false;
});

describe('CONTACT', () => {
  it('stores an open ticket and queues one alert to the support inbox', async () => {
    store.seed('settings/store', { supportEmail: 'Help@Vernox.in' });
    const res = await call(contact);
    expect(res.status).toBe(200);
    const [ticket] = store.collection('tickets');
    expect(res.body.ref).toBe(`T-${ticket.id.slice(0, 6).toUpperCase()}`);
    expect(ticket.data).toMatchObject({ status: 'open', channel: 'contact_form', customerEmail: 'asha@example.com', topic: 'Order help', assignedTo: null });
    expect((ticket.data.messages as Array<{ direction: string }>)[0].direction).toBe('inbound');

    const [alert] = store.collection(OUTBOX_COLLECTION);
    const outbox = alert.data as unknown as OutboxDoc;
    expect(outbox.event).toBe('support_ticket');
    expect(outbox.payload.email).toBe('help@vernox.in');
    expect(outbox.channels).toEqual({ email: 'pending', sms: 'skipped' });
    const mail = renderNotification(outbox.event, outbox.payload);
    expect(mail.subject).toMatch(/^New support ticket T-/);
    expect(mail.text).toContain('Asha Rao <asha@example.com>');
  });

  it('still saves the ticket when no support address is configured (email skipped)', async () => {
    expect((await call(contact)).status).toBe(200);
    expect((store.collection(OUTBOX_COLLECTION)[0].data as unknown as OutboxDoc).channels.email).toBe('skipped');
  });

  it('treats the seeded placeholder support address as unset', async () => {
    store.seed('settings/store', { supportEmail: PLACEHOLDER_CONTACT.supportEmail });
    expect((await call(contact)).status).toBe(200);
    expect((store.collection(OUTBOX_COLLECTION)[0].data as unknown as OutboxDoc).channels.email).toBe('skipped');
  });

  it('accepts a filled honeypot without storing anything', async () => {
    const res = await call({ ...contact, website: 'http://spam.example' });
    expect(res.status).toBe(200);
    expect(store.collection('tickets')).toHaveLength(0);
    expect(store.collection(OUTBOX_COLLECTION)).toHaveLength(0);
  });

  it('rejects invalid input and unknown topics', async () => {
    expect((await call({ ...contact, email: 'nope' })).status).toBe(400);
    expect((await call({ ...contact, message: 'hi' })).status).toBe(400);
    expect((await call({ ...contact, topic: 'Free money' })).status).toBe(400);
    expect((await call({ action: 'NOPE' })).status).toBe(400);
    expect(store.collection('tickets')).toHaveLength(0);
  });

  it('is rate limited', async () => {
    limited = true;
    expect((await call(contact)).status).toBe(429);
    expect(store.collection('tickets')).toHaveLength(0);
  });
});

describe('newsletter', () => {
  const subscribeBody = { action: 'NEWSLETTER_SUBSCRIBE', email: ' Reader@Example.com ', source: 'footer', website: '' };
  const hash = emailHash('reader@example.com');

  it('stores consent, source and a token keyed by the email hash, and never returns the token', async () => {
    const res = await call(subscribeBody);
    expect(res.body).toEqual({ success: true });
    const doc = store.read(`newsletter_subscribers/${hash}`)!;
    expect(doc).toMatchObject({ email: 'reader@example.com', status: 'subscribed', source: 'footer' });
    expect(typeof doc.consentAt).toBe('number');
    expect(doc.unsubscribeToken).toMatch(/^[0-9a-f]{48}$/);
  });

  it('is idempotent: a repeat keeps the original consent record', async () => {
    await call(subscribeBody);
    const first = store.read(`newsletter_subscribers/${hash}`)!;
    await call({ ...subscribeBody, source: 'checkout' });
    expect(store.read(`newsletter_subscribers/${hash}`)).toEqual(first);
    expect(store.collection('newsletter_subscribers')).toHaveLength(1);
  });

  it('unsubscribes with the token, idempotently, and resubscribing keeps the same token', async () => {
    await call(subscribeBody);
    const { unsubscribeToken } = store.read(`newsletter_subscribers/${hash}`)! as { unsubscribeToken: string };
    expect((await call({ action: 'NEWSLETTER_UNSUBSCRIBE', emailHash: hash, token: 'a'.repeat(48) })).status).toBe(404);
    expect(store.read(`newsletter_subscribers/${hash}`)!.status).toBe('subscribed');

    const unsub = { action: 'NEWSLETTER_UNSUBSCRIBE', emailHash: hash, token: unsubscribeToken };
    expect((await call(unsub)).status).toBe(200);
    expect((await call(unsub)).status).toBe(200);
    expect(store.read(`newsletter_subscribers/${hash}`)).toMatchObject({ status: 'unsubscribed' });

    await call(subscribeBody);
    expect(store.read(`newsletter_subscribers/${hash}`)).toMatchObject({ status: 'subscribed', unsubscribeToken, unsubscribedAt: null });
  });

  it('answers an unknown hash like a wrong token', async () => {
    expect((await call({ action: 'NEWSLETTER_UNSUBSCRIBE', emailHash: 'f'.repeat(64), token: 'a'.repeat(48) })).status).toBe(404);
  });

  it('drops honeypot and invalid signups, and is rate limited', async () => {
    await call({ ...subscribeBody, website: 'x' });
    expect((await call({ ...subscribeBody, email: 'bad' })).status).toBe(400);
    expect(store.collection('newsletter_subscribers')).toHaveLength(0);
    limited = true;
    expect((await call(subscribeBody)).status).toBe(429);
  });
});

describe('reviews', () => {
  const review = { action: 'SUBMIT_REVIEW', productId: 'p-01', rating: 5, comment: 'Beautiful cut and finish.' };
  const delivered = (id: string, over: Record<string, unknown> = {}) =>
    store.seed(`orders/${id}`, {
      id, userId: 'alice', email: 'alice@example.com', status: 'Delivered', placedAt: 1, deliveredAt: 2,
      customer: { name: 'Alice Wonderland', city: 'Pune' }, items: [{ productId: 'p-01' }], ...over,
    });

  it('requires sign-in', async () => {
    expect((await call(review)).status).toBe(401);
    expect((await call({ action: 'REVIEW_STATUS', productId: 'p-01' })).status).toBe(401);
  });

  it('refuses a customer with no delivered order containing the product', async () => {
    delivered('o1', { status: 'Shipped' });
    delivered('o2', { items: [{ productId: 'p-99' }] });
    delivered('o3', { userId: 'mallory', email: 'mallory@elsewhere.com' });
    expect((await call({ action: 'REVIEW_STATUS', productId: 'p-01' }, 'alice')).body).toMatchObject({ eligible: false, reason: 'not_purchased' });
    expect((await call(review, 'alice')).status).toBe(403);
    expect(store.collection('reviews')).toHaveLength(0);
  });

  it('stores a pending, verified review for a delivered purchase, with a shortened public name', async () => {
    delivered('o1');
    expect((await call({ action: 'REVIEW_STATUS', productId: 'p-01' }, 'alice')).body).toMatchObject({ eligible: true });
    const res = await call(review, 'alice');
    expect(res.status).toBe(200);
    const stored = store.read(`reviews/${reviewId('alice', 'p-01')}`)!;
    expect(stored).toMatchObject({
      productId: 'p-01', userId: 'alice', orderId: 'o1', customerName: 'Alice W.', rating: 5, status: 'pending', verified: true, location: 'Pune',
    });
  });

  it('accepts a guest-checkout order matched by the verified account email', async () => {
    delivered('o1', { userId: null });
    expect((await call(review, 'alice')).status).toBe(200);
  });

  it('allows one review per customer and product, and reports its status', async () => {
    delivered('o1');
    await call(review, 'alice');
    expect((await call(review, 'alice')).status).toBe(409);
    expect((await call({ action: 'REVIEW_STATUS', productId: 'p-01' }, 'alice')).body).toMatchObject({ eligible: false, reason: 'already_reviewed', reviewStatus: 'pending' });
    expect(store.collection('reviews')).toHaveLength(1);
  });

  it('validates rating and comment, and is rate limited', async () => {
    delivered('o1');
    expect((await call({ ...review, rating: 6 }, 'alice')).status).toBe(400);
    expect((await call({ ...review, rating: 4.5 }, 'alice')).status).toBe(400);
    expect((await call({ ...review, comment: 'ok' }, 'alice')).status).toBe(400);
    limited = true;
    expect((await call(review, 'alice')).status).toBe(429);
    expect(store.collection('reviews')).toHaveLength(0);
  });
});
