// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTicket } from '../../api/_lib/tickets';
import { roleHasPermission } from '../types/admin';
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

describe('ticket actions', () => {
  let ticketId: string;
  beforeEach(async () => {
    store = seededStore();
    ({ id: ticketId } = await createTicket(store, {
      action: 'CONTACT', name: 'Asha', email: 'asha@example.com', topic: 'Order help', message: 'Where is my order?',
    }, 1000));
  });

  it('gives tickets.read and tickets.write to support, order manager and admins only', () => {
    for (const role of ['super_admin', 'admin', 'support', 'order_manager']) {
      expect(roleHasPermission(role, 'tickets.read')).toBe(true);
      expect(roleHasPermission(role, 'tickets.write')).toBe(true);
    }
    for (const role of ['catalog_manager', 'production', 'shipping', 'finance', 'designer']) {
      expect(roleHasPermission(role, 'tickets.read')).toBe(false);
      expect(roleHasPermission(role, 'tickets.write')).toBe(false);
    }
  });

  it('logs a reply: attributed message, open moves to waiting, first actor is assigned, audited', async () => {
    const res = await call('support', { action: 'ADD_TICKET_MESSAGE', ticketId, direction: 'reply', text: 'Shipping tomorrow' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('waiting');
    const t = store.read(`tickets/${ticketId}`)!;
    expect(t.assignedTo).toBe('support@vernox.in');
    expect(t.messages).toHaveLength(2);
    expect((t.messages as Array<{ by: string; direction: string }>)[1]).toMatchObject({ by: 'support@vernox.in', direction: 'reply' });
    expect(store.collection('audit_logs').some(a => a.data.action === 'TICKET_MESSAGE_ADDED' && a.data.targetId === ticketId)).toBe(true);
  });

  it('emails each reply to the customer once, and never emails a note', async () => {
    await call('support', { action: 'ADD_TICKET_MESSAGE', ticketId, direction: 'reply', text: 'Shipping tomorrow' });
    await call('support', { action: 'ADD_TICKET_MESSAGE', ticketId, direction: 'note', text: 'Checked with workshop' });
    await call('support', { action: 'ADD_TICKET_MESSAGE', ticketId, direction: 'reply', text: 'Shipped today' });
    const replies = store.collection('notifications_outbox').filter(n => n.data.event === 'ticket_reply');
    expect(replies.map(n => (n.data.payload as { note: string }).note)).toEqual(['Shipping tomorrow', 'Shipped today']);
    const t = store.read(`tickets/${ticketId}`)!;
    expect(replies.every(n => (n.data.payload as { email: string }).email === t.customerEmail)).toBe(true);
    expect(replies.every(n => (n.data.channels as { sms: string }).sms === 'skipped')).toBe(true);
  });

  it('an internal note keeps the status and does not steal the assignment', async () => {
    await call('support', { action: 'ADD_TICKET_MESSAGE', ticketId, direction: 'note', text: 'Check with workshop' });
    await call('order_manager', { action: 'ADD_TICKET_MESSAGE', ticketId, direction: 'note', text: 'Done' });
    const t = store.read(`tickets/${ticketId}`)!;
    expect(t.status).toBe('open');
    expect(t.assignedTo).toBe('support@vernox.in');
    expect(t.messages).toHaveLength(3);
  });

  it('changes status, audited', async () => {
    expect((await call('support', { action: 'SET_TICKET_STATUS', ticketId, status: 'resolved' })).status).toBe(200);
    expect(store.read(`tickets/${ticketId}`)!.status).toBe('resolved');
    expect(store.collection('audit_logs').some(a => a.data.action === 'TICKET_STATUS_SET')).toBe(true);
  });

  it('refuses roles without tickets.write, unknown tickets and bad input', async () => {
    expect((await call('finance', { action: 'SET_TICKET_STATUS', ticketId, status: 'resolved' })).status).toBe(403);
    expect((await call('designer', { action: 'ADD_TICKET_MESSAGE', ticketId, direction: 'note', text: 'x' })).status).toBe(403);
    expect((await call('support', { action: 'SET_TICKET_STATUS', ticketId: 'doesnotexist1', status: 'open' })).status).toBe(404);
    expect((await call('support', { action: 'SET_TICKET_STATUS', ticketId, status: 'closed' })).status).toBe(400);
    expect((await call('support', { action: 'ADD_TICKET_MESSAGE', ticketId, direction: 'reply', text: '   ' })).status).toBe(400);
    expect(store.read(`tickets/${ticketId}`)!.status).toBe('open');
  });
});
