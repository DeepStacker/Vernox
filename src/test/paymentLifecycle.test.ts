// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCheckoutIntent } from '../../api/_lib/checkout';
import { confirmPayment } from '../../api/_lib/payments';
import { releaseExpiredReservations } from '../../api/_lib/reservations';
import { processWebhookEvent, type RazorpayWebhookEvent } from '../../api/_lib/webhook';
import { checkoutRequest, deps, NOW, seededStore } from './support/serverFixtures';
import type { MemoryStore } from './support/memoryStore';

async function pendingOrder(store: MemoryStore, overrides: Record<string, unknown> = {}) {
  const res = await createCheckoutIntent(deps(store), checkoutRequest(overrides), null);
  return res;
}

const captured = (razorpayOrderId: string, amount: number, paymentId = 'pay_001'): RazorpayWebhookEvent => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: paymentId, order_id: razorpayOrderId, amount, currency: 'INR' } } },
});

describe('payment confirmation (checkout callback)', () => {
  it('marks the order Paid, commits the reservation and redeems the coupon atomically', async () => {
    const store = seededStore();
    store.seed('coupons/c1', { code: 'WELCOME10', discountType: 'percentage', discountValue: 10, isActive: true, usedCount: 0, maxUsagePerCustomer: 1 });
    const res = await pendingOrder(store, { couponCode: 'WELCOME10' });

    const result = await confirmPayment(store, { orderId: res.orderId, razorpayPaymentId: 'pay_001', source: 'checkout_callback', now: NOW });
    expect(result.outcome).toBe('paid');

    const order = store.read(`orders/${res.orderId}`)!;
    expect(order).toMatchObject({ status: 'Paid', razorpayPaymentId: 'pay_001', stockReservation: { status: 'committed' } });
    expect((order.statusHistory as Array<{ status: string }>).map(h => h.status)).toEqual(['Pending_Payment', 'Paid']);
    expect(store.read('products/p-01')!.stock).toBe(8); // reserved at checkout, not decremented again
    expect(store.read('coupons/c1')!.usedCount).toBe(1);
    expect(store.read(`coupon_usages/${res.orderId}`)).toMatchObject({ couponCode: 'WELCOME10', discountPaise: 5_380 });
    expect(store.collection('coupons/c1/customer_usage')[0].data.count).toBe(1);
    expect(store.collection('audit_logs').some(l => l.data.action === 'ORDER_PAID_CALLBACK')).toBe(true);
  });

  it('is idempotent: a second confirmation changes nothing', async () => {
    const store = seededStore();
    store.seed('coupons/c1', { code: 'WELCOME10', discountType: 'percentage', discountValue: 10, isActive: true, usedCount: 0 });
    const res = await pendingOrder(store, { couponCode: 'WELCOME10' });
    await confirmPayment(store, { orderId: res.orderId, razorpayPaymentId: 'pay_001', source: 'checkout_callback' });
    const again = await confirmPayment(store, { orderId: res.orderId, razorpayPaymentId: 'pay_001', source: 'webhook' });
    expect(again.outcome).toBe('duplicate');
    expect(store.read('coupons/c1')!.usedCount).toBe(1);
  });

  it('surfaces a failed write instead of reporting success', async () => {
    const store = seededStore();
    const res = await pendingOrder(store);
    store.failNextTransactions = 1;
    await expect(confirmPayment(store, { orderId: res.orderId, razorpayPaymentId: 'pay_001', source: 'checkout_callback' })).rejects.toThrow();
    expect(store.read(`orders/${res.orderId}`)!.status).toBe('Pending_Payment');
  });
});

