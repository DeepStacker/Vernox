// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCheckoutIntent, type CodCheckoutResponse } from '../../api/_lib/checkout';
import { ApiError } from '../../api/_lib/errors';
import { computeTotals, priceLines, productFromDoc } from '../../api/_lib/pricing';
import { mergeStoreConfig } from '../../api/_lib/storeConfig';
import type { ShippingProvider } from '../../api/_lib/shipping/types';
import { ManualShippingProvider } from '../../api/_lib/shipping/manual';
import { checkoutRequest, deps, PRODUCT_FRAME, seededStore, SELLER_CONFIG, setStatus } from './support/serverFixtures';
import type { MemoryStore } from './support/memoryStore';

const cod = (overrides: Record<string, unknown> = {}) => checkoutRequest({ paymentMethod: 'cod', ...overrides });

async function expectCodRejected(promise: Promise<unknown>, reason: string) {
  const err = await promise.then(() => null, e => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe('COD_NOT_AVAILABLE');
  expect((err as ApiError).internalDetail).toContain(reason);
}

const noCodLane: ShippingProvider = Object.assign(new ManualShippingProvider({ transitDays: 4, codEnabled: true }), {
  async checkServiceability() {
    return { serviceable: true, codAvailable: false, transitDays: 4, courierName: 'Prepaid Express' };
  },
});

describe('cash on delivery checkout', () => {
  it('creates a Confirmed_COD order with stock committed, coupon redeemed, fee and GST, and no Razorpay order', async () => {
    const store = seededStore();
    store.seed('coupons/c1', { code: 'WELCOME10', discountType: 'percentage', discountValue: 10, isActive: true, usedCount: 0 });
    const d = deps(store);
    const res = (await createCheckoutIntent(d, cod({ couponCode: 'WELCOME10' }), null)) as CodCheckoutResponse;

    // ₹538 − ₹53.80 = ₹484.20 goods; COD fee ₹49; GST 18% on each: 87.16 + 8.82
    expect(res).toMatchObject({ success: true, paymentMethod: 'cod', pricing: { subtotal: 538, discount: 53.8, shipping: 0, codFee: 49, tax: 95.98, total: 629.18 } });
    expect(res).not.toHaveProperty('razorpayOrderId');
    expect(d.gateway.calls).toHaveLength(0);

    const order = store.read(`orders/${res.orderId}`)!;
    expect(order).toMatchObject({ status: 'Confirmed_COD', paymentMethod: 'cod', phoneKey: '9876543210', stockReservation: { status: 'committed' }, reservationExpiresAt: 0 });
    expect(store.read('products/p-01')!.stock).toBe(8);
    expect(store.read('coupons/c1')!.usedCount).toBe(1);
    expect(store.read(`notifications_outbox/${res.orderId}_order_confirmed`)).toMatchObject({ event: 'order_confirmed', status: 'pending' });
  });

  it('returns the same COD order for a repeated idempotency key', async () => {
    const store = seededStore();
    const first = await createCheckoutIntent(deps(store), cod(), null);
    const again = await createCheckoutIntent(deps(store), cod(), null);
    expect(again.orderId).toBe(first.orderId);
    expect(store.read('products/p-01')!.stock).toBe(8);
  });

  it('refuses carts with a custom studio piece', async () => {
    const store = seededStore();
    await expectCodRejected(
      createCheckoutIntent(deps(store), cod({ items: [{ productId: 'custom-bespoke', widthMm: 300, heightMm: 300, finish: 'steel', quantity: 1 }] }), null),
      'CUSTOM_ITEM',
    );
    expect(store.collection('orders')).toHaveLength(0);
  });

  it('refuses PIN codes the courier cannot serve with COD', async () => {
    const store = seededStore();
    await expectCodRejected(createCheckoutIntent({ ...deps(store), shipping: noCodLane }, cod(), null), 'PINCODE_NOT_ELIGIBLE');
  });

  it('refuses orders above the COD limit and when COD is switched off', async () => {
    const store = seededStore();
    const lowLimit = mergeStoreConfig(SELLER_CONFIG, { codMaxOrderValue: 500 });
    await expectCodRejected(createCheckoutIntent({ ...deps(store), config: lowLimit }, cod(), null), 'ORDER_VALUE_TOO_HIGH');
    expect(store.read('products/p-01')!.stock).toBe(10); // the transaction rolled back
    const off = mergeStoreConfig(SELLER_CONFIG, { codEnabled: false });
    await expectCodRejected(createCheckoutIntent({ ...deps(store), config: off }, cod({ idempotencyKey: 'idem-key-0002' }), null), 'COD_DISABLED');
  });

  it('limits open COD orders per mobile number, counting only undelivered ones', async () => {
    const store: MemoryStore = seededStore();
    const a = await createCheckoutIntent(deps(store), cod({ idempotencyKey: 'idem-cod-a1' }), null);
    await createCheckoutIntent(deps(store), cod({ idempotencyKey: 'idem-cod-a2' }), null);
    await expectCodRejected(createCheckoutIntent(deps(store), cod({ idempotencyKey: 'idem-cod-a3' }), null), 'TOO_MANY_OPEN_COD_ORDERS');
    setStatus(store, a.orderId, 'Delivered');
    await expect(createCheckoutIntent(deps(store), cod({ idempotencyKey: 'idem-cod-a4' }), null)).resolves.toMatchObject({ paymentMethod: 'cod' });
  });

  it('keeps prepaid as the default payment method', async () => {
    const store = seededStore();
    const res = await createCheckoutIntent(deps(store), checkoutRequest(), null);
    expect(res.paymentMethod).toBe('prepaid');
    expect(store.read(`orders/${res.orderId}`)).toMatchObject({ status: 'Pending_Payment', paymentMethod: 'prepaid' });
  });
});

describe('COD fee and GST math', () => {
  const frame = productFromDoc('p-01', PRODUCT_FRAME)!;
  const lines = priceLines([{ productId: 'p-01', sizeLabel: 'Small · 30cm', finish: 'steel', quantity: 1 }], new Map([['p-01', frame]]), SELLER_CONFIG);

  it('adds the fee as its own line taxed at the goods rate, together with shipping', () => {
    const t = computeTotals(lines, 0, SELLER_CONFIG, { cod: true });
    // ₹189 ≥ ₹150 threshold → free shipping; fee ₹49 → GST ₹8.82; goods GST ₹34.02
    expect(t).toMatchObject({ subtotalPaise: 18_900, shippingPaise: 0, codFeePaise: 4_900, taxPaise: 3_402 + 882, totalPaise: 18_900 + 4_900 + 4_284 });
    expect(t.taxBreakdown.charges).toEqual([{ kind: 'cod_fee', taxablePaise: 4_900, gstRateBps: 1_800, taxPaise: 882 }]);
  });

  it('charges no fee for prepaid orders', () => {
    expect(computeTotals(lines, 0, SELLER_CONFIG).codFeePaise).toBe(0);
  });

  it('allocates a discount across lines so the parts sum exactly', () => {
    const two = priceLines(
      [
        { productId: 'p-01', sizeLabel: 'Small · 30cm', finish: 'steel', quantity: 1 },
        { productId: 'p-01', sizeLabel: 'Medium · 50cm', finish: 'steel', quantity: 1 },
      ],
      new Map([['p-01', frame]]),
      SELLER_CONFIG,
    );
    const t = computeTotals(two, 1_001, SELLER_CONFIG);
    expect(t.taxBreakdown.lines.reduce((s, l) => s + l.discountPaise, 0)).toBe(1_001);
    expect(t.taxPaise).toBe(t.taxBreakdown.lines.reduce((s, l) => s + l.taxPaise, 0));
  });
});
