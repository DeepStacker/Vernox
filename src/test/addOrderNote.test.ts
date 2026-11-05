// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseNotes, recordPackage } from '../lib/orders/orderNotes';
import type { MemoryStore } from './support/memoryStore';
import { paidOrder, seededStore } from './support/serverFixtures';

let store: MemoryStore;
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getStore: () => store, getAdminAuth: () => ({}) }));
vi.mock('../../api/_lib/rateLimit', async orig => ({ ...(await orig<object>()), enforceRateLimit: async () => undefined }));
vi.mock('../../api/_lib/auth', async orig => {
  const real = await orig<typeof import('../../api/_lib/auth')>();
  return {
    ...real,
    // The role travels in the bearer value so each case picks who is calling.
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

describe('ADD_ORDER_NOTE', () => {
  let orderId: string;
  beforeEach(async () => {
    store = seededStore();
    orderId = (await paidOrder(store)).orderId;
  });

  it('lets support append an attributed note and keeps the structured block', async () => {
    const withPackage = recordPackage(undefined, { lengthCm: 50, widthCm: 40, heightCm: 5, weightKg: 2 }, 'qc@vernox.in', 1);
    store.seed(`orders/${orderId}`, { ...store.read(`orders/${orderId}`)!, notes: withPackage });
    const res = await call('support', { action: 'ADD_ORDER_NOTE', orderId, note: 'Customer asked to hold delivery' });
    expect(res.status).toBe(200);
    const parsed = parseNotes(store.read(`orders/${orderId}`)!.notes as string);
    expect(parsed.text).toMatch(/support@vernox.in\] Customer asked to hold delivery$/);
    expect(parsed.data.package?.weightKg).toBe(2);
  });

  it('keeps earlier notes when several are added', async () => {
    await call('support', { action: 'ADD_ORDER_NOTE', orderId, note: 'first' });
    await call('order_manager', { action: 'ADD_ORDER_NOTE', orderId, note: 'second' });
    expect(parseNotes(store.read(`orders/${orderId}`)!.notes as string).text.split('\n')).toHaveLength(2);
  });

  it('refuses roles without customers.read and unknown orders', async () => {
    expect((await call('finance', { action: 'ADD_ORDER_NOTE', orderId, note: 'x' })).status).toBe(403);
    expect((await call('support', { action: 'ADD_ORDER_NOTE', orderId: 'doesnotexist1', note: 'x' })).status).toBe(404);
    expect((await call('support', { action: 'ADD_ORDER_NOTE', orderId, note: '   ' })).status).toBe(400);
  });
});