describe('webhook processing', () => {
  it('marks Paid on payment.captured and ignores a repeated delivery of the same event', async () => {
    const store = seededStore();
    const res = await pendingOrder(store);
    expect(await processWebhookEvent(store, captured(res.razorpayOrderId, res.amount), 'evt_1', NOW)).toBe('paid');
    expect(await processWebhookEvent(store, captured(res.razorpayOrderId, res.amount), 'evt_1', NOW)).toBe('duplicate_event');
    expect(await processWebhookEvent(store, captured(res.razorpayOrderId, res.amount), 'evt_2', NOW)).toBe('duplicate_payment');
    expect(store.read(`orders/${res.orderId}`)!.status).toBe('Paid');
    expect(store.read('webhook_events/evt_1')).toMatchObject({ outcome: 'paid', orderId: res.orderId });
  });

  it('flags an amount mismatch as Payment_Discrepancy', async () => {
    const store = seededStore();
    const res = await pendingOrder(store);
    expect(await processWebhookEvent(store, captured(res.razorpayOrderId, res.amount - 100), 'evt_1', NOW)).toBe('payment_discrepancy');
    const order = store.read(`orders/${res.orderId}`)!;
    expect(order.status).toBe('Payment_Discrepancy');
    expect(order.flags).toContain('AMOUNT_MISMATCH');
  });

  it('releases the reservation on payment.failed and re-commits stock on a late success', async () => {
    const store = seededStore();
    const res = await pendingOrder(store);
    const failed: RazorpayWebhookEvent = {
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_f1', order_id: res.razorpayOrderId, error_description: 'Bank declined' } } },
    };
    expect(await processWebhookEvent(store, failed, 'evt_f', NOW)).toBe('payment_failed');
    expect(store.read(`orders/${res.orderId}`)).toMatchObject({ status: 'Payment_Failed', stockReservation: { status: 'released' } });
    expect(store.read('products/p-01')!.stock).toBe(10);

    expect(await processWebhookEvent(store, captured(res.razorpayOrderId, res.amount, 'pay_ok'), 'evt_ok', NOW)).toBe('paid');
    expect(store.read('products/p-01')!.stock).toBe(8);
    expect(store.read(`orders/${res.orderId}`)).toMatchObject({ status: 'Paid', stockReservation: { status: 'committed' } });
  });

  it('distinguishes partial and full refunds and records each refund once', async () => {
    const store = seededStore();
    const res = await pendingOrder(store);
    await processWebhookEvent(store, captured(res.razorpayOrderId, res.amount), 'evt_pay', NOW);
    const refund = (id: string, amount: number): RazorpayWebhookEvent => ({
      event: 'refund.processed',
      payload: { refund: { entity: { id, payment_id: 'pay_001', amount } } },
    });
    expect(await processWebhookEvent(store, refund('rfnd_1', 10_000), 'evt_r1', NOW)).toBe('refund_recorded');
    expect(store.read(`orders/${res.orderId}`)).toMatchObject({ status: 'Partially_Refunded', refundedPaise: 10_000 });
    expect(await processWebhookEvent(store, refund('rfnd_1', 10_000), 'evt_r1_again', NOW)).toBe('refund_duplicate');
    expect(await processWebhookEvent(store, refund('rfnd_2', res.amount - 10_000), 'evt_r2', NOW)).toBe('refund_recorded');
    expect(store.read(`orders/${res.orderId}`)).toMatchObject({ status: 'Refunded', refundedPaise: res.amount });
  });

  it('stores events for unknown orders for reconciliation instead of dropping them', async () => {
    const store = seededStore();
    expect(await processWebhookEvent(store, captured('order_unknown', 1000), 'evt_x', NOW)).toBe('unmatched');
    expect(store.read('webhook_events/evt_x')).toMatchObject({ outcome: 'unmatched', razorpayOrderId: 'order_unknown' });
  });

  it('acknowledges unrelated event types', async () => {
    const store = seededStore();
    expect(await processWebhookEvent(store, { event: 'settlement.processed', payload: {} }, 'evt_s', NOW)).toBe('ignored_event');
  });
});

describe('reservation expiry', () => {
  it('expires unpaid orders after the TTL with atomic stock release, and only once', async () => {
    const store = seededStore();
    const res = await pendingOrder(store);
    expect(store.read('products/p-01')!.stock).toBe(8);

    expect((await releaseExpiredReservations(store, NOW + 60_000)).expired).toBe(0);
    const later = NOW + 16 * 60_000;
    expect(await releaseExpiredReservations(store, later)).toMatchObject({ scanned: 1, expired: 1, failed: 0 });
    expect(store.read(`orders/${res.orderId}`)).toMatchObject({ status: 'Expired', stockReservation: { status: 'released' } });
    expect(store.read('products/p-01')!.stock).toBe(10);

    expect((await releaseExpiredReservations(store, later)).scanned).toBe(0);
    expect(store.read('products/p-01')!.stock).toBe(10);
  });

  it('accepts a late payment for an expired order and flags any stock shortfall', async () => {
    const store = seededStore();
    const res = await pendingOrder(store);
    await releaseExpiredReservations(store, NOW + 16 * 60_000);
    store.seed('products/p-01', { ...store.read('products/p-01'), stock: 1 });
    expect(await processWebhookEvent(store, captured(res.razorpayOrderId, res.amount), 'evt_late', NOW + 20 * 60_000)).toBe('paid');
    const order = store.read(`orders/${res.orderId}`)!;
    expect(order.status).toBe('Paid');
    expect(order.flags).toContain('STOCK_SHORTFALL_AFTER_LATE_PAYMENT');
    expect(store.read('products/p-01')!.stock).toBe(-1);
  });
});
