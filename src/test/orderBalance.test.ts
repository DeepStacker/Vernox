// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { recordOfflineBalancePayment, sendBalanceLink } from '../../api/_lib/orderBalance';
import { planStatusChange } from '../../api/_lib/orderTransitions';
import { publicOrderSummary, type OrderDoc } from '../../api/_lib/orders';
import { collectedPaise } from '../../api/_lib/payments';
import type { PaymentLinkGateway } from '../../api/_lib/razorpay';
import { createStaffOrder, staffOrderSchema, type StaffOrderInput } from '../../api/_lib/staffOrders';
import { processWebhookEvent } from '../../api/_lib/webhook';
import type { MemoryStore } from './support/memoryStore';
import { deps, FakeRefundGateway, NOW, paidOrder, seededStore, setStatus, STAFF_ACTOR } from './support/serverFixtures';
import { cancelOrder } from '../../api/_lib/cancellation';
import { createRefund, releaseStaleRefunds, STALE_REFUND_MS } from '../../api/_lib/refunds';

class FakeLinks implements PaymentLinkGateway {
  calls: Parameters<PaymentLinkGateway['createPaymentLink']>[0][] = [];
  cancelled: string[] = [];
  isConfigured() {
    return true;
  }
  async createPaymentLink(params: Parameters<PaymentLinkGateway['createPaymentLink']>[0]) {
    this.calls.push(params);
    return { id: `plink_${this.calls.length}`, url: `https://rzp.io/i/x${this.calls.length}`, razorpayOrderId: null };
  }
  async cancelPaymentLink(id: string) {
    this.cancelled.push(id);
  }
}

const ACTOR = STAFF_ACTOR.email;
const ADVANCE = 20_000; // ₹200 of a ₹538 order (GST included)

