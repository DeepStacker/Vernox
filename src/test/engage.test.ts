// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emailHash, type SubscriberDoc } from '../../api/_lib/newsletter';
import { reviewId } from '../../api/_lib/reviewSubmission';
import { OUTBOX_COLLECTION } from '../../api/_lib/notifications/outbox';
import { PLACEHOLDER_CONTACT } from '../types/settings';
import { renderNotification } from '../../api/_lib/notifications/templates';
import type { OutboxDoc } from '../../api/_lib/notifications/types';
import type { MemoryStore } from './support/memoryStore';
import { FakeBucket } from './support/fakeBucket';
import { seededStore } from './support/serverFixtures';

let store: MemoryStore;
let limited = false;
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getStore: () => store, getAdminAuth: () => ({}), getPhotoStorage: () => new FakeBucket() }));
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

const trade = {
  action: 'TRADE_ENQUIRY', name: 'Ravi Menon', email: 'Ravi@Studio.in', company: 'Studio M', phone: '', projectType: 'corporate-signage',
  volume: '10-25', alloyPreference: 'brass', timeline: '2-4 weeks', notes: 'Logo for reception', website: '',
};

describe('TRADE_ENQUIRY', () => {
  it('stores a pending enquiry in the admin shape and alerts the support inbox', async () => {
    store.seed('settings/store', { supportEmail: 'help@vernox.in' });
    const res = await call(trade);
    expect(res.status).toBe(200);
    const [enquiry] = store.collection('b2b_inquiries');
    expect(res.body.ref).toBe(`VNX-B2B-${enquiry.id.slice(0, 6).toUpperCase()}`);
    expect(enquiry.data).toMatchObject({ name: 'Ravi Menon', email: 'ravi@studio.in', company: 'Studio M', refId: res.body.ref, status: 'pending_review' });
    expect(enquiry.data).not.toHaveProperty('website');
    expect(enquiry.data).not.toHaveProperty('action');
    expect(typeof enquiry.data.createdAt).toBe('string');

    const outbox = store.collection(OUTBOX_COLLECTION)[0].data as unknown as OutboxDoc;
    expect(outbox.event).toBe('trade_enquiry');
    expect(outbox.channels).toEqual({ email: 'pending', sms: 'skipped', whatsapp: 'skipped' });
    const mail = renderNotification(outbox.event, outbox.payload);
    expect(mail.subject).toBe(`New trade enquiry ${res.body.ref}`);
    expect(mail.text).toContain('Ravi Menon (Studio M) <ravi@studio.in>');
    expect(mail.text).toContain(`Enquiry ${res.body.ref}`);
  });

  it('accepts a filled honeypot without storing anything', async () => {
    expect((await call({ ...trade, website: 'http://spam.example' })).status).toBe(200);
    expect(store.collection('b2b_inquiries')).toHaveLength(0);
    expect(store.collection(OUTBOX_COLLECTION)).toHaveLength(0);
  });

  it('rejects invalid email and values the form does not offer', async () => {
    expect((await call({ ...trade, email: 'nope' })).status).toBe(400);
    expect((await call({ ...trade, volume: '9999' })).status).toBe(400);
    expect((await call({ ...trade, alloyPreference: 'platinum' })).status).toBe(400);
    expect((await call({ ...trade, notes: 'x'.repeat(4001) })).status).toBe(400);
    expect(store.collection('b2b_inquiries')).toHaveLength(0);
  });

  it('is rate limited', async () => {
    limited = true;
    expect((await call(trade)).status).toBe(429);
    expect(store.collection('b2b_inquiries')).toHaveLength(0);
  });
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
    expect(outbox.channels).toEqual({ email: 'pending', sms: 'skipped', whatsapp: 'skipped' });
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

describe('newsletter double opt-in', () => {
  const subscribeBody = { action: 'NEWSLETTER_SUBSCRIBE', email: ' Reader@Example.com ', source: 'footer', website: '' };
  const hash = emailHash('reader@example.com');
  const doc = () => store.read(`newsletter_subscribers/${hash}`)! as unknown as SubscriberDoc;
  const outbox = () => store.collection(OUTBOX_COLLECTION).map(e => e.data as unknown as OutboxDoc);

  it('stores a pending subscriber, queues one confirmation email and never returns a token', async () => {
    const res = await call(subscribeBody);
    expect(res.body).toEqual({ success: true });
    expect(doc()).toMatchObject({ email: 'reader@example.com', status: 'pending', source: 'footer', confirmedAt: null });
    expect(doc().unsubscribeToken).toMatch(/^[0-9a-f]{48}$/);
    expect(doc().confirmToken).toMatch(/^[0-9a-f]{48}$/);
    const [mail] = outbox();
    expect(mail).toMatchObject({ event: 'newsletter_confirm', channels: { email: 'pending', sms: 'skipped' } });
    const rendered = renderNotification(mail.event, mail.payload, { VITE_SITE_URL: 'https://vernox.in' } as NodeJS.ProcessEnv);
    expect(rendered.text).toContain(`https://vernox.in/newsletter/confirm?h=${hash}&t=${doc().confirmToken}`);
    expect(rendered.subject).toBe('Please confirm your Vernox subscription');
  });

  it('gives the same answer for a pending address and sends at most one confirmation an hour', async () => {
    await call(subscribeBody);
    const first = doc();
    expect((await call(subscribeBody)).body).toEqual({ success: true });
    expect(doc()).toEqual(first);
    expect(outbox()).toHaveLength(1);
  });

  it('confirms with the token, records consent evidence, and is idempotent', async () => {
    await call(subscribeBody);
    const bad = { action: 'NEWSLETTER_CONFIRM', emailHash: hash, token: 'a'.repeat(48) };
    expect((await call(bad)).status).toBe(404);
    expect(doc().status).toBe('pending');

    const confirm = { action: 'NEWSLETTER_CONFIRM', emailHash: hash, token: doc().confirmToken };
    expect((await call(confirm)).status).toBe(200);
    const confirmed = doc();
    expect(confirmed).toMatchObject({ status: 'subscribed', source: 'footer' });
    expect(typeof confirmed.confirmedAt).toBe('number');
    expect(confirmed.confirmedIpHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await call(confirm)).status).toBe(200);
    expect(doc().confirmedAt).toBe(confirmed.confirmedAt);

    // A confirmed subscriber signing up again changes nothing and gets no second email.
    expect((await call(subscribeBody)).body).toEqual({ success: true });
    expect(outbox()).toHaveLength(1);
  });

  it('answers an unknown hash like a wrong token', async () => {
    expect((await call({ action: 'NEWSLETTER_CONFIRM', emailHash: 'f'.repeat(64), token: 'a'.repeat(48) })).status).toBe(404);
  });

  it('keeps subscribers from before double opt-in subscribed (no confirmedAt needed)', async () => {
    store.seed(`newsletter_subscribers/${hash}`, { email: 'reader@example.com', status: 'subscribed', source: 'footer', consentAt: 1, unsubscribedAt: null, unsubscribeToken: 't'.repeat(48), updatedAt: 1 });
    await call(subscribeBody);
    expect(doc().status).toBe('subscribed');
    expect(outbox()).toHaveLength(0);
  });

  it('unsubscribes with the token, idempotently; a stale confirm link cannot resubscribe; signing up again starts over', async () => {
    await call(subscribeBody);
    const { unsubscribeToken, confirmToken } = doc();
    expect((await call({ action: 'NEWSLETTER_UNSUBSCRIBE', emailHash: hash, token: 'a'.repeat(48) })).status).toBe(404);
    expect(doc().status).toBe('pending');

    const unsub = { action: 'NEWSLETTER_UNSUBSCRIBE', emailHash: hash, token: unsubscribeToken };
    expect((await call(unsub)).status).toBe(200);
    expect((await call(unsub)).status).toBe(200);
    expect(doc().status).toBe('unsubscribed');
    expect((await call({ action: 'NEWSLETTER_CONFIRM', emailHash: hash, token: confirmToken })).status).toBe(404);
    expect(doc().status).toBe('unsubscribed');

    await call(subscribeBody);
    expect(doc()).toMatchObject({ status: 'pending', unsubscribeToken, unsubscribedAt: null });
    expect(doc().confirmToken).not.toBe(confirmToken);
    expect(outbox()).toHaveLength(2);
  });

  it('answers an unknown unsubscribe hash like a wrong token', async () => {
    expect((await call({ action: 'NEWSLETTER_UNSUBSCRIBE', emailHash: 'f'.repeat(64), token: 'a'.repeat(48) })).status).toBe(404);
  });

  it('drops honeypot and invalid signups, and is rate limited', async () => {
    await call({ ...subscribeBody, website: 'x' });
    expect((await call({ ...subscribeBody, email: 'bad' })).status).toBe(400);
    expect(store.collection('newsletter_subscribers')).toHaveLength(0);
    expect(outbox()).toHaveLength(0);
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
