// @vitest-environment node
/**
 * Firestore security rules tests. Requires the Firestore emulator:
 *   npm run test:rules
 * (wraps `firebase emulators:exec`, which sets FIRESTORE_EMULATOR_HOST). Skipped otherwise.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!emulator)('firestore.rules', () => {
  let env: RulesTestEnvironment;

  const google = { email_verified: true, firebase: { sign_in_provider: 'google.com' as const } };
  const as = (uid: string, claims: Record<string, unknown> = {}) => env.authenticatedContext(uid, { ...google, ...claims }).firestore();
  const guest = () => env.unauthenticatedContext().firestore();

  beforeAll(async () => {
    const [host, port] = emulator!.split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-vernox',
      firestore: { host, port: Number(port), rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'products/p-01'), { name: 'Frame', price: 189, stock: 10 });
      await setDoc(doc(db, 'orders/o1'), { userId: 'alice', email: 'alice@example.com', status: 'Paid', total: 100, amounts: { totalPaise: 10000 } });
      await setDoc(doc(db, 'coupons/c1'), { code: 'SAVE', usedCount: 3 });
      await setDoc(doc(db, 'audit_logs/a1'), { action: 'X' });
      await setDoc(doc(db, 'users/alice/spaces/s1'), { id: 's1', name: 'Living', roomType: 'living', walls: [], createdAt: 1, updatedAt: 1 });
      await setDoc(doc(db, 'consultations/o9'), { userId: 'alice', status: 'new', spaceName: 'Living', walls: [], proposal: null });
      await setDoc(doc(db, 'consultations/o9/private/draft'), { items: [], note: 'draft' });
      await setDoc(doc(db, 'reviews/r1'), { status: 'published', userId: 'bob', rating: 5, comment: 'ok' });
    });
  });

  it('catalog is public read, catalog-role write', async () => {
    await assertSucceeds(getDoc(doc(guest(), 'products/p-01')));
    await assertFails(updateDoc(doc(as('alice'), 'products/p-01'), { price: 1 }));
    await assertSucceeds(updateDoc(doc(as('cm', { role: 'catalog_manager' }), 'products/p-01'), { price: 199 }));
  });

  it('roles from unverified password accounts are ignored', async () => {
    const db = env.authenticatedContext('x', { role: 'super_admin', email_verified: false, firebase: { sign_in_provider: 'password' as const } }).firestore();
    await assertFails(updateDoc(doc(db, 'products/p-01'), { price: 1 }));
  });

  it('orders: owner/staff read, no client create, staff may change status only', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'orders/o1')));
    await assertFails(getDoc(doc(as('mallory'), 'orders/o1')));
    await assertFails(setDoc(doc(guest(), 'orders/o2'), { status: 'Paid', total: 1 }));
    await assertFails(setDoc(doc(as('alice'), 'orders/o2'), { userId: 'alice', status: 'Paid' }));
    const shipping = as('s', { role: 'shipping' });
    await assertSucceeds(updateDoc(doc(shipping, 'orders/o1'), { status: 'In_Design', updatedAt: 1 }));
    // Skipping stages, shipping and cancelling are API-only (invoice, stock, refunds, notifications).
    await assertFails(updateDoc(doc(shipping, 'orders/o1'), { status: 'Packed', updatedAt: 1 }));
    await assertFails(updateDoc(doc(shipping, 'orders/o1'), { status: 'Cancelled', updatedAt: 1 }));
    // QC / packing notes: a string of at most 20 000 characters.
    await assertSucceeds(updateDoc(doc(shipping, 'orders/o1'), { notes: 'QC pass', updatedAt: 2 }));
    await assertFails(updateDoc(doc(shipping, 'orders/o1'), { notes: 'x'.repeat(20_001), updatedAt: 3 }));
    await assertFails(updateDoc(doc(shipping, 'orders/o1'), { notes: { qc: true }, updatedAt: 4 }));
    await assertFails(updateDoc(doc(shipping, 'orders/o1'), { total: 1 }));
    await assertFails(updateDoc(doc(as('f', { role: 'finance' }), 'orders/o1'), { notes: 'x' }));
  });

  it('orders: a held order keeps its stage; clients cannot set or clear the hold', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'orders/o2'), { userId: 'alice', email: 'alice@example.com', status: 'Cutting', total: 100,
        hold: { kind: 'material_shortage', reason: 'brass sheet', by: 'p@vernox.in', at: 1 } });
    });
    const production = as('p', { role: 'production' });
    await assertFails(updateDoc(doc(production, 'orders/o2'), { status: 'Finishing', updatedAt: 1 }));
    await assertFails(updateDoc(doc(production, 'orders/o2'), { hold: null, updatedAt: 1 }));
    await assertSucceeds(updateDoc(doc(production, 'orders/o2'), { notes: 'Waiting for the supplier', updatedAt: 2 }));
    await assertFails(updateDoc(doc(production, 'orders/o1'), { hold: { kind: 'hold', reason: 'x', by: 'p', at: 1 } }));
  });

  it('coupons are staff-only and usedCount is not client-writable', async () => {
    await assertFails(getDoc(doc(guest(), 'coupons/c1')));
    await assertFails(getDoc(doc(as('alice'), 'coupons/c1')));
    await assertFails(updateDoc(doc(as('alice'), 'coupons/c1'), { usedCount: 0 }));
    const admin = as('a', { role: 'admin' });
    await assertSucceeds(getDoc(doc(admin, 'coupons/c1')));
    await assertFails(updateDoc(doc(admin, 'coupons/c1'), { usedCount: 0 }));
  });

  it('server-only collections are closed to clients; audit logs readable by super_admin', async () => {
    await assertFails(setDoc(doc(guest(), 'coupon_usages/u'), { x: 1 }));
    await assertFails(setDoc(doc(as('a', { role: 'super_admin' }), 'audit_logs/a2'), { action: 'forged' }));
    await assertFails(getDoc(doc(as('a', { role: 'admin' }), 'audit_logs/a1')));
    await assertSucceeds(getDoc(doc(as('a', { role: 'super_admin' }), 'audit_logs/a1')));
    await assertFails(getDoc(doc(as('a', { role: 'super_admin' }), 'idempotency/k')));
  });

  it('phase 2 collections are server-only, even for the order owner and super_admin', async () => {
    const owner = as('alice');
    const boss = as('a', { role: 'super_admin' });
    for (const path of ['invoices/o1', 'credit_notes/c1', 'counters/invoice_2026-27', 'refunds/r1', 'returns/o1',
      'notifications_outbox/o1_shipped', 'courier_events/e1', 'serviceability_cache/manual_560001', 'integrations/shiprocket']) {
      await assertFails(getDoc(doc(owner, path)));
      await assertFails(getDoc(doc(boss, path)));
      await assertFails(setDoc(doc(boss, path), { forged: true }));
    }
  });

  it('settings/store is public read, settings-role write', async () => {
    await assertSucceeds(getDoc(doc(guest(), 'settings/store')));
    await assertFails(setDoc(doc(as('alice'), 'settings/store'), { codFee: 0 }));
    await assertSucceeds(setDoc(doc(as('a', { role: 'admin' }), 'settings/store'), { codFee: 49 }));
  });

  it('reviews: no client create (the API verifies the purchase); moderation by moderators only', async () => {
    const alice = as('alice');
    await assertFails(setDoc(doc(alice, 'reviews/r2'), { userId: 'alice', status: 'pending', rating: 4, comment: 'Lovely' }));
    // Published reviews reach shoppers through /api/catalog without the author's ids; the document itself is private.
    await assertFails(getDoc(doc(guest(), 'reviews/r1')));
    await assertFails(getDoc(doc(alice, 'reviews/r1')));
    await assertSucceeds(getDoc(doc(as('bob'), 'reviews/r1')));
    await assertFails(updateDoc(doc(alice, 'reviews/r1'), { status: 'archived' }));
    await assertSucceeds(updateDoc(doc(as('sup', { role: 'support' }), 'reviews/r1'), { status: 'archived' }));
  });

  it('reviews: authors read their own pending review, others do not', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'reviews/r5'), { userId: 'alice', status: 'pending', rating: 4, comment: 'x' });
    });
    await assertSucceeds(getDoc(doc(as('alice'), 'reviews/r5')));
    await assertFails(getDoc(doc(as('bob'), 'reviews/r5')));
    await assertFails(getDoc(doc(guest(), 'reviews/r5')));
  });

  it('tickets: read by tickets.read roles only; nobody writes from a client', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'tickets/t1'), { customerEmail: 'alice@example.com', status: 'open', messages: [] });
    });
    for (const role of ['support', 'order_manager', 'admin', 'super_admin']) {
      await assertSucceeds(getDoc(doc(as('s', { role }), 'tickets/t1')));
    }
    for (const role of ['finance', 'shipping', 'catalog_manager', 'designer']) {
      await assertFails(getDoc(doc(as('s', { role }), 'tickets/t1')));
    }
    await assertFails(getDoc(doc(as('alice'), 'tickets/t1')));
    await assertFails(getDoc(doc(guest(), 'tickets/t1')));
    await assertFails(setDoc(doc(guest(), 'tickets/t2'), { status: 'open' }));
    await assertFails(updateDoc(doc(as('s', { role: 'support' }), 'tickets/t1'), { status: 'resolved' }));
    await assertFails(setDoc(doc(as('s', { role: 'super_admin' }), 'tickets/t2'), { status: 'open' }));
  });

  it('newsletter subscribers hold emails and tokens: closed to every client', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'newsletter_subscribers/h1'), { email: 'a@b.in', unsubscribeToken: 't' });
    });
    for (const ctx of [guest(), as('alice'), as('boss', { role: 'super_admin' })]) {
      await assertFails(getDoc(doc(ctx, 'newsletter_subscribers/h1')));
      await assertFails(setDoc(doc(ctx, 'newsletter_subscribers/h2'), { email: 'x@y.in' }));
    }
  });

  it('users cannot grant themselves roles', async () => {
    const alice = as('alice');
    await assertSucceeds(setDoc(doc(alice, 'users/alice'), { name: 'Alice' }));
    await assertFails(setDoc(doc(alice, 'users/alice'), { name: 'Alice', role: 'admin' }));
    await assertFails(updateDoc(doc(alice, 'users/alice'), { isAdmin: true }));
    await assertFails(getDoc(doc(as('bob'), 'users/alice')));
  });

  it('b2b inquiries: validated public create, staff read', async () => {
    const inquiry = { name: 'Ravi', email: 'ravi@studio.in', company: 'Studio', notes: '', status: 'pending_review' };
    await assertSucceeds(setDoc(doc(guest(), 'b2b_inquiries/b1'), inquiry));
    await assertFails(setDoc(doc(guest(), 'b2b_inquiries/b2'), { ...inquiry, email: 'nope' }));
    await assertFails(setDoc(doc(guest(), 'b2b_inquiries/b3'), { ...inquiry, isAdmin: true }));
    await assertFails(getDoc(doc(guest(), 'b2b_inquiries/b1')));
    await assertSucceeds(getDoc(doc(as('sup', { role: 'support' }), 'b2b_inquiries/b1')));
  });

  const space = { id: 's2', name: 'Bedroom', roomType: 'bedroom', budgetBand: null, notes: '', walls: [], createdAt: 1, updatedAt: 1 };

  it('spaces: private to the owner, shape and size bounded', async () => {
    const alice = as('alice');
    await assertSucceeds(getDoc(doc(alice, 'users/alice/spaces/s1')));
    await assertSucceeds(setDoc(doc(alice, 'users/alice/spaces/s2'), space));
    await assertSucceeds(setDoc(doc(alice, 'users/alice/spaces/s2'), { ...space, notes: 'warm', walls: [{ id: 'w1', name: 'Wall', widthCm: 300, heightCm: 240 }] }));
    await assertSucceeds(deleteDoc(doc(alice, 'users/alice/spaces/s2')));
    // Nobody else reads or writes it: another customer, a guest, and every staff role (designers included).
    for (const db of [as('mallory'), guest(), as('a', { role: 'admin' }), as('s', { role: 'super_admin' }), as('d', { role: 'designer' }), as('sup', { role: 'support' })]) {
      await assertFails(getDoc(doc(db, 'users/alice/spaces/s1')));
      await assertFails(setDoc(doc(db, 'users/alice/spaces/s3'), space));
      await assertFails(deleteDoc(doc(db, 'users/alice/spaces/s1')));
    }
    await assertFails(setDoc(doc(as('mallory'), 'users/alice/spaces/s4'), space));
    // Bounds: name, room type, wall count, unknown fields.
    await assertFails(setDoc(doc(alice, 'users/alice/spaces/s5'), { ...space, name: '' }));
    await assertFails(setDoc(doc(alice, 'users/alice/spaces/s5'), { ...space, name: 'x'.repeat(81) }));
    await assertFails(setDoc(doc(alice, 'users/alice/spaces/s5'), { ...space, roomType: 'garage' }));
    await assertFails(setDoc(doc(alice, 'users/alice/spaces/s5'), { ...space, walls: Array.from({ length: 9 }, (_, i) => ({ id: `w${i}` })) }));
    await assertFails(setDoc(doc(alice, 'users/alice/spaces/s5'), { ...space, isShared: true }));
    // The customers console (users.read) does not expose spaces.
    await assertFails(getDoc(doc(as('sup', { role: 'support' }), 'users/alice/spaces/s1')));
  });

  it('consultations: owner and consultation staff read; nobody writes; drafts are staff-only', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'consultations/o9')));
    await assertFails(getDoc(doc(as('mallory'), 'consultations/o9')));
    await assertFails(getDoc(doc(guest(), 'consultations/o9')));
    for (const role of ['designer', 'admin', 'super_admin']) {
      await assertSucceeds(getDoc(doc(as('x', { role }), 'consultations/o9')));
      await assertSucceeds(getDoc(doc(as('x', { role }), 'consultations/o9/private/draft')));
    }
    for (const role of ['support', 'order_manager', 'finance', 'catalog_manager']) {
      await assertFails(getDoc(doc(as('x', { role }), 'consultations/o9')));
    }
    // The customer never sees the draft; no client writes a consultation, a draft or a proposal.
    await assertFails(getDoc(doc(as('alice'), 'consultations/o9/private/draft')));
    for (const db of [as('alice'), as('d', { role: 'designer' }), as('a', { role: 'super_admin' })]) {
      await assertFails(updateDoc(doc(db, 'consultations/o9'), { status: 'closed' }));
      await assertFails(setDoc(doc(db, 'consultations/o10'), { userId: 'alice' }));
      await assertFails(setDoc(doc(db, 'consultations/o9/private/draft'), { items: [] }));
    }
  });

  it('designer cannot read orders, customers, coupons, staff, audit logs or write the catalogue and settings', async () => {
    const d = as('d', { role: 'designer' });
    await assertSucceeds(getDoc(doc(d, 'products/p-01')));
    await assertFails(getDoc(doc(d, 'orders/o1')));
    await assertFails(getDoc(doc(d, 'users/alice')));
    await assertFails(getDoc(doc(d, 'coupons/c1')));
    await assertFails(getDoc(doc(d, 'audit_logs/a1')));
    await assertFails(getDoc(doc(d, 'staff/alice')));
    await assertFails(updateDoc(doc(d, 'products/p-01'), { price: 1 }));
    await assertFails(setDoc(doc(d, 'settings/store'), { codFee: 0 }));
    await assertFails(updateDoc(doc(d, 'orders/o1'), { status: 'In_Design', updatedAt: 1 }));
  });
});
