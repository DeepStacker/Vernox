// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewId, submitReview, submitReviewRequestSchema } from '../../api/_lib/reviewSubmission';
import type { MemoryStore } from './support/memoryStore';
import { FakeBucket } from './support/fakeBucket';
import { seededStore } from './support/serverFixtures';

let store: MemoryStore;
let bucket: FakeBucket;
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getStore: () => store, getAdminAuth: () => ({}), getPhotoStorage: () => bucket }));
vi.mock('../../api/_lib/rateLimit', async orig => ({ ...(await orig<object>()), enforceRateLimit: async () => undefined }));
vi.mock('../../api/_lib/auth', async orig => {
  const real = await orig<typeof import('../../api/_lib/auth')>();
  return {
    ...real,
    requireStaff: async (req: VercelRequest, _verifier: unknown, permission: Parameters<typeof real.authoriseStaff>[1]) =>
      real.authoriseStaff({ uid: `u-${req.headers.authorization}`, email: `${req.headers.authorization}@vernox.in`, email_verified: true, role: req.headers.authorization, firebase: { sign_in_provider: 'google.com' } } as never, permission),
  };
});

const { default: admin } = await import('../../api/admin');

async function call(role: string, body: Record<string, unknown>) {
  const out: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
  const res = {
    setHeader: () => res,
    status: (s: number) => { out.status = s; return res; },
    json: (b: Record<string, unknown>) => { out.body = b; return res; },
  } as unknown as VercelResponse;
  await admin({ method: 'POST', headers: { authorization: role }, body, query: {}, socket: {} } as unknown as VercelRequest, res);
  return out;
}

const user = { uid: 'alice', email: 'alice@example.com', emailVerified: true, signInProvider: 'google.com' } as never;
const mine = (file: string) => `review-uploads/alice/${file}`;
const input = (photoPaths?: string[]) => submitReviewRequestSchema.parse({ action: 'SUBMIT_REVIEW', productId: 'p-01', rating: 5, comment: 'Beautiful cut and finish.', ...(photoPaths ? { photoPaths } : {}) });
const RID = reviewId('alice', 'p-01');

beforeEach(() => {
  store = seededStore();
  bucket = new FakeBucket([mine('a.webp'), mine('b.webp'), 'review-uploads/mallory/m.webp']);
  store.seed('orders/o1', { id: 'o1', userId: 'alice', email: 'alice@example.com', status: 'Delivered', placedAt: 1, deliveredAt: 2, customer: { name: 'Alice W' }, items: [{ productId: 'p-01' }] });
});

describe('SUBMIT_REVIEW photos', () => {
  it('stores the caller\'s existing private photos on the pending review, never public ones', async () => {
    await submitReview(store, user, input([mine('a.webp'), mine('b.webp'), mine('a.webp')]), bucket);
    const stored = store.read(`reviews/${RID}`)!;
    expect(stored.photoPaths).toEqual([mine('a.webp'), mine('b.webp')]);
    expect(stored.photos).toBeUndefined();
    expect(bucket.copies).toHaveLength(0);
  });

  it('works without photos', async () => {
    await submitReview(store, user, input(), bucket);
    expect(store.read(`reviews/${RID}`)!.photoPaths).toBeUndefined();
  });

  it('rejects more than 3 paths at the schema', () => {
    expect(submitReviewRequestSchema.safeParse({ action: 'SUBMIT_REVIEW', productId: 'p-01', rating: 5, comment: 'Beautiful cut and finish.', photoPaths: ['a', 'b', 'c', 'd'] }).success).toBe(false);
  });

  it('rejects another customer\'s upload, foreign folders, traversal and bad file names', async () => {
    for (const bad of ['review-uploads/mallory/m.webp', 'reviews/x/1.webp', 'review-uploads/alice/../mallory/m.webp', mine('x.jpg'), mine('a/b.webp'), 'review-uploads/alice/']) {
      await expect(submitReview(store, user, input([bad]), bucket)).rejects.toMatchObject({ status: 400 });
    }
    expect(store.collection('reviews')).toHaveLength(0);
  });

  it('rejects a path whose object was never uploaded', async () => {
    await expect(submitReview(store, user, input([mine('missing.webp')]), bucket)).rejects.toMatchObject({ status: 400 });
    expect(store.collection('reviews')).toHaveLength(0);
  });
});

