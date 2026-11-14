// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { StaffCheckoutResponse } from '../../api/_lib/checkout';
import { ApiError } from '../../api/_lib/errors';
import { invoicePath } from '../../api/_lib/gst/invoice';
import { OUTBOX_COLLECTION } from '../../api/_lib/notifications/outbox';
import type { OrderDoc } from '../../api/_lib/orders';
import { collectedPaise } from '../../api/_lib/payments';
import type { PaymentLinkGateway } from '../../api/_lib/razorpay';
import { quoteCustomPiece } from '../lib/pricing/customPiece';
import { createStaffOrder, findCustomerByPhone, quoteStaffOrder, staffOrderSchema, staffQuoteSchema, type StaffOrderInput } from '../../api/_lib/staffOrders';
import { processWebhookEvent } from '../../api/_lib/webhook';
import type { MemoryStore } from './support/memoryStore';
import { deps, NOW, seededStore, SELLER_CONFIG } from './support/serverFixtures';

class FakeLinks implements PaymentLinkGateway {
  calls: Parameters<PaymentLinkGateway['createPaymentLink']>[0][] = [];
  failWith: Error | null = null;
  configured = true;
  isConfigured() {
    return this.configured;
  }
  async createPaymentLink(params: Parameters<PaymentLinkGateway['createPaymentLink']>[0]) {
    this.calls.push(params);
    if (this.failWith) throw this.failWith;
    return { id: `plink_${this.calls.length}`, url: `https://rzp.io/i/x${this.calls.length}`, razorpayOrderId: null };
  }
  cancelled: string[] = [];
  async cancelPaymentLink(id: string) {
    this.cancelled.push(id);
  }
}

