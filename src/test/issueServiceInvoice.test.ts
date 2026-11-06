// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryStore } from './support/memoryStore';
import { paidOrder, seededStore, SELLER_CONFIG } from './support/serverFixtures';

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

describe('ISSUE_SERVICE_INVOICE (consultation paid before the seller GSTIN was saved)', () => {
  let orderId: string;
  beforeEach(async () => {
    store = seededStore();
    orderId = (await paidOrder(store)).orderId;
    const order = store.read(`orders/${orderId}`)!;
    store.seed(`orders/${orderId}`, { ...order, kind: 'service', razorpayPaymentId: 'pay_svc1', flags: ['INVOICE_PENDING_SELLER_SETTINGS'] });
  });

  it('refuses while the seller is still not configured', async () => {
    const res = await call('finance', { action: 'ISSUE_SERVICE_INVOICE', orderId });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/GSTIN/);
    expect(store.read(`invoices/${orderId}`) ?? null).toBeNull();
  });

  it('issues the invoice once, clears the flag and is idempotent', async () => {
    store.seed('settings/store', { seller: SELLER_CONFIG.seller });
    const first = await call('finance', { action: 'ISSUE_SERVICE_INVOICE', orderId });
    expect(first.status).toBe(200);
    expect(first.body.invoiceNumber).toMatch(/^VX\/\d{2}-\d{2}\/\d{6}$/);
    const order = store.read(`orders/${orderId}`)!;
    expect(order.flags).not.toContain('INVOICE_PENDING_SELLER_SETTINGS');
    const again = await call('finance', { action: 'ISSUE_SERVICE_INVOICE', orderId });
    expect(again.body.invoiceNumber).toBe(first.body.invoiceNumber);
  });

  it('never invoices goods here and is limited to finance roles', async () => {
    store.seed('settings/store', { seller: SELLER_CONFIG.seller });
    expect((await call('support', { action: 'ISSUE_SERVICE_INVOICE', orderId })).status).toBe(403);
    const goods = store.read(`orders/${orderId}`)!;
    store.seed(`orders/${orderId}`, { ...goods, kind: undefined });
    expect((await call('finance', { action: 'ISSUE_SERVICE_INVOICE', orderId })).status).toBe(409);
  });
});
