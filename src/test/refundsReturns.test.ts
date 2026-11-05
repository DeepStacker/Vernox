// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cancelOrder } from '../../api/_lib/cancellation';
import { createCheckoutIntent } from '../../api/_lib/checkout';
import { ApiError } from '../../api/_lib/errors';
import { orderPath } from '../../api/_lib/orders';
import { createRefund, type CreateRefundParams } from '../../api/_lib/refunds';
import { assertReturnEligible, decideReturn, markReturnReceived, requestReturn } from '../../api/_lib/returns';
import { applyCourierStatus, createShipment } from '../../api/_lib/shipping/shipments';
import { ManualShippingProvider } from '../../api/_lib/shipping/manual';
import { processWebhookEvent } from '../../api/_lib/webhook';
import { checkoutRequest, deps, FakeRefundGateway, NOW, paidOrder, seededStore, SELLER_CONFIG, setStatus, STAFF_ACTOR } from './support/serverFixtures';
import type { MemoryStore } from './support/memoryStore';

const DAY = 24 * 3600_000;
const manual = new ManualShippingProvider({ transitDays: 5, codEnabled: true });
const TOTAL = 63_484;

const refundParams = (orderId: string, amountPaise: number, extra: Partial<CreateRefundParams> = {}): CreateRefundParams => ({
  orderId,
  amountPaise,
  reason: 'damaged in transit',
  method: 'razorpay',
  requestedBy: STAFF_ACTOR.uid,
  source: 'staff',
  actor: STAFF_ACTOR,
  now: NOW,
  ...extra,
});

const refundWebhook = (refundId: string, amount: number, refundDocId?: string) => ({
  event: 'refund.processed',
  payload: { refund: { entity: { id: refundId, payment_id: 'pay_001', amount, notes: refundDocId ? { refundDocId } : {} } } },
});

async function code(promise: Promise<unknown>) {
  const err = await promise.then(() => null, e => e);
  expect(err).toBeInstanceOf(ApiError);
  return (err as ApiError).code;
}

async function deliveredOrder(store: MemoryStore, overrides: Record<string, unknown> = {}) {
  const res = await paidOrder(store, overrides);
  setStatus(store, res.orderId, 'Packed');
  await createShipment(store, manual, SELLER_CONFIG, { orderId: res.orderId, manual: { courier: 'DTDC', awb: `D${res.orderId.slice(0, 9)}` }, actor: STAFF_ACTOR, now: NOW });
  await applyCourierStatus(store, { orderId: res.orderId, target: 'Delivered', event: { status: 'DELIVERED', at: 'x' }, by: 'courier', now: NOW });
  return res;
}

