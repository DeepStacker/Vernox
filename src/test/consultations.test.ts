// @vitest-environment node
/**
 * Design consultation (Stage 2): purchase through the prepaid checkout with a server-priced service
 * line, the consultation and single-use credit coupon created on payment, the coupon's per-customer
 * binding, and the proposal workflow. Uses the in-memory store and a fake gateway; Razorpay itself is
 * not reachable from tests.
 */
import { describe, expect, it } from 'vitest';
import { createCheckoutIntent } from '../../api/_lib/checkout';
import { purchaseConsultation } from '../../api/_lib/consultationPurchase';
import { generateCreditCode, wallSnapshotPath, type PhotoStorage } from '../../api/_lib/consultations';
import { ApiError } from '../../api/_lib/errors';
import { confirmPayment } from '../../api/_lib/payments';
import { claimConsultation, closeConsultation, requestRevision, saveProposalDraft, sendProposal } from '../../api/_lib/proposals';
import { computeTotals, priceConsultationLine } from '../../api/_lib/pricing';
import { defaultStoreConfig, mergeStoreConfig } from '../../api/_lib/storeConfig';
import { previewCoupon } from '../../api/_lib/checkout';
import type { ConsultationDoc, ProposalItem } from '../../src/types/consultation';
import { MemoryStore } from './support/memoryStore';
import { FakeGateway, NOW, SELLER_CONFIG, checkoutRequest, deps, seededStore } from './support/serverFixtures';

const UID = 'user-1';
const USER = { uid: UID, email: 'asha@example.com', emailVerified: true, signInProvider: 'google.com' };
const config = (consultation: Record<string, unknown> = {}) =>
  mergeStoreConfig(SELLER_CONFIG, { consultation: { enabled: true, priceInr: 999, ...consultation } });

const wall = (id: string, withPhoto = true) => ({
  id, name: `Wall ${id}`, widthCm: 300, heightCm: 240, pxPerCm: 4, notes: 'sofa below',
  photoPath: withPhoto ? `spaces/${UID}/s1/${id}.jpg` : null, photoWidth: 1200, photoHeight: 960,
});

function seedSpace(store: MemoryStore, walls = [wall('w1'), wall('w2', false)], uid = UID) {
  store.seed(`users/${uid}/spaces/s1`, { id: 's1', name: 'Living room', roomType: 'living', budgetBand: '10k_25k', notes: 'warm colours', walls, createdAt: 1, updatedAt: 1 });
}

const request = (overrides: Record<string, unknown> = {}) => ({
  spaceId: 's1', idempotencyKey: 'consult-key-0001', name: 'Asha Rao', phone: '+91 98765 43210', state: 'Karnataka', ...overrides,
});

class FakeStorage implements PhotoStorage {
  copied: Array<[string, string]> = [];
  fail = false;
  async copy(from: string, to: string) {
    if (this.fail) throw new Error('storage down');
    this.copied.push([from, to]);
  }
}

function consultationDeps(store: MemoryStore, cfg = config()) {
  return { ...deps(store), config: cfg };
}

async function buy(store: MemoryStore, cfg = config(), storage = new FakeStorage()) {
  const res = await purchaseConsultation(consultationDeps(store, cfg), USER, request());
  await confirmPayment(store, { orderId: res.orderId, razorpayPaymentId: 'pay_c1', source: 'checkout_callback', now: NOW, photoStorage: storage });
  return { res, storage };
}

describe('consultation pricing', () => {
  it('taxes the service at its own SAC rate (18%), not the 5% goods rate', () => {
    const line = priceConsultationLine(defaultStoreConfig({} as NodeJS.ProcessEnv));
    expect(defaultStoreConfig({} as NodeJS.ProcessEnv).gstRateBps).toBe(500);
    expect(line.gstRateBps).toBe(1800);
    expect(config({ gstRatePercent: 12 }).consultation.gstRateBps).toBe(1200);
  });

  it('prices the service from settings, with GST at the service rate and no shipping', () => {
    const line = priceConsultationLine(config());
    expect(line).toMatchObject({ productId: 'design-consultation', unitPricePaise: 99_900, isService: true, hsnCode: '998391', gstRateBps: 1800 });
    const totals = computeTotals([line], 0, config());
    expect(totals.shippingPaise).toBe(0);
    expect(totals.taxPaise).toBe(17_982);
    expect(totals.totalPaise).toBe(117_882);
  });

  it('ignores an invalid fee in settings and keeps the default', () => {
    expect(config({ priceInr: 0 }).consultation.pricePaise).toBe(99_900);
    expect(config({ priceInr: 1499 }).consultation.pricePaise).toBe(149_900);
  });

  it('cannot be bought through the public checkout (no such product)', async () => {
    const store = seededStore();
    await expect(
      createCheckoutIntent(deps(store), checkoutRequest({ items: [{ productId: 'design-consultation', finish: 'service', quantity: 1 }] }), null),
    ).rejects.toMatchObject({ code: 'INVALID_ITEM' });
  });
});