const input = (overrides: Record<string, unknown> = {}): StaffOrderInput =>
  staffOrderSchema.parse({
    channel: 'phone',
    items: [{ productId: 'p-01', sizeLabel: 'Medium · 50cm', finish: 'brass', quantity: 2 }],
    customer: { name: 'Asha Rao', phone: '+91 98765 43210', email: 'asha@example.com', address: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
    payment: { method: 'offline', mode: 'upi', reference: 'UTR1', advancePaise: ADVANCE },
    idempotencyKey: 'staff-adv-0001',
    ...overrides,
  });

const order = (store: MemoryStore, id: string) => store.read(`orders/${id}`) as unknown as OrderDoc;

async function advanceOrder(links = new FakeLinks()) {
  const store = seededStore();
  const res = await createStaffOrder({ ...deps(store), paymentLinks: links }, input(), ACTOR);
  return { store, links, res, id: res.orderId, total: order(store, res.orderId).amounts.totalPaise };
}

const linkPaid = (orderId: string, linkId: string, paymentId: string, amount: number, purpose?: string) => ({
  event: 'payment_link.paid',
  payload: {
    payment_link: { entity: { id: linkId, notes: { orderId, ...(purpose ? { purpose } : {}) } } },
    payment: { entity: { id: paymentId, order_id: `order_${paymentId}`, amount, currency: 'INR' } },
  },
});

describe('advance payments: creating the order', () => {
  it('an advance taken in person starts the order Paid with the rest owed', async () => {
    const { store, res, id, total } = await advanceOrder();
    const doc = order(store, id);
    // 2 × ₹269 including GST: the total is the prices shown, so the balance is ₹538 − ₹200 = ₹338.
    expect(total).toBe(53_800);
    expect(doc).toMatchObject({ pricesIncludeTax: true, balanceDuePaise: 33_800, amounts: { taxPaise: 8_207 } });
    expect(res).toMatchObject({ status: 'Paid', advance: 200, balanceDue: (total - ADVANCE) / 100 });
    expect(doc.balanceDuePaise).toBe(total - ADVANCE);
    expect(doc.payments).toEqual([expect.objectContaining({ kind: 'advance', amountPaise: ADVANCE, mode: 'upi', reference: 'UTR1', by: ACTOR })]);
    expect(doc.statusHistory[0].note).toBe('advance ₹200 paid by upi (UTR1)');
    expect(collectedPaise(doc)).toBe(ADVANCE);
    expect(publicOrderSummary(doc)).toMatchObject({ balanceDue: (total - ADVANCE) / 100, payBalanceUrl: null });
  });

  it('refuses an advance of the whole total, and an advance with a counter handover', async () => {
    const store = seededStore();
    await expect(createStaffOrder(deps(store), input({ payment: { method: 'offline', mode: 'cash', advancePaise: 99_999_999 } }), ACTOR))
      .rejects.toThrow(/advance must be less than the order total/);
    expect(() => input({ channel: 'counter', handover: true, payment: { method: 'offline', mode: 'cash', advancePaise: ADVANCE } }))
      .toThrow(/full amount/);
  });

  it('a payment link for an advance asks for the advance and opens the balance once paid', async () => {
    const store = seededStore();
    const links = new FakeLinks();
    const res = await createStaffOrder({ ...deps(store), paymentLinks: links }, input({ payment: { method: 'payment_link', advancePaise: ADVANCE } }), ACTOR);
    const total = order(store, res.orderId).amounts.totalPaise;
    expect(links.calls[0]).toMatchObject({ amountPaise: ADVANCE, description: expect.stringMatching(/^Advance/) });
    expect(order(store, res.orderId).balanceDuePaise).toBeUndefined();
    // Paying the full total on an advance link is a discrepancy, not a confirmation.
    expect(await processWebhookEvent(store, linkPaid(res.orderId, 'plink_1', 'pay_wrong', total), 'evt_0', NOW)).toBe('payment_discrepancy');

    const store2 = seededStore();
    const res2 = await createStaffOrder({ ...deps(store2), paymentLinks: new FakeLinks() }, input({ payment: { method: 'payment_link', advancePaise: ADVANCE } }), ACTOR);
    expect(await processWebhookEvent(store2, linkPaid(res2.orderId, 'plink_1', 'pay_adv', ADVANCE), 'evt_1', NOW)).toBe('paid');
    const doc = order(store2, res2.orderId);
    expect(doc.status).toBe('Paid');
    expect(doc.balanceDuePaise).toBe(total - ADVANCE);
    expect(doc.payments).toEqual([expect.objectContaining({ id: 'pay_adv', kind: 'advance', mode: 'razorpay', amountPaise: ADVANCE })]);
    expect(collectedPaise(doc)).toBe(ADVANCE);
  });
});

describe('advance payments: collecting the balance', () => {
  it('records part payments once each, refuses more than is owed, and needs a reference for UPI', async () => {
    const { store, links, id, total } = await advanceOrder();
    const owed = total - ADVANCE;
    const pay = (amountPaise: number, key: string, mode: 'cash' | 'upi' = 'cash', reference = '') =>
      recordOfflineBalancePayment(store, links, { orderId: id, amountPaise, mode, reference, idempotencyKey: key }, STAFF_ACTOR, NOW + 1);

    await expect(pay(owed + 1, 'key-over-01')).rejects.toThrow(/is owed/);
    await expect(pay(100, 'key-upi-001', 'upi')).rejects.toThrow(/reference/);
    expect(await pay(20_000, 'key-part-01')).toEqual({ balanceDuePaise: owed - 20_000, duplicate: false });
    expect(await pay(20_000, 'key-part-01')).toEqual({ balanceDuePaise: owed - 20_000, duplicate: true });
    expect(await pay(owed - 20_000, 'key-rest-01', 'upi', 'UTR2')).toEqual({ balanceDuePaise: 0, duplicate: false });

    const doc = order(store, id);
    expect(doc.payments?.map(p => p.kind)).toEqual(['advance', 'balance', 'balance']);
    expect(collectedPaise(doc)).toBe(total);
    await expect(pay(100, 'key-after-01')).rejects.toThrow(/Nothing is owed/);
    expect(store.collection('audit_logs').filter(a => a.data.action === 'ORDER_BALANCE_PAYMENT')).toHaveLength(2);
  });

  it('sends one link for the exact balance, records its payment and cancels a stale link', async () => {
    const { store, links, id, total } = await advanceOrder();
    const owed = total - ADVANCE;
    const link = await sendBalanceLink(store, links, id, STAFF_ACTOR, NOW);
    expect(link).toMatchObject({ amountPaise: owed, url: 'https://rzp.io/i/x1' });
    expect(links.calls[0]).toMatchObject({ amountPaise: owed, notes: { orderId: id, purpose: 'balance' } });
    expect(await sendBalanceLink(store, links, id, STAFF_ACTOR, NOW + 60_000)).toEqual(link);
    expect(links.calls).toHaveLength(1);
    expect(publicOrderSummary(order(store, id), undefined, NOW).payBalanceUrl).toBe(link.url);

    // Cash for part of it retires the link that still asks for the old amount.
    await recordOfflineBalancePayment(store, links, { orderId: id, amountPaise: 10_000, mode: 'cash', reference: '', idempotencyKey: 'key-cash-01' }, STAFF_ACTOR, NOW + 2);
    expect(links.cancelled).toEqual(['plink_1']);
    const fresh = await sendBalanceLink(store, links, id, STAFF_ACTOR, NOW + 3);
    expect(fresh.amountPaise).toBe(owed - 10_000);

    expect(await processWebhookEvent(store, linkPaid(id, fresh.id, 'pay_bal', owed - 10_000, 'balance'), 'evt_b1', NOW)).toBe('balance_paid');
    expect(await processWebhookEvent(store, linkPaid(id, fresh.id, 'pay_bal', owed - 10_000, 'balance'), 'evt_b2', NOW)).toBe('duplicate_payment');
    const doc = order(store, id);
    expect(doc.balanceDuePaise).toBe(0);
    expect(doc.balanceLink).toBeNull();
    expect(doc.flags).not.toContain('DUPLICATE_PAYMENT');
  });

  it('records money paid on a superseded link and flags it', async () => {
    const { store, links, id } = await advanceOrder();
    const first = await sendBalanceLink(store, links, id, STAFF_ACTOR, NOW);
    await recordOfflineBalancePayment(store, links, { orderId: id, amountPaise: first.amountPaise!, mode: 'cash', reference: '', idempotencyKey: 'key-all-001' }, STAFF_ACTOR, NOW + 1);
    expect(await processWebhookEvent(store, linkPaid(id, first.id, 'pay_late', first.amountPaise!, 'balance'), 'evt_l', NOW)).toBe('payment_discrepancy');
    const doc = order(store, id);
    expect(doc.flags).toContain('BALANCE_PAYMENT_MISMATCH');
    expect(doc.payments?.some(p => p.id === 'pay_late')).toBe(true);
    expect(doc.balanceDuePaise).toBe(0);
  });

  it('blocks dispatch and delivery while a balance is owed', async () => {
    const { store, id } = await advanceOrder();
    setStatus(store, id, 'Packed');
    await expect(store.runTransaction(async tx => planStatusChange(tx, order(store, id), { to: 'Shipped', by: ACTOR })))
      .rejects.toThrow(/still owed on this order/);
    await expect(store.runTransaction(async tx => planStatusChange(tx, order(store, id), { to: 'Quality_Check', by: ACTOR }))).resolves.toBeTruthy();
  });
});

describe('cancelling and refunding orders not paid in one online payment', () => {
  const cancel = (store: MemoryStore, id: string, gateway: FakeRefundGateway, links: FakeLinks | null = null) =>
    cancelOrder(store, gateway, { orderId: id, reason: 'Customer changed mind', initiatedBy: 'staff', actor: STAFF_ACTOR, paymentLinks: links, now: NOW + 10 });

  it('an advance taken in person is left for a manual refund, not attempted on Razorpay', async () => {
    const { store, links, id } = await advanceOrder();
    await sendBalanceLink(store, links, id, STAFF_ACTOR, NOW);
    const gateway = new FakeRefundGateway();
    const result = await cancel(store, id, gateway, links);
    expect(gateway.calls).toHaveLength(0);
    expect(links.cancelled).toEqual(['plink_1']);
    const doc = order(store, id);
    expect(doc.flags).toContain('REFUND_MANUAL_DUE');
    expect(doc.manualRefundDuePaise).toBe(ADVANCE);
    expect(doc.balanceLink).toBeNull();
    expect(result.refundError).toMatch(/₹200.00 paid in person/);
    // The customer pays the stale link anyway: the money is recorded and flagged for a refund.
    expect(await processWebhookEvent(store, linkPaid(id, 'plink_1', 'pay_late', 1000, 'balance'), 'evt_c', NOW)).toBe('payment_discrepancy');
    expect(order(store, id).flags).toContain('PAYMENT_FOR_CLOSED_ORDER');
  });

  it('Razorpay refunds only what it captured; a failed attempt is not reported as recorded on retry', async () => {
    const store = seededStore();
    const { orderId } = await paidOrder(store);
    const total = order(store, orderId).amounts.totalPaise;
    const gateway = new FakeRefundGateway();
    const refund = (amountPaise: number, key: string) => createRefund(store, gateway, {
      orderId, amountPaise, reason: 'Goodwill', method: 'razorpay', idempotencyKey: key, requestedBy: 'f', source: 'staff', actor: STAFF_ACTOR, now: NOW,
    });
    gateway.failWith = new Error('gateway down');
    await expect(refund(1000, 'refund-key-01')).rejects.toThrow(/gateway down/);
    gateway.failWith = null;
    await expect(refund(1000, 'refund-key-01')).rejects.toThrow(/earlier attempt failed/);
    await expect(refund(1000, 'refund-key-02')).resolves.toMatchObject({ amountPaise: 1000 });
    expect(order(store, orderId).refundPendingPaise).toBe(1000);
    expect(total).toBeGreaterThan(1000);
  });

  it('releases a refund reserved but never sent to Razorpay, and leaves ones Razorpay accepted', async () => {
    const store = seededStore();
    const { orderId } = await paidOrder(store);
    store.seed('refunds/rf_stuck', { id: 'rf_stuck', orderId, amountPaise: 500, method: 'razorpay', status: 'pending', providerRefundId: null, createdAt: NOW });
    store.seed('refunds/rf_sent', { id: 'rf_sent', orderId, amountPaise: 300, method: 'razorpay', status: 'pending', providerRefundId: 'rfnd_1', createdAt: NOW });
    store.seed(`orders/${orderId}`, { ...store.read(`orders/${orderId}`)!, refundPendingPaise: 800 });
    expect(await releaseStaleRefunds(store, NOW + STALE_REFUND_MS - 1)).toBe(0);
    expect(await releaseStaleRefunds(store, NOW + STALE_REFUND_MS + 1)).toBe(1);
    expect(store.read('refunds/rf_stuck')).toMatchObject({ status: 'failed' });
    expect(store.read('refunds/rf_sent')).toMatchObject({ status: 'pending' });
    expect(order(store, orderId).refundPendingPaise).toBe(300);
  });
});