describe('staff refunds', () => {
  it('reserves the amount, then records it once whichever of API response and webhook arrives first', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    const gateway = new FakeRefundGateway();
    gateway.status = 'processed';
    const refund = await createRefund(store, gateway, refundParams(res.orderId, 10_000));
    expect(refund.status).toBe('processed');
    expect(gateway.calls[0]).toMatchObject({ paymentId: 'pay_001', amountPaise: 10_000, receipt: refund.id, notes: { refundDocId: refund.id } });

    // Razorpay also delivers refund.processed for the same refund: no double count.
    expect(await processWebhookEvent(store, refundWebhook('rfnd_000001', 10_000, refund.id), 'evt_r1', NOW)).toBe('refund_duplicate');
    const order = store.read(orderPath(res.orderId))!;
    expect(order).toMatchObject({ status: 'Partially_Refunded', refundedPaise: 10_000, refundPendingPaise: 0 });
    expect(store.read(`refunds/${refund.id}`)).toMatchObject({ status: 'processed', providerRefundId: 'rfnd_000001' });
    expect(store.collection('notifications_outbox').filter(n => n.data.event === 'refund_processed')).toHaveLength(1);
  });

  it('records a pending refund from the webhook using the refund id in notes', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    const refund = await createRefund(store, new FakeRefundGateway(), refundParams(res.orderId, TOTAL));
    expect(store.read(orderPath(res.orderId))!.refundPendingPaise).toBe(TOTAL);
    expect(await processWebhookEvent(store, refundWebhook('rfnd_000001', TOTAL, refund.id), 'evt_r1', NOW)).toBe('refund_recorded');
    expect(store.read(orderPath(res.orderId))).toMatchObject({ status: 'Refunded', refundedPaise: TOTAL, refundPendingPaise: 0 });
  });

  it('enforces the ceiling including pending refunds', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    const gateway = new FakeRefundGateway();
    await createRefund(store, gateway, refundParams(res.orderId, 60_000));
    expect(await code(createRefund(store, gateway, refundParams(res.orderId, 3_485)))).toBe('CONFLICT');
    await expect(createRefund(store, gateway, refundParams(res.orderId, 3_484))).resolves.toMatchObject({ status: 'pending' });
    expect(await code(createRefund(store, gateway, refundParams(res.orderId, 1)))).toBe('CONFLICT');
  });

  it('releases the reservation when Razorpay rejects the refund', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    const gateway = new FakeRefundGateway();
    gateway.failWith = new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'nope', 'insufficient balance');
    expect(await code(createRefund(store, gateway, refundParams(res.orderId, 5_000)))).toBe('PAYMENT_PROVIDER_ERROR');
    expect(store.read(orderPath(res.orderId))!.refundPendingPaise).toBe(0);
    expect(store.collection('refunds')[0].data).toMatchObject({ status: 'failed' });
  });

  it('is idempotent per key and rejects a reused key with a different amount', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    const gateway = new FakeRefundGateway();
    const a = await createRefund(store, gateway, refundParams(res.orderId, 5_000, { idempotencyKey: 'refund-key-1' }));
    const b = await createRefund(store, gateway, refundParams(res.orderId, 5_000, { idempotencyKey: 'refund-key-1' }));
    expect(b.id).toBe(a.id);
    expect(gateway.calls).toHaveLength(1);
    expect(await code(createRefund(store, gateway, refundParams(res.orderId, 6_000, { idempotencyKey: 'refund-key-1' })))).toBe('CONFLICT');
  });

  it('records refunds made in the Razorpay dashboard as external', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    expect(await processWebhookEvent(store, refundWebhook('rfnd_dash01', 1_000), 'evt_x', NOW)).toBe('refund_recorded');
    expect(store.read('refunds/ext_rfnd_dash01')).toMatchObject({ source: 'external', status: 'processed', amountPaise: 1_000 });
    expect(store.read(orderPath(res.orderId))!.refundedPaise).toBe(1_000);
  });

  it('issues a credit note for refunds on invoiced orders, and manual refunds for COD', async () => {
    const store = seededStore();
    const res = await createCheckoutIntent(deps(store), checkoutRequest({ paymentMethod: 'cod' }), null);
    expect(await code(createRefund(store, null, refundParams(res.orderId, 1_000, { method: 'manual', reference: 'UTR123456' })))).toBe('CONFLICT'); // nothing collected yet
    setStatus(store, res.orderId, 'Packed');
    await createShipment(store, manual, SELLER_CONFIG, { orderId: res.orderId, manual: { courier: 'DTDC', awb: 'D11112222' }, actor: STAFF_ACTOR, now: NOW });
    await applyCourierStatus(store, { orderId: res.orderId, target: 'Delivered', event: { status: 'DELIVERED', at: 'x' }, by: 'courier', now: NOW });
    const collected = store.read(orderPath(res.orderId))!.codCollectedPaise as number;
    expect(collected).toBeGreaterThan(0);

    const refund = await createRefund(store, null, refundParams(res.orderId, 11_800, { method: 'manual', reference: 'UTR123456' }));
    expect(refund.status).toBe('processed');
    expect(store.read(`refunds/${refund.id}`)).toMatchObject({ providerRefundId: 'UTR123456', creditNoteNumber: 'CN/26-27/000001' });
    expect(store.read(`credit_notes/${refund.id}`)).toMatchObject({ type: 'credit_note', totals: { totalPaise: 11_800 } });
  });
});

describe('customer cancellation', () => {
  it('cancels a paid order before production: stock back, full refund requested, notification queued', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    expect(store.read('products/p-01')!.stock).toBe(8);
    const gateway = new FakeRefundGateway();
    const result = await cancelOrder(store, gateway, { orderId: res.orderId, reason: 'changed my mind', initiatedBy: 'customer', actor: { uid: 'guest', email: 'a@b.in', role: 'system' }, now: NOW });
    expect(result.order.status).toBe('Cancelled');
    expect(result.refund).toMatchObject({ amountPaise: TOTAL, source: 'customer_cancel' });
    expect(store.read('products/p-01')!.stock).toBe(10);
    expect(store.read(orderPath(res.orderId))!.stockReservation).toMatchObject({ status: 'released' });
    expect(store.read(`notifications_outbox/${res.orderId}_cancelled`)).toBeTruthy();
    expect(store.collection('credit_notes')).toHaveLength(0); // no invoice before dispatch

    await processWebhookEvent(store, refundWebhook('rfnd_000001', TOTAL, result.refund!.id), 'evt_c', NOW);
    expect(store.read(orderPath(res.orderId))!.status).toBe('Refunded');
  });

  it('refuses once production has started', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    setStatus(store, res.orderId, 'In_Design');
    expect(await code(cancelOrder(store, new FakeRefundGateway(), { orderId: res.orderId, reason: 'x', initiatedBy: 'customer', actor: { uid: 'g', email: null, role: 'system' } }))).toBe('CONFLICT');
  });

  it('cancels a COD order without a refund', async () => {
    const store = seededStore();
    const res = await createCheckoutIntent(deps(store), checkoutRequest({ paymentMethod: 'cod' }), null);
    const result = await cancelOrder(store, null, { orderId: res.orderId, reason: 'ordered twice', initiatedBy: 'customer', actor: { uid: 'g', email: null, role: 'system' } });
    expect(result).toMatchObject({ refund: null, refundError: null, order: { status: 'Cancelled' } });
    expect(store.read('products/p-01')!.stock).toBe(10);
  });

  it('flags the order when the refund cannot be started', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    const gateway = new FakeRefundGateway();
    gateway.failWith = new Error('network');
    const result = await cancelOrder(store, gateway, { orderId: res.orderId, reason: 'x', initiatedBy: 'customer', actor: { uid: 'g', email: null, role: 'system' } });
    expect(result.refundError).toBeTruthy();
    expect(store.read(orderPath(res.orderId))!.flags).toContain('REFUND_NOT_STARTED');
  });
});