const ACTOR = 'ops@vernox.in';
const ITEMS = [{ productId: 'p-01', sizeLabel: 'Medium · 50cm', finish: 'brass', quantity: 2 }];
const ADDRESS = { address: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' };

const input = (overrides: Record<string, unknown> = {}): StaffOrderInput =>
  staffOrderSchema.parse({
    channel: 'phone',
    items: ITEMS,
    customer: { name: 'Asha Rao', phone: '+91 98765 43210', email: 'asha@example.com', ...ADDRESS },
    payment: { method: 'offline', mode: 'upi', reference: 'UTR123456' },
    idempotencyKey: 'staff-key-0001',
    ...overrides,
  });

function staffDeps(store: MemoryStore, links = new FakeLinks()) {
  return { ...deps(store), paymentLinks: links, links };
}

const order = (store: MemoryStore, id: string) => store.read(`orders/${id}`) as unknown as OrderDoc;

describe('staff orders: offline payment', () => {
  it('creates a Paid order with stock committed, the payment recorded and the customer notified', async () => {
    const store = seededStore();
    const res = await createStaffOrder(staffDeps(store), input(), ACTOR);
    const doc = order(store, res.orderId);
    expect(res).toMatchObject({ staff: true, status: 'Paid', paymentLink: null, invoiceNumber: null });
    expect(doc.source).toEqual({ channel: 'phone', by: ACTOR });
    expect(doc.offlinePayment).toEqual({ mode: 'upi', reference: 'UTR123456', receivedBy: ACTOR, at: NOW });
    expect(doc.stockReservation.status).toBe('committed');
    expect(doc.statusHistory[0]).toMatchObject({ status: 'Paid', by: ACTOR, note: 'paid by upi (UTR123456)' });
    expect((store.read('products/p-01') as { stock: number }).stock).toBe(8);
    expect(collectedPaise(doc)).toBe(doc.amounts.totalPaise);
    expect(store.collection(OUTBOX_COLLECTION).map(d => d.data.event)).toEqual(['order_confirmed']);
  });

  it('a counter handover is Delivered and invoiced intra-state at once, with no address needed', async () => {
    const store = seededStore();
    const res = await createStaffOrder(
      staffDeps(store),
      input({ channel: 'counter', handover: true, customer: { name: 'Walk-in', phone: '9876543210' }, payment: { method: 'offline', mode: 'cash' } }),
      ACTOR,
    );
    const doc = order(store, res.orderId);
    expect(res.status).toBe('Delivered');
    expect(res.invoiceNumber).toBeTruthy();
    expect(doc.deliveredAt).toBe(NOW);
    expect(doc.customer).toMatchObject({ address: 'Collected at the counter', state: 'Karnataka', pincode: SELLER_CONFIG.seller.pincode, email: '' });
    const invoice = store.read(invoicePath(res.orderId)) as { supplyType: string; totals: { totalPaise: number } };
    expect(invoice.supplyType).toBe('intra_state');
    expect(invoice.totals.totalPaise).toBe(doc.amounts.totalPaise);
  });

  it('charges no shipping on a counter handover, even below the free-shipping threshold', async () => {
    const store = seededStore();
    const cheap = [{ productId: 'p-11', finish: 'steel', quantity: 1 }];
    const counter = { channel: 'counter', items: cheap, handover: true, customer: { name: 'Walk-in', phone: '9876543210' }, payment: { method: 'offline', mode: 'cash' } };
    const quote = await quoteStaffOrder(store, SELLER_CONFIG, { items: cheap, cod: false, handover: true });
    const shipped = await quoteStaffOrder(store, SELLER_CONFIG, { items: cheap, cod: false, handover: false });
    expect(quote.totals.shippingPaise).toBe(0);
    expect(shipped.totals.shippingPaise).toBeGreaterThan(0);
    const res = await createStaffOrder(staffDeps(store), input(counter), ACTOR);
    expect(order(store, res.orderId).amounts.totalPaise).toBe(quote.totals.totalPaise);
  });

  it('repeating the same request returns the same order', async () => {
    const store = seededStore();
    const d = staffDeps(store);
    const first = await createStaffOrder(d, input(), ACTOR);
    const again = await createStaffOrder(d, input(), ACTOR);
    expect(again.orderId).toBe(first.orderId);
    expect(store.collection('orders')).toHaveLength(1);
  });

  it('validates the request', () => {
    const bad = (o: Record<string, unknown>) => expect(() => input(o)).toThrow();
    bad({ payment: { method: 'offline', mode: 'card' } }); // card needs a reference
    bad({ handover: true }); // only at the counter
    bad({ channel: 'counter', handover: true, payment: { method: 'payment_link' } });
    bad({ customer: { name: 'A', phone: '9876543210' } }); // delivery needs an address
    bad({ couponCode: 'WELCOME10', customer: { name: 'A', phone: '9876543210', ...ADDRESS } }); // coupon needs email
  });

  it('refuses a counter handover of a made-to-order custom piece', async () => {
    const store = seededStore();
    const custom = [{ productId: 'custom-bespoke', widthMm: 300, heightMm: 300, finish: 'steel', quantity: 1, customDesignRef: 'design-1' }];
    // The schema refuses it first; the checkout engine refuses it again if a caller bypasses the schema.
    const handover = { items: custom, channel: 'counter', handover: true, payment: { method: 'offline', mode: 'cash' } };
    expect(() => input(handover)).toThrow(/cannot be handed over/);
    const unchecked = { ...input({ channel: 'counter', payment: { method: 'offline', mode: 'cash' } }), items: custom, handover: true } as StaffOrderInput;
    await expect(createStaffOrder(staffDeps(store), unchecked, ACTOR)).rejects.toBeInstanceOf(ApiError);
    expect(store.collection('orders')).toHaveLength(0);
  });
});

describe('staff orders: payment link', () => {
  it('holds stock for the link lifetime and records the link', async () => {
    const store = seededStore();
    const d = staffDeps(store);
    const res = (await createStaffOrder(d, input({ payment: { method: 'payment_link' } }), ACTOR)) as StaffCheckoutResponse;
    const doc = order(store, res.orderId);
    expect(res.status).toBe('Pending_Payment');
    expect(res.paymentLink).toEqual({ id: 'plink_1', url: 'https://rzp.io/i/x1', expiresAt: NOW + 72 * 3600_000 });
    expect(doc.stockReservation.status).toBe('held');
    expect(d.links.calls[0]).toMatchObject({ amountPaise: doc.amounts.totalPaise, referenceId: doc.orderNumber, notes: { orderId: res.orderId } });
    expect(d.links.calls[0].expireBy).toBe(Math.floor((NOW + 72 * 3600_000) / 1000));
  });

  it('payment_link.paid confirms the order; a forged link id does not', async () => {
    const store = seededStore();
    const res = await createStaffOrder(staffDeps(store), input({ payment: { method: 'payment_link' } }), ACTOR);
    const total = order(store, res.orderId).amounts.totalPaise;
    const event = (linkId: string) => ({
      event: 'payment_link.paid',
      payload: {
        payment_link: { entity: { id: linkId, notes: { orderId: res.orderId } } },
        payment: { entity: { id: 'pay_link1', order_id: 'order_link1', amount: total, currency: 'INR' } },
      },
    });
    expect(await processWebhookEvent(store, event('plink_other'), 'evt_x', NOW)).toBe('unmatched');
    expect(await processWebhookEvent(store, event('plink_1'), 'evt_1', NOW)).toBe('paid');
    expect(order(store, res.orderId).status).toBe('Paid');
    // The twin payment.captured event finds the order by payment id.
    const captured = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_link1', order_id: 'order_link1', amount: total, currency: 'INR' } } } };
    expect(await processWebhookEvent(store, captured, 'evt_2', NOW)).toBe('duplicate_payment');
  });

  it('refuses before creating anything when Razorpay is not configured', async () => {
    const store = seededStore();
    const links = new FakeLinks();
    links.configured = false;
    await expect(createStaffOrder(staffDeps(store, links), input({ payment: { method: 'payment_link' } }), ACTOR)).rejects.toThrow(/Razorpay keys/);
    expect(store.collection('orders')).toHaveLength(0);
  });

  it('cancels the order and returns stock when the link cannot be created', async () => {
    const store = seededStore();
    const links = new FakeLinks();
    links.failWith = new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'down');
    await expect(createStaffOrder(staffDeps(store, links), input({ payment: { method: 'payment_link' } }), ACTOR)).rejects.toThrow('down');
    expect(order(store, store.collection('orders')[0].id).status).toBe('Cancelled');
    expect((store.read('products/p-01') as { stock: number }).stock).toBe(10);
  });
});

