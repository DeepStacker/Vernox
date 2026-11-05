// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkoutRequestSchema, createCheckoutIntent, type PrepaidCheckoutResponse } from '../../api/_lib/checkout';
import { ApiError } from '../../api/_lib/errors';
import { checkoutRequest, deps, seededStore } from './support/serverFixtures';

async function expectCode(promise: Promise<unknown>, code: string, status?: number) {
  const err = await promise.then(
    () => null,
    e => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe(code);
  if (status) expect((err as ApiError).status).toBe(status);
}

describe('checkout intent', () => {
  it('prices on the server, reserves stock and records a Pending_Payment order', async () => {
    const store = seededStore();
    const d = deps(store);
    const res = await createCheckoutIntent(d, checkoutRequest(), 'uid-123');

    expect(res).toMatchObject({
      success: true,
      razorpayOrderId: 'order_rzp000001',
      keyId: 'rzp_test_key',
      amount: 63_484, // ₹538 + 18% GST, free shipping
      currency: 'INR',
      pricing: {
        subtotal: 538,
        discount: 0,
        shipping: 0,
        tax: 96.84,
        total: 634.84,
        items: [{ productId: 'p-01', name: 'Ember Round Frame', unitPrice: 269, quantity: 2, lineTotal: 538 }],
      },
    });
    expect(res.orderNumber).toMatch(/^VX-20261105-[A-Z2-9]{6}$/);
    expect(d.gateway.calls[0]).toMatchObject({ amountPaise: 63_484, receipt: res.orderNumber, notes: { orderId: res.orderId } });

    const order = store.read(`orders/${res.orderId}`)!;
    expect(order).toMatchObject({
      status: 'Pending_Payment',
      userId: 'uid-123',
      email: 'asha@example.com',
      razorpayOrderId: 'order_rzp000001',
      stockReservation: { status: 'held', items: [{ productId: 'p-01', quantity: 2 }] },
    });
    expect(order.reservationExpiresAt).toBe((order.placedAt as number) + 15 * 60_000);
    expect(store.read('products/p-01')!.stock).toBe(8);
    expect(store.read('idempotency/idem-key-0001')).toMatchObject({ orderId: res.orderId });
  });

  it('freezes custom design references in the order snapshot and prices them server-side', async () => {
    const store = seededStore();
    const req = checkoutRequest({
      items: [{ productId: 'custom-bespoke', widthMm: 300, heightMm: 300, finish: 'steel', quantity: 1, customDesignRef: 'design-abc', unitPrice: 1 }],
    });
    const res = await createCheckoutIntent(deps(store), req, null);
    expect(res.pricing.items[0].unitPrice).toBe(171.5);
    const order = store.read(`orders/${res.orderId}`)!;
    expect((order.items as Array<Record<string, unknown>>)[0]).toMatchObject({ customDesignRef: 'design-abc', isCustom: true });
    expect(order.userId).toBeNull();
    expect(order.stockReservation).toMatchObject({ status: 'none' });
  });

  it('returns the same order for a repeated idempotency key without reserving twice', async () => {
    const store = seededStore();
    const d = deps(store);
    const first = await createCheckoutIntent(d, checkoutRequest(), null);
    const second = await createCheckoutIntent(d, checkoutRequest(), null);
    expect(second).toEqual(first);
    expect(d.gateway.calls).toHaveLength(1);
    expect(store.read('products/p-01')!.stock).toBe(8);
    expect(store.collection('orders')).toHaveLength(1);
  });

  it('rejects an idempotency key reused with a different cart', async () => {
    const store = seededStore();
    await createCheckoutIntent(deps(store), checkoutRequest(), null);
    const other = checkoutRequest({ items: [{ productId: 'p-11', finish: 'steel', quantity: 1 }] });
    await expectCode(createCheckoutIntent(deps(store), other, null), 'VALIDATION_ERROR', 409);
  });

  it('never oversells under concurrent checkouts', async () => {
    const store = seededStore(); // p-01 stock 10
    const d = deps(store);
    const attempts = Array.from({ length: 25 }, (_, i) =>
      createCheckoutIntent(
        d,
        checkoutRequest({
          idempotencyKey: `concurrent-${i}`,
          items: [{ productId: 'p-01', sizeLabel: 'Small · 30cm', finish: 'gold', quantity: 1 }],
        }),
        null,
      ),
    );
    const results = await Promise.allSettled(attempts);
    const ok = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(10);
    expect(rejected.every(r => (r.reason as ApiError).code === 'INSUFFICIENT_STOCK')).toBe(true);
    expect(store.read('products/p-01')!.stock).toBe(0);
  });

  it('collapses concurrent duplicate clicks into one reservation', async () => {
    const store = seededStore();
    const d = deps(store);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => createCheckoutIntent(d, checkoutRequest(), null)));
    expect(store.collection('orders')).toHaveLength(1);
    expect(store.read('products/p-01')!.stock).toBe(8);
    const orderIds = new Set(results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<{ orderId: string }>).value.orderId));
    expect(orderIds.size).toBe(1);
  });

  it('fails with INVALID_ITEM for a product with no Firestore document and writes nothing', async () => {
    const store = seededStore();
    const req = checkoutRequest({ items: [{ productId: 'ghost', finish: 'steel', quantity: 1 }] });
    await expectCode(createCheckoutIntent(deps(store), req, null), 'INVALID_ITEM', 400);
    expect(store.collection('orders')).toHaveLength(0);
    expect(store.read('idempotency/idem-key-0001')).toBeUndefined();
  });

  it('returns INSUFFICIENT_STOCK (409) when stock is short', async () => {
    const store = seededStore();
    const req = checkoutRequest({ items: [{ productId: 'p-11', finish: 'steel', quantity: 6 }] });
    await expectCode(createCheckoutIntent(deps(store), req, null), 'INSUFFICIENT_STOCK', 409);
    expect(store.read('products/p-11')!.stock).toBe(5);
  });

  it('cancels the order, returns stock and frees the key if Razorpay fails', async () => {
    const store = seededStore();
    const d = deps(store);
    d.gateway.failWith = new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'provider down');
    await expectCode(createCheckoutIntent(d, checkoutRequest(), null), 'PAYMENT_PROVIDER_ERROR', 502);
    expect(store.read('products/p-01')!.stock).toBe(10);
    const [order] = store.collection('orders');
    expect(order.data).toMatchObject({ status: 'Cancelled', stockReservation: { status: 'released' } });
    expect(store.read('idempotency/idem-key-0001')).toBeUndefined();

    d.gateway.failWith = null;
    const retry = await createCheckoutIntent(d, checkoutRequest(), null);
    expect(retry.success).toBe(true);
    expect(store.read('products/p-01')!.stock).toBe(8);
  });

  it('applies a Firestore coupon but does not count it until payment', async () => {
    const store = seededStore();
    store.seed('coupons/c1', { code: 'WELCOME10', discountType: 'percentage', discountValue: 10, isActive: true, usedCount: 0, maxUsageCount: 1 });
    const res = await createCheckoutIntent(deps(store), checkoutRequest({ couponCode: 'welcome10' }), null);
    expect(res.pricing).toMatchObject({ subtotal: 538, discount: 53.8, tax: 87.16, total: 571.36 });
    expect((res as PrepaidCheckoutResponse).amount).toBe(57_136);
    expect(store.read('coupons/c1')!.usedCount).toBe(0);
    expect(store.read(`orders/${res.orderId}`)!.coupon).toEqual({ id: 'c1', code: 'WELCOME10', discountPaise: 5_380 });
  });

  it('rejects unknown or ineligible coupons with INVALID_COUPON', async () => {
    const store = seededStore();
    await expectCode(createCheckoutIntent(deps(store), checkoutRequest({ couponCode: 'NOPE' }), null), 'INVALID_COUPON', 400);
    store.seed('coupons/c2', { code: 'BIG', discountType: 'fixed', discountValue: 50, minOrderValue: 5000, isActive: true, usedCount: 0 });
    await expectCode(createCheckoutIntent(deps(store), checkoutRequest({ couponCode: 'BIG' }), null), 'INVALID_COUPON', 400);
    expect(store.read('products/p-01')!.stock).toBe(10);
  });

  it('validates the request contract', () => {
    const base = checkoutRequest();
    const invalid = [
      { ...base, idempotencyKey: 'short' },
      { ...base, items: [] },
      { ...base, items: [{ ...base.items[0], quantity: 0 }] },
      { ...base, customer: { ...base.customer, pincode: '12345' } },
      { ...base, customer: { ...base.customer, email: 'not-an-email' } },
    ];
    for (const body of invalid) expect(checkoutRequestSchema.safeParse(body).success).toBe(false);
  });
});