describe('returns', () => {
  it('accepts a request inside the window and rejects it after', async () => {
    const store = seededStore();
    const res = await deliveredOrder(store);
    const photo = [`returns/${res.orderId}/crack.jpg`];
    expect(await code(requestReturn(store, SELLER_CONFIG, { orderId: res.orderId, reason: 'damaged', details: '', photoPaths: photo, now: NOW + 8 * DAY }))).toBe('CONFLICT');
    await requestReturn(store, SELLER_CONFIG, { orderId: res.orderId, reason: 'damaged', details: 'cracked corner', photoPaths: photo, now: NOW + 6 * DAY });
    expect(store.read(orderPath(res.orderId))!.status).toBe('Return_Requested');
    expect(await code(requestReturn(store, SELLER_CONFIG, { orderId: res.orderId, reason: 'damaged', details: '', photoPaths: photo, now: NOW }))).toBe('CONFLICT');
  });

  it('allows custom pieces back only for damage, defects or a wrong item, and requires photos for damage', async () => {
    const store = seededStore();
    const res = await deliveredOrder(store, { items: [{ productId: 'custom-bespoke', widthMm: 300, heightMm: 300, finish: 'steel', quantity: 1 }] });
    const order = store.read(orderPath(res.orderId)) as never;
    expect(() => assertReturnEligible(order, 'changed_mind', [], 7, NOW)).toThrow(ApiError);
    expect(() => assertReturnEligible(order, 'damaged', [], 7, NOW)).toThrow(/photo/);
    expect(() => assertReturnEligible(order, 'damaged', ['returns/otherorder00/x.jpg'], 7, NOW)).toThrow(ApiError);
    expect(() => assertReturnEligible(order, 'wrong_item', [], 7, NOW)).not.toThrow();
  });

  it('rejection sends the order back to Delivered', async () => {
    const store = seededStore();
    const res = await deliveredOrder(store);
    await requestReturn(store, SELLER_CONFIG, { orderId: res.orderId, reason: 'changed_mind', details: '', photoPaths: [], now: NOW });
    await decideReturn(store, { orderId: res.orderId, approve: false, note: 'Used item', actor: STAFF_ACTOR, now: NOW });
    expect(store.read(orderPath(res.orderId))!.status).toBe('Delivered');
    expect(store.read(`notifications_outbox/${res.orderId}_return_rejected`)).toMatchObject({ payload: { note: 'Used item' } });
  });

  it('a received replacement return creates a linked zero-value order', async () => {
    const store = seededStore();
    const res = await deliveredOrder(store);
    await requestReturn(store, SELLER_CONFIG, { orderId: res.orderId, reason: 'defective', details: '', photoPaths: [`returns/${res.orderId}/a.jpg`], now: NOW });
    await decideReturn(store, { orderId: res.orderId, approve: true, resolution: 'replacement', actor: STAFF_ACTOR, now: NOW });
    const out = await markReturnReceived(store, { orderId: res.orderId, restock: false, actor: STAFF_ACTOR, now: NOW });
    expect(store.read(orderPath(res.orderId))).toMatchObject({ status: 'Returned', replacementOrderId: out.replacementOrderId });
    const replacement = store.read(orderPath(out.replacementOrderId!))!;
    expect(replacement).toMatchObject({ status: 'Paid', paymentMethod: 'replacement', parentOrderId: res.orderId, amounts: { totalPaise: 0 } });
    expect(store.read('products/p-01')!.stock).toBe(6); // original 2 + replacement 2 (returned goods not restocked)
  });
});
