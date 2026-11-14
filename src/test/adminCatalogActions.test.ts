// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryStore } from './support/memoryStore';
import { seededStore } from './support/serverFixtures';

let store: MemoryStore;
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getStore: () => store, getAdminAuth: () => ({}) }));
vi.mock('../../api/_lib/rateLimit', async orig => ({ ...(await orig<object>()), enforceRateLimit: async () => undefined }));
vi.mock('../../api/_lib/auth', async orig => {
  const real = await orig<typeof import('../../api/_lib/auth')>();
  return {
    ...real,
    requireStaff: async (req: VercelRequest, _verifier: unknown, permission: Parameters<typeof real.authoriseStaff>[1]) =>
      real.authoriseStaff({ uid: `u-${req.headers.authorization}`, email: `${req.headers.authorization}@vernox.in`, email_verified: true, role: req.headers.authorization, firebase: { sign_in_provider: 'google.com' } } as never, permission),
  };
});

const { default: handler } = await import('../../api/admin');

async function call(role: string, body: Record<string, unknown>) {
  const out: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
  const res = {
    setHeader: () => res,
    status: (s: number) => { out.status = s; return res; },
    json: (b: Record<string, unknown>) => { out.body = b; return res; },
  } as unknown as VercelResponse;
  await handler({ method: 'POST', headers: { authorization: role }, body, query: {}, socket: {} } as unknown as VercelRequest, res);
  return out;
}

describe('ADJUST_STOCK', () => {
  beforeEach(() => { store = seededStore(); });

  it('applies a delta, audits it and never goes below zero', async () => {
    const up = await call('catalog_manager', { action: 'ADJUST_STOCK', productId: 'p-01', delta: 5, reason: 'Restock' });
    expect(up.status).toBe(200);
    expect(store.read('products/p-01')!.stock).toBe(15);
    expect(store.collection('audit_logs').map(a => a.data.action)).toContain('STOCK_ADJUSTED');

    const tooMuch = await call('catalog_manager', { action: 'ADJUST_STOCK', productId: 'p-01', delta: -16 });
    expect(tooMuch.status).toBe(409);
    expect(store.read('products/p-01')!.stock).toBe(15);
  });

  it('is limited to roles with inventory.write and rejects bad input', async () => {
    expect((await call('support', { action: 'ADJUST_STOCK', productId: 'p-01', delta: 1 })).status).toBe(403);
    expect((await call('catalog_manager', { action: 'ADJUST_STOCK', productId: 'p-01', delta: 0 })).status).toBe(400);
    expect((await call('catalog_manager', { action: 'ADJUST_STOCK', productId: 'nope', delta: 1 })).status).toBe(404);
  });
});

