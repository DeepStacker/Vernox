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