describe('consultation purchase', () => {
  it('snapshots the space and creates a prepaid service order priced by the server', async () => {
    const store = new MemoryStore();
    seedSpace(store);
    const res = await purchaseConsultation(consultationDeps(store), USER, request());
    expect(res.amount).toBe(117_882);
    const order = store.read(`orders/${res.orderId}`)!;
    expect(order).toMatchObject({ kind: 'service', status: 'Pending_Payment', userId: UID, email: 'asha@example.com', paymentMethod: 'prepaid' });
    expect(order.consultation).toMatchObject({ spaceId: 's1', creditTowardsOrder: true, creditValidityDays: 60, turnaroundDays: 3 });
    expect((order.stockReservation as { status: string }).status).toBe('none');
  });

  it('is idempotent for the same key', async () => {
    const store = new MemoryStore();
    seedSpace(store);
    const a = await purchaseConsultation(consultationDeps(store), USER, request());
    const b = await purchaseConsultation(consultationDeps(store), USER, request());
    expect(b.orderId).toBe(a.orderId);
  });

  it('refuses when disabled, when the space is missing or someone else\'s, and when no wall has a photo', async () => {
    const store = new MemoryStore();
    seedSpace(store);
    await expect(purchaseConsultation(consultationDeps(store, config({ enabled: false })), USER, request())).rejects.toMatchObject({ status: 409 });
    await expect(purchaseConsultation(consultationDeps(store), USER, request({ spaceId: 'nope' }))).rejects.toMatchObject({ status: 404 });
    await expect(purchaseConsultation(consultationDeps(store), { ...USER, uid: 'mallory' }, request())).rejects.toMatchObject({ status: 404 });
    seedSpace(store, [wall('w1', false)]);
    await expect(purchaseConsultation(consultationDeps(store), USER, request({ idempotencyKey: 'consult-key-0002' }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('drops a photo path that is not the wall\'s own (a tampered space document)', async () => {
    const store = new MemoryStore();
    seedSpace(store, [{ ...wall('w1'), photoPath: 'spaces/other-user/s9/w1.jpg' }, wall('w2')]);
    const res = await purchaseConsultation(consultationDeps(store), USER, request());
    const walls = (store.read(`orders/${res.orderId}`)!.consultation as { walls: Array<{ id: string; photoPath: string | null }> }).walls;
    expect(walls.find(w => w.id === 'w1')!.photoPath).toBeNull();
    expect(walls.find(w => w.id === 'w2')!.photoPath).toBe(`spaces/${UID}/s1/w2.jpg`);
  });
});

describe('payment confirmation', () => {
  it('creates the consultation, copies the photos and issues a bound single-use credit coupon', async () => {
    const store = new MemoryStore();
    seedSpace(store);
    const { res, storage } = await buy(store);

    const c = store.read(`consultations/${res.orderId}`) as unknown as ConsultationDoc;
    expect(c).toMatchObject({ status: 'new', userId: UID, spaceName: 'Living room', pricePaise: 99_900, turnaroundDays: 3, photosReady: true });
    expect(c.dueAt).toBe(NOW + 3 * 24 * 3600_000);
    expect(c.walls.find(w => w.id === 'w1')!.photoPath).toBe(wallSnapshotPath(res.orderId, 'w1'));
    expect(storage.copied).toEqual([[`spaces/${UID}/s1/w1.jpg`, wallSnapshotPath(res.orderId, 'w1')]]);

    expect(c.credit).toMatchObject({ amountInr: 999, expiresAt: NOW + 60 * 24 * 3600_000 });
    const coupon = store.read(`coupons/cc_${res.orderId}`)!;
    expect(coupon).toMatchObject({ code: c.credit!.code, boundEmail: 'asha@example.com', maxUsageCount: 1, discountType: 'fixed', discountValue: 999, consultationId: res.orderId });
    expect(c.credit!.code).toMatch(/^DESIGN-[A-Z2-9]{8}$/);

    const mail = store.read(`notifications_outbox/${res.orderId}_order_confirmed`)!;
    expect(mail.payload).toMatchObject({ service: 'consultation', creditCode: c.credit!.code, creditPaise: 99_900 });
  });

  it('does not create a second consultation or coupon for a duplicate confirmation', async () => {
    const store = new MemoryStore();
    seedSpace(store);
    const { res } = await buy(store);
    const before = store.read(`coupons/cc_${res.orderId}`);
    await confirmPayment(store, { orderId: res.orderId, razorpayPaymentId: 'pay_c1', source: 'webhook', now: NOW });
    expect(store.read(`coupons/cc_${res.orderId}`)).toEqual(before);
  });

  it('issues no coupon when credit is switched off', async () => {
    const store = new MemoryStore();
    seedSpace(store);
    const { res } = await buy(store, config({ creditTowardsOrder: false }));
    expect(store.read(`coupons/cc_${res.orderId}`)).toBeUndefined();
    expect((store.read(`consultations/${res.orderId}`) as unknown as ConsultationDoc).credit).toBeNull();
  });

  it('leaves photosReady false when the copy fails and retries it on claim', async () => {
    const store = new MemoryStore();
    seedSpace(store);
    const failing = new FakeStorage();
    failing.fail = true;
    const { res } = await buy(store, config(), failing);
    expect((store.read(`consultations/${res.orderId}`) as unknown as ConsultationDoc).photosReady).toBe(false);
    const working = new FakeStorage();
    const claimed = await claimConsultation(store, working, { id: res.orderId, actor: { uid: 'd1', email: 'dee@vernox.in', role: 'designer' } });
    expect(claimed.photosReady).toBe(true);
    expect(working.copied).toHaveLength(1);
  });

  it('keeps consultation orders out of the shipped-goods rules: customers cannot cancel them', async () => {
    const store = new MemoryStore();
    seedSpace(store);
    const { res } = await buy(store);
    const { cancelOrder } = await import('../../api/_lib/cancellation');
    await expect(
      cancelOrder(store, null, { orderId: res.orderId, reason: 'x', initiatedBy: 'customer', actor: { uid: UID, email: USER.email, role: 'system' } }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('GST invoice for the consultation (a service: invoiced on payment, not at dispatch)', () => {
  it('issues the invoice with the SAC code when the seller is configured', async () => {
    const store = seededStore();
    store.seed('settings/store', { seller: SELLER_CONFIG.seller });
    seedSpace(store);
    const { res } = await buy(store);
    const order = store.read(`orders/${res.orderId}`)!;
    expect(order.status).toBe('Paid');
    expect(order.invoiceNumber).toMatch(/^VX\/\d{2}-\d{2}\/\d{6}$/);
    const invoice = store.read(`invoices/${res.orderId}`) as { lines: Array<{ hsnCode: string }> } | undefined;
    expect(invoice?.lines.map(l => l.hsnCode)).toEqual([config().consultation.sacCode]);
  });

  it('still confirms the payment when seller details are missing, and flags the invoice for finance', async () => {
    const store = seededStore();
    seedSpace(store);
    const { res } = await buy(store);
    const order = store.read(`orders/${res.orderId}`)!;
    expect(order.status).toBe('Paid');
    expect(order.invoiceNumber ?? null).toBeNull();
    expect(order.flags).toContain('INVOICE_PENDING_SELLER_SETTINGS');
    expect(store.read(`invoices/${res.orderId}`) ?? null).toBeNull();
  });
});

describe('credit coupon', () => {
  const frame = [{ productId: 'p-01', sizeLabel: 'Medium · 50cm', finish: 'brass', quantity: 6 }]; // ₹1,614, above the ₹999 credit

  async function setup() {
    const store = seededStore();
    seedSpace(store);
    const { res } = await buy(store);
    const code = (store.read(`consultations/${res.orderId}`) as unknown as ConsultationDoc).credit!.code;
    return { store, res, code };
  }

  it('discounts the buyer\'s next order by the consultation fee and is redeemed exactly once', async () => {
    const { store, res, code } = await setup();
    const preview = await previewCoupon(store, SELLER_CONFIG, { code, items: frame, customerEmail: 'Asha@Example.com' }, NOW);
    expect(preview.evaluation).toMatchObject({ ok: true, discountPaise: 99_900 });

    const order = await createCheckoutIntent(deps(store), checkoutRequest({ items: frame, couponCode: code, idempotencyKey: 'idem-key-0002' }), UID);
    await confirmPayment(store, { orderId: order.orderId, razorpayPaymentId: 'pay_c2', source: 'checkout_callback', now: NOW });
    expect(store.read(`coupons/cc_${res.orderId}`)).toMatchObject({ usedCount: 1 });
    expect(store.read(`consultations/${res.orderId}`)).toMatchObject({ creditRedeemedOrderId: order.orderId, creditRedeemedAt: NOW });

    await expect(
      createCheckoutIntent(deps(store), checkoutRequest({ items: frame, couponCode: code, idempotencyKey: 'idem-key-0003' }), UID),
    ).rejects.toMatchObject({ code: 'INVALID_COUPON' });
  });

  it('is refused for another customer, and for a request that names no email', async () => {
    const { store, code } = await setup();
    const other = { customer: { ...checkoutRequest().customer, email: 'mallory@example.com' } };
    await expect(
      createCheckoutIntent(deps(store), checkoutRequest({ items: frame, couponCode: code, idempotencyKey: 'idem-key-0004', ...other }), null),
    ).rejects.toMatchObject({ code: 'INVALID_COUPON', message: 'This coupon was issued to another customer.' });
    const anonymous = await previewCoupon(store, SELLER_CONFIG, { code, items: frame }, NOW);
    expect(anonymous.evaluation).toMatchObject({ ok: false, errorCode: 'COUPON_NOT_FOR_CUSTOMER' });
  });

  it('expires after its validity period', async () => {
    const { store, code } = await setup();
    const late = NOW + 61 * 24 * 3600_000;
    const result = await previewCoupon(store, SELLER_CONFIG, { code, items: frame, customerEmail: 'asha@example.com' }, late);
    expect(result.evaluation).toMatchObject({ ok: false, errorCode: 'COUPON_EXPIRED' });
  });
});

describe('credit codes', () => {
  it('are readable and use the DESIGN- prefix', () => {
    expect(generateCreditCode(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]))).toBe('DESIGN-ABCDEFGH');
  });
});

describe('proposal workflow', () => {
  const designer = { uid: 'd1', email: 'dee@vernox.in', role: 'designer' as const };
  const otherDesigner = { uid: 'd2', email: 'eve@vernox.in', role: 'designer' as const };
  const admin = { uid: 'a1', email: 'boss@vernox.in', role: 'admin' as const };

  const item = (id: string, overrides: Partial<ProposalItem> = {}, consultationId = ''): ProposalItem => ({
    id, wallId: 'w1', kind: 'catalogue', productId: 'p-01', productName: 'Ember Round Frame', sizeLabel: 'Medium · 50cm',
    widthMm: 500, heightMm: 500, finish: 'brass', designRef: null, pose: { cx: 100, cy: 80, rotationDeg: 0 },
    previewPath: `consultations/${consultationId}/previews/${id}.png`, note: '', ...overrides,
  });

  async function setup() {
    const store = seededStore();
    seedSpace(store);
    const { res } = await buy(store);
    return { store, id: res.orderId };
  }

  it('claim moves new to in progress and is exclusive between designers (admins may take over)', async () => {
    const { store, id } = await setup();
    const c = await claimConsultation(store, null, { id, actor: designer });
    expect(c).toMatchObject({ status: 'in_progress', assignedUid: 'd1' });
    await expect(claimConsultation(store, null, { id, actor: otherDesigner })).rejects.toMatchObject({ status: 409 });
    await expect(claimConsultation(store, null, { id, actor: admin })).resolves.toMatchObject({ assignedUid: 'a1' });
  });

  it('only the assignee edits the draft, and previews must belong to the consultation', async () => {
    const { store, id } = await setup();
    await expect(saveProposalDraft(store, { id, actor: designer, draft: { items: [], note: '' } })).rejects.toMatchObject({ status: 409 });
    await claimConsultation(store, null, { id, actor: designer });
    await expect(saveProposalDraft(store, { id, actor: otherDesigner, draft: { items: [], note: '' } })).rejects.toMatchObject({ status: 409 });
    await expect(
      saveProposalDraft(store, { id, actor: designer, draft: { items: [item('i1', { previewPath: 'consultations/other/previews/i1.png' })], note: '' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      saveProposalDraft(store, { id, actor: designer, draft: { items: [item('i1', { wallId: 'zzz' }, id)], note: '' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await saveProposalDraft(store, { id, actor: designer, draft: { items: [item('i1', {}, id)], note: 'Hello' } });
    expect(store.read(`consultations/${id}/private/draft`)).toMatchObject({ note: 'Hello', updatedBy: 'd1' });
  });

  it('sends a validated proposal, notifies once per version and shows nothing to the customer before', async () => {
    const { store, id } = await setup();
    await claimConsultation(store, null, { id, actor: designer });
    await expect(sendProposal(store, config(), { id, actor: designer, now: NOW })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await saveProposalDraft(store, { id, actor: designer, draft: { items: [item('i1', { sizeLabel: 'Huge', widthMm: 123, heightMm: 123 }, id)], note: '' } });
    await expect(sendProposal(store, config(), { id, actor: designer, now: NOW })).rejects.toMatchObject({ code: 'INVALID_ITEM' });
    expect((store.read(`consultations/${id}`) as unknown as ConsultationDoc).proposal).toBeNull();

    await saveProposalDraft(store, { id, actor: designer, draft: { items: [item('i1', {}, id)], note: 'Three pieces suit this wall.' } });
    const proposal = await sendProposal(store, config(), { id, actor: designer, now: NOW });
    expect(proposal.version).toBe(1);
    const c = store.read(`consultations/${id}`) as unknown as ConsultationDoc;
    expect(c.status).toBe('proposed');
    expect(c.proposal!.items).toHaveLength(1);
    expect(store.read(`notifications_outbox/${id}_proposal_ready_v1`)!.payload).toMatchObject({ note: 'Three pieces suit this wall.' });
  });

  it('accepts a custom design only when its size and finish are orderable', async () => {
    const { store, id } = await setup();
    await claimConsultation(store, null, { id, actor: designer });
    const custom = (overrides: Partial<ProposalItem>) => item('c1', { kind: 'custom', productId: null, productName: 'Name plate', sizeLabel: null, widthMm: 400, heightMm: 200, finish: 'brass', designRef: '{"v":4}', ...overrides }, id);
    await saveProposalDraft(store, { id, actor: designer, draft: { items: [custom({ widthMm: 20 })], note: '' } });
    await expect(sendProposal(store, config(), { id, actor: designer, now: NOW })).rejects.toMatchObject({ code: 'INVALID_ITEM' });
    await saveProposalDraft(store, { id, actor: designer, draft: { items: [custom({})], note: '' } });
    await expect(sendProposal(store, config(), { id, actor: designer, now: NOW })).resolves.toMatchObject({ version: 1 });
  });

  it('allows exactly one free revision, then a second proposal version', async () => {
    const { store, id } = await setup();
    await claimConsultation(store, null, { id, actor: designer });
    await saveProposalDraft(store, { id, actor: designer, draft: { items: [item('i1', {}, id)], note: '' } });
    await sendProposal(store, config(), { id, actor: designer, now: NOW });

    await expect(requestRevision(store, { id, uid: 'mallory', message: 'change it' })).rejects.toMatchObject({ status: 404 });
    await requestRevision(store, { id, uid: UID, message: 'Smaller pieces please', now: NOW + 1000 });
    expect(store.read(`consultations/${id}`)).toMatchObject({ status: 'in_progress', revisionsUsed: 1, revisionNote: 'Smaller pieces please' });
    expect((store.read(`consultations/${id}`) as unknown as ConsultationDoc).dueAt).toBe(NOW + 1000 + 3 * 24 * 3600_000);

    await sendProposal(store, config(), { id, actor: designer, now: NOW + 2000 });
    expect(store.read(`notifications_outbox/${id}_proposal_ready_v2`)).toBeDefined();
    await expect(requestRevision(store, { id, uid: UID, message: 'again' })).rejects.toMatchObject({ status: 409 });
  });

  it('closes only from a sent proposal and only for the owner', async () => {
    const { store, id } = await setup();
    await expect(closeConsultation(store, { id, uid: UID, outcome: 'accepted' })).rejects.toBeInstanceOf(ApiError);
    await claimConsultation(store, null, { id, actor: designer });
    await saveProposalDraft(store, { id, actor: designer, draft: { items: [item('i1', {}, id)], note: '' } });
    await sendProposal(store, config(), { id, actor: designer, now: NOW });
    await expect(closeConsultation(store, { id, uid: 'mallory', outcome: 'accepted' })).rejects.toMatchObject({ status: 404 });
    await closeConsultation(store, { id, uid: UID, outcome: 'accepted' });
    expect(store.read(`consultations/${id}`)).toMatchObject({ status: 'closed', outcome: 'accepted' });
  });
});