describe('SAVE_COUPON limits', () => {
  const base = { code: 'SPRING10', discountType: 'percentage', discountValue: 10, isActive: true };
  beforeEach(() => { store = seededStore(); });

  it('clears expiry, caps and limits when they are sent as null', async () => {
    const created = await call('admin', {
      action: 'SAVE_COUPON',
      coupon: { ...base, maxDiscountLimit: 100, minOrderValue: 500, maxUsageCount: 10, maxUsagePerCustomer: 1, expiryDate: '2030-01-01' },
    });
    const id = (created.body.coupon as { id: string }).id;
    const cleared = await call('admin', {
      action: 'SAVE_COUPON',
      coupon: { ...base, id, maxDiscountLimit: null, minOrderValue: null, maxUsageCount: null, maxUsagePerCustomer: null, expiryDate: null, startDate: null },
    });
    expect(cleared.status).toBe(200);
    expect(store.read(`coupons/${id}`)).toMatchObject({
      maxDiscountLimit: null, minOrderValue: null, maxUsageCount: null, maxUsagePerCustomer: null, expiryDate: null, startDate: null,
    });
  });

  it('answers validation failures with a readable message', async () => {
    const res = await call('admin', { action: 'SAVE_COUPON', coupon: { ...base, code: 'ab' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBe('Code must be at least 3 characters.');
  });
});

describe('catalogue and settings writes through the API', () => {
  beforeEach(() => { store = seededStore(); });
  const product = (over: Record<string, unknown> = {}) => ({
    id: 'p-new', name: 'Om Panel', slug: 'om-panel', price: 1499, category: 'spiritual', finishes: ['brass'],
    sizes: [{ label: 'Small', widthMm: 300, heightMm: 300, priceDelta: 0 }, { label: 'Large', widthMm: 600, heightMm: 600, priceDelta: 900 }],
    stock: 7, description: 'Laser cut', ...over,
  });

  it('creates with stock, then replaces details while keeping the live stock', async () => {
    expect((await call('catalog_manager', { action: 'SAVE_PRODUCT', product: product() })).status).toBe(200);
    expect(store.read('products/p-new')).toMatchObject({ name: 'Om Panel', stock: 7 });
    store.seed('products/p-new', { ...store.read('products/p-new')!, stock: 4 }); // a reservation committed meanwhile
    const { description: _d, ...withoutDescription } = product({ name: 'Om Panel II', stock: 99 });
    expect((await call('catalog_manager', { action: 'SAVE_PRODUCT', product: withoutDescription })).status).toBe(200);
    const saved = store.read('products/p-new')!;
    expect(saved).toMatchObject({ name: 'Om Panel II', stock: 4 });
    expect(saved.description).toBeUndefined();
    expect(store.collection('audit_logs').filter(a => a.data.action === 'PRODUCT_SAVED')).toHaveLength(2);
  });

  it('refuses what checkout could not price or the storefront should not render', async () => {
    const bad = async (over: Record<string, unknown>) => (await call('catalog_manager', { action: 'SAVE_PRODUCT', product: product(over) })).status;
    expect(await bad({ price: 0 })).toBe(400);
    expect(await bad({ price: 10.005 })).toBe(400);
    expect(await bad({ sizes: [{ label: 'Tiny', priceDelta: -1499 }] })).toBe(400);
    expect(await bad({ imageUrl: 'javascript:alert(1)' })).toBe(400);
    expect(await bad({ slug: 'Om Panel' })).toBe(400);
    expect((await call('finance', { action: 'SAVE_PRODUCT', product: product() })).status).toBe(403);
  });

  it('validates the seller GST details and amounts on store settings, merging one level deep', async () => {
    const save = (updates: Record<string, unknown>, role = 'admin') => call(role, { action: 'SAVE_STORE_SETTINGS', updates });
    expect((await save({ seller: { legalName: 'Vernox LLP', gstin: '29ABCDE1234F1Z5', stateCode: '29', pincode: '560001' } })).status).toBe(200);
    expect((await save({ seller: { gstin: 'NOTAGSTIN' } })).status).toBe(400);
    expect((await save({ seller: { gstin: '29ABCDE1234F1Z5', stateCode: '27' } })).status).toBe(400);
    expect((await save({ codFee: -10 })).status).toBe(400);
    expect((await save({ codFee: 49 })).status).toBe(200);
    expect(store.read('settings/store')).toMatchObject({ codFee: 49, seller: { gstin: '29ABCDE1234F1Z5' } });
    expect((await save({ codFee: 49 }, 'catalog_manager')).status).toBe(403);
  });

  it('saves and deletes categories and topics with an audit entry', async () => {
    expect((await call('catalog_manager', { action: 'SAVE_CATEGORY', category: { id: 'festive', name: 'Festive', description: '' } })).status).toBe(200);
    expect((await call('catalog_manager', { action: 'DELETE_CATEGORY', id: 'festive' })).status).toBe(200);
    expect((await call('catalog_manager', { action: 'DELETE_CATEGORY', id: 'festive' })).status).toBe(404);
    expect((await call('catalog_manager', { action: 'SAVE_TOPIC', topic: { id: 't1', title: 'Care guide', content: 'Wipe dry.' } })).status).toBe(200);
    expect(store.collection('audit_logs').map(a => a.data.action)).toEqual(expect.arrayContaining(['CATEGORY_SAVED', 'CATEGORY_DELETED', 'TOPIC_SAVED']));
  });
});