describe('staff orders: COD and quotes', () => {
  it('uses the storefront COD rules', async () => {
    const store = seededStore();
    const res = await createStaffOrder(staffDeps(store), input({ payment: { method: 'cod' } }), ACTOR);
    expect(res.status).toBe('Confirmed_COD');
    expect(order(store, res.orderId).amounts.codFeePaise).toBeGreaterThan(0);
  });

  it('quotes the same total the order is created with', async () => {
    const store = seededStore();
    const quote = await quoteStaffOrder(store, SELLER_CONFIG, { items: ITEMS, cod: false, handover: false });
    const res = await createStaffOrder(staffDeps(store), input(), ACTOR);
    expect(quote.totals.totalPaise).toBe(order(store, res.orderId).amounts.totalPaise);
    expect(quote.coupon).toBeNull();
    const badCoupon = await quoteStaffOrder(store, SELLER_CONFIG, { items: ITEMS, couponCode: 'NOPE', cod: false, handover: false });
    expect(badCoupon.coupon).toMatchObject({ ok: false });
  });

  it('marks the source trade enquiry as won', async () => {
    const store = seededStore();
    store.seed('b2b_inquiries/abcdefghij12', { name: 'Ravi', status: 'quoted' });
    const res = await createStaffOrder(staffDeps(store), input({ channel: 'trade', tradeEnquiryId: 'abcdefghij12' }), ACTOR);
    expect(store.read('b2b_inquiries/abcdefghij12')).toMatchObject({ status: 'won', orderId: res.orderId });
  });
});

describe('returning customer lookup', () => {
  it('fills from the latest order and skips counter handovers as an address', async () => {
    const store = seededStore();
    const d = staffDeps(store);
    expect(await findCustomerByPhone(store, '9876543210')).toEqual({ found: false });
    await createStaffOrder(d, input({ customer: { name: 'Asha Rao', phone: '+91 98765 43210', email: 'asha@example.com', ...ADDRESS } }), ACTOR);
    await createStaffOrder(
      { ...d, now: () => NOW + 1000 },
      input({ idempotencyKey: 'staff-key-0002', channel: 'counter', handover: true, customer: { name: 'Asha R', phone: '09876543210' }, payment: { method: 'offline', mode: 'cash' } }),
      ACTOR,
    );
    const found = await findCustomerByPhone(store, '98765 43210');
    expect(found).toMatchObject({ found: true, orderCount: 2, name: 'Asha R', email: 'asha@example.com', address: ADDRESS });
  });
});

