// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPublicCatalog, toJson } from '../../api/_lib/publicCatalog';
import { mapPublicCatalog } from '../lib/data/publicCatalog';
import { MemoryStore } from './support/memoryStore';

let store: MemoryStore;
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getStore: () => store }));
const { default: handler, resetCatalogMemo } = await import('../../api/catalog');

const stamp = (ms: number) => ({ toMillis: () => ms });

function seed() {
  store = new MemoryStore();
  store.seed('products/p1', { slug: 'om', name: 'Om', price: 2499, finishes: ['brass'], sizes: [], updatedAt: new Date(1_700_000_000_000) });
  store.seed('categories/spiritual', { name: 'Spiritual' });
  store.seed('topics/t1', { title: 'Care' });
  store.seed('settings/store', { storeName: 'Vernox', gstRatePercent: 5, adminEmail: 'owner@vernox.in', customPieces: { maxWidthMm: 1200 } });
  store.seed('reviews/r1', {
    productId: 'p1', customerName: 'Asha K.', rating: 5, comment: 'Lovely', placedAt: 2000, status: 'published', verified: true,
    userId: 'uid-secret', orderId: 'order-secret', photoPaths: ['review-uploads/uid-secret/a.webp'], photos: ['reviews/r1/1.webp'],
  });
  store.seed('reviews/r2', { productId: 'p1', customerName: 'Ravi', rating: 4, comment: 'Good', placedAt: 3000, status: 'published', userId: 'u2' });
  store.seed('reviews/r3', { productId: 'p1', customerName: 'Pending', rating: 1, comment: 'x', placedAt: 4000, status: 'pending', userId: 'u3' });
}

async function get() {
  const out: { status: number; headers: Record<string, string>; body: string } = { status: 0, headers: {}, body: '' };
  const res = {
    setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; return res; },
    status: (s: number) => { out.status = s; return res; },
    json: (b: unknown) => { out.body = JSON.stringify(b); return res; },
    end: (b: string) => { out.body = b; return res; },
  } as unknown as VercelResponse;
  await handler({ method: 'GET', headers: {}, query: {} } as unknown as VercelRequest, res);
  return out;
}

describe('public catalogue', () => {
  beforeEach(() => { seed(); resetCatalogMemo(); });

  it('publishes only public data: no reviewer ids, private uploads, pending reviews or admin email', async () => {
    const c = await buildPublicCatalog(store, 99);
    expect(c.products).toEqual([expect.objectContaining({ id: 'p1', slug: 'om', updatedAt: 1_700_000_000_000 })]);
    expect(c.reviews.map(r => r.id)).toEqual(['r2', 'r1']); // published only, newest first
    expect(c.reviews[1]).toEqual({
      id: 'r1', productId: 'p1', customerName: 'Asha K.', rating: 5, comment: 'Lovely', placedAt: 2000, status: 'published', verified: true,
      photos: ['reviews/r1/1.webp'],
    });
    const json = JSON.stringify(c);
    for (const secret of ['uid-secret', 'order-secret', 'review-uploads', 'owner@vernox.in']) expect(json).not.toContain(secret);
    expect(c.store).toMatchObject({ storeName: 'Vernox', customPieces: { maxWidthMm: 1200 } });
  });

  it('turns Firestore values into JSON', () => {
    expect(toJson({ a: stamp(5), b: [stamp(6), undefined], c: new Date(7), d: Number.NaN, e: undefined })).toEqual({ a: 5, b: [6, null], c: 7, d: null });
  });

  it('is served CDN-cacheable and maps to the same client shapes as the live reads', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60, s-maxage=60, stale-while-revalidate=600');
    const data = mapPublicCatalog(JSON.parse(res.body));
    expect(data.products[0]).toMatchObject({ id: 'p1', name: 'Om', finishes: ['brass'], stock: 0 });
    expect(data.storeConfig).toMatchObject({ storeName: 'Vernox', gstRatePercent: 5, currency: expect.any(String) });
    expect(data.reviews[0]).toMatchObject({ id: 'r2', customerName: 'Ravi' });
    expect(data.categories[0].id).toBe('spiritual');
  });

  it('shares one Firestore build between concurrent requests on a warm instance', async () => {
    const spy = vi.spyOn(store, 'query');
    await Promise.all([get(), get(), get()]);
    expect(spy.mock.calls.filter(([c]) => c === 'products')).toHaveLength(1);
    await get(); // still within the memo window
    expect(spy.mock.calls.filter(([c]) => c === 'products')).toHaveLength(1);
  });

  it('refuses writes', async () => {
    const out: { status: number } = { status: 0 };
    const res = { setHeader: () => res, status: (s: number) => { out.status = s; return res; }, json: () => res, end: () => res } as unknown as VercelResponse;
    await handler({ method: 'POST', headers: {}, query: {} } as unknown as VercelRequest, res);
    expect(out.status).toBe(405);
  });
});
