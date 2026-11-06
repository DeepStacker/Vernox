// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryStore } from './support/memoryStore';
import { paidOrder, seededStore, setStatus } from './support/serverFixtures';

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

describe('order hold and material shortage', () => {
  let orderId: string;
  beforeEach(async () => {
    store = seededStore();
    orderId = (await paidOrder(store)).orderId;
    setStatus(store, orderId, 'Cutting');
  });

  it('production flags a material shortage; the stage cannot advance until it is released', async () => {
    const set = await call('production', { action: 'SET_ORDER_HOLD', orderId, kind: 'material_shortage', reason: '2 mm brass sheet' });
    expect(set.status).toBe(200);
    expect(store.read(`orders/${orderId}`)!.hold).toMatchObject({ kind: 'material_shortage', reason: '2 mm brass sheet', by: 'production@vernox.in' });

    const blocked = await call('production', { action: 'UPDATE_ORDER_STATUS', orderId, status: 'Finishing' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/waiting for material: 2 mm brass sheet/);
    expect(store.read(`orders/${orderId}`)!.status).toBe('Cutting');

    expect((await call('order_manager', { action: 'RELEASE_ORDER_HOLD', orderId })).status).toBe(200);
    expect(store.read(`orders/${orderId}`)!.hold).toBeNull();
    expect((await call('production', { action: 'UPDATE_ORDER_STATUS', orderId, status: 'Finishing' })).status).toBe(200);
    const audits = store.collection('audit_logs').map(a => a.data.action);
    expect(audits).toEqual(expect.arrayContaining(['ORDER_HOLD_SET', 'ORDER_HOLD_RELEASED']));
  });

  it('a held order can still be cancelled', async () => {
    await call('order_manager', { action: 'SET_ORDER_HOLD', orderId, kind: 'hold', reason: 'Customer asked to wait' });
    const res = await call('admin', { action: 'CANCEL_ORDER', orderId, reason: 'Customer changed plans', refund: false });
    expect(res.status).toBe(200);
    expect(store.read(`orders/${orderId}`)!.status).toBe('Cancelled');
  });

  it('refuses roles without orders.update_status, shipped orders and empty reasons', async () => {
    expect((await call('finance', { action: 'SET_ORDER_HOLD', orderId, kind: 'hold', reason: 'x y z' })).status).toBe(403);
    expect((await call('order_manager', { action: 'SET_ORDER_HOLD', orderId, kind: 'hold', reason: '' })).status).toBe(400);
    expect((await call('order_manager', { action: 'RELEASE_ORDER_HOLD', orderId })).status).toBe(409);
    setStatus(store, orderId, 'Shipped');
    expect((await call('order_manager', { action: 'SET_ORDER_HOLD', orderId, kind: 'hold', reason: 'Too late' })).status).toBe(409);
  });
});
