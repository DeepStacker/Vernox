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
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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
    await assertSucceeds(updateDoc(doc(shipping, 'orders/o1'), { status: 'Designing', updatedAt: 1 }));
    await assertFails(updateDoc(doc(shipping, 'orders/o1'), { total: 1 }));
    await assertFails(updateDoc(doc(as('f', { role: 'finance' }), 'orders/o1'), { notes: 'x' }));
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

  it('reviews: create pending as self; moderation by moderators only', async () => {
    const alice = as('alice');
    await assertSucceeds(setDoc(doc(alice, 'reviews/r2'), { userId: 'alice', status: 'pending', rating: 4, comment: 'Lovely' }));
    await assertFails(setDoc(doc(alice, 'reviews/r3'), { userId: 'alice', status: 'published', rating: 4, comment: 'x' }));
    await assertFails(setDoc(doc(alice, 'reviews/r4'), { userId: 'bob', status: 'pending', rating: 4, comment: 'x' }));
    await assertFails(updateDoc(doc(alice, 'reviews/r1'), { status: 'archived' }));
    await assertSucceeds(updateDoc(doc(as('sup', { role: 'support' }), 'reviews/r1'), { status: 'archived' }));
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
});