describe('staff orders: custom (Studio) pieces', () => {
  const customLine = (overrides: Record<string, unknown> = {}) => ({
    productId: 'custom-bespoke', widthMm: 400, heightMm: 300, finish: 'steel', quantity: 2, customDesignRef: 'WhatsApp gate-sign.dxf, 12 Nov', ...overrides,
  });

  it('quotes a custom line on the server with the storefront price, ignoring any client price', async () => {
    const store = seededStore();
    const quote = await quoteStaffOrder(store, SELLER_CONFIG, { items: [customLine({ unitPrice: 1 }) as never], cod: false, handover: false });
    const expected = quoteCustomPiece({ widthMm: 400, heightMm: 300, finish: 'steel' }, SELLER_CONFIG.customPieces.finishes, SELLER_CONFIG.customPieces);
    if (!expected.ok) throw new Error('fixture finish must be priced');
    expect(quote.lines[0]).toMatchObject({ productId: 'custom-bespoke', quantity: 2, unitPricePaise: expected.unitPricePaise, lineTotalPaise: expected.unitPricePaise * 2 });
    expect(quote.totals.taxPaise).toBeGreaterThan(0);
  });

  it('rejects a size outside the Studio limits in the quote and at creation', async () => {
    const store = seededStore();
    const { maxWidthMm, minDimensionMm } = SELLER_CONFIG.customPieces;
    for (const size of [{ widthMm: maxWidthMm + 1 }, { heightMm: minDimensionMm - 1 }]) {
      const items = [customLine(size)];
      await expect(quoteStaffOrder(store, SELLER_CONFIG, { items: items as never, cod: false, handover: false })).rejects.toThrow(/must be between/);
      await expect(createStaffOrder(staffDeps(store), input({ items }), ACTOR)).rejects.toBeInstanceOf(ApiError);
    }
    expect(store.collection('orders')).toHaveLength(0);
  });

  it('cannot be handed over at the counter, in the quote or the order schema', () => {
    const handover = { channel: 'counter', handover: true, customer: { name: 'Walk-in', phone: '9876543210' }, payment: { method: 'offline', mode: 'cash' } };
    const issues = staffOrderSchema.safeParse({ ...handover, items: [customLine()], idempotencyKey: 'staff-key-0001' });
    expect(issues.success).toBe(false);
    expect(JSON.stringify(issues)).toContain('cannot be handed over');
    expect(staffQuoteSchema.safeParse({ items: [customLine()], handover: true }).success).toBe(false);
    expect(staffQuoteSchema.safeParse({ items: [customLine()], handover: false }).success).toBe(true);
  });

  it('needs a plain-text design reference on custom lines and none on catalogue lines', () => {
    const bad = (items: unknown[]) => expect(() => input({ items })).toThrow();
    bad([customLine({ customDesignRef: undefined })]);
    bad([customLine({ customDesignRef: '   ' })]);
    bad([customLine({ customDesignRef: '{"schemaVersion":4}' })]); // would be read by production as a Studio document
    bad([customLine({ customDesignRef: 'x'.repeat(301) })]);
    bad([{ ...ITEMS[0], customDesignRef: 'design-1' }]);
  });

  it('creates a Paid order with the design reference stored, a custom lead time and no COD', async () => {
    const store = seededStore();
    const res = await createStaffOrder(staffDeps(store), input({ items: [customLine()] }), ACTOR);
    const doc = order(store, res.orderId);
    expect(res.status).toBe('Paid');
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0]).toMatchObject({ productId: 'custom-bespoke', widthMm: 400, heightMm: 300, quantity: 2, customDesignRef: 'WhatsApp gate-sign.dxf, 12 Nov' });
    expect(doc.leadTimeDays).toBe(SELLER_CONFIG.fulfilment.customLeadTimeDays);
    await expect(
      createStaffOrder(staffDeps(store), input({ items: [customLine()], payment: { method: 'cod' }, idempotencyKey: 'staff-key-0002' }), ACTOR),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