describe('review photo moderation (SAVE_REVIEW / DELETE_REVIEW)', () => {
  const publish = (status: string, extra: Record<string, unknown> = {}) =>
    call('support', { action: 'SAVE_REVIEW', review: { id: RID, productId: 'p-01', customerName: 'Alice W.', rating: 5, comment: 'Beautiful cut and finish.', status, ...extra } });

  beforeEach(async () => {
    await submitReview(store, user, input([mine('a.webp'), mine('b.webp')]), bucket);
  });

  it('keeps photos private while pending', async () => {
    expect((await publish('pending')).status).toBe(200);
    expect(store.read(`reviews/${RID}`)!.photos).toEqual([]);
    expect(bucket.copies).toHaveLength(0);
  });

  it('publishing copies each private photo to the public path once and stores the public paths', async () => {
    expect((await publish('published')).status).toBe(200);
    const expected = [`reviews/${RID}/1.webp`, `reviews/${RID}/2.webp`];
    expect(store.read(`reviews/${RID}`)).toMatchObject({ status: 'published', photos: expected, photoPaths: [mine('a.webp'), mine('b.webp')] });
    expect(bucket.copies).toEqual([[mine('a.webp'), expected[0]], [mine('b.webp'), expected[1]]]);
    // Re-saving (a reply, a featured toggle) neither re-copies nor duplicates.
    expect((await publish('published', { featured: true })).status).toBe(200);
    expect(bucket.copies).toHaveLength(2);
    expect(store.read(`reviews/${RID}`)!.photos).toEqual(expected);
  });

  it('ignores photo fields sent by the client', async () => {
    await publish('published', { photos: ['products/secret.webp'], photoPaths: ['review-uploads/mallory/m.webp'] });
    expect(store.read(`reviews/${RID}`)).toMatchObject({ photos: [`reviews/${RID}/1.webp`, `reviews/${RID}/2.webp`], photoPaths: [mine('a.webp'), mine('b.webp')] });
  });

  it('skips a private photo the customer deleted before publishing', async () => {
    bucket.objects.delete(mine('a.webp'));
    await publish('published');
    expect(store.read(`reviews/${RID}`)!.photos).toEqual([`reviews/${RID}/1.webp`]);
    expect(bucket.copies).toEqual([[mine('b.webp'), `reviews/${RID}/1.webp`]]);
  });

  it('leaves the review pending when the copy fails, so publishing can be retried', async () => {
    bucket.fail = true;
    expect((await publish('published')).status).toBe(500);
    expect(store.read(`reviews/${RID}`)!.status).toBe('pending');
    bucket.fail = false;
    expect((await publish('published')).status).toBe(200);
    expect(store.read(`reviews/${RID}`)!.photos).toHaveLength(2);
  });

  it('unpublishing or archiving removes the public copies and clears photos, keeping the private uploads', async () => {
    await publish('published');
    expect(bucket.objects.has(`reviews/${RID}/1.webp`)).toBe(true);
    await publish('archived');
    expect([...bucket.objects].filter(p => p.startsWith('reviews/'))).toEqual([]);
    expect(store.read(`reviews/${RID}`)).toMatchObject({ status: 'archived', photos: [], photoPaths: [mine('a.webp'), mine('b.webp')] });
    // Publishing again restores them, without duplicates.
    await publish('published');
    expect([...bucket.objects].filter(p => p.startsWith('reviews/'))).toHaveLength(2);
  });

  it('deleting the review removes the public copies and the private uploads', async () => {
    await publish('published');
    expect((await call('support', { action: 'DELETE_REVIEW', reviewId: RID })).status).toBe(200);
    expect(store.read(`reviews/${RID}`)).toBeUndefined();
    expect([...bucket.objects]).toEqual(['review-uploads/mallory/m.webp']);
  });

  it('is limited to reviews.moderate staff', async () => {
    expect((await call('finance', { action: 'SAVE_REVIEW', review: { id: RID, productId: 'p-01', customerName: 'A', rating: 5, comment: 'x', status: 'published' } })).status).toBe(403);
    expect(bucket.copies).toHaveLength(0);
  });
});
