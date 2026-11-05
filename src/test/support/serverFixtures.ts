/**
 * Shared fixtures for server (api/_lib) tests.
 */
import { checkoutRequestSchema, createCheckoutIntent, type CheckoutDeps, type CheckoutRequest, type PrepaidCheckoutResponse } from '../../../api/_lib/checkout';
import type { FetchLike } from '../../../api/_lib/notifications/channels';
import { confirmPayment } from '../../../api/_lib/payments';
import type { PaymentGateway, RefundGateway } from '../../../api/_lib/razorpay';
import { ManualShippingProvider } from '../../../api/_lib/shipping/manual';
import { defaultStoreConfig, mergeStoreConfig } from '../../../api/_lib/storeConfig';
import { MemoryStore } from './memoryStore';

export const NOW = Date.parse('2026-11-05T10:00:00+05:30');

export const TEST_CONFIG = defaultStoreConfig({
  STORE_GST_RATE_PERCENT: '18',
  STORE_SHIPPING_FEE_INR: '40',
  STORE_FREE_SHIPPING_THRESHOLD_INR: '150',
} as NodeJS.ProcessEnv);

/** TEST_CONFIG plus a registered seller in Karnataka (GST state code 29), so invoices can be issued. */
export const SELLER_CONFIG = mergeStoreConfig(TEST_CONFIG, {
  seller: {
    legalName: 'Vernox Metal Arts Private Limited',
    tradeName: 'Vernox',
    gstin: '29ABCDE1234F1Z5',
    address: '14 Peenya Industrial Area',
    city: 'Bengaluru',
    state: 'Karnataka',
    stateCode: '29',
    pincode: '560058',
    email: 'accounts@vernox.in',
    phone: '+91 80 4000 0000',
  },
});

export const STAFF_ACTOR = { uid: 'staff-1', email: 'ops@vernox.in', role: 'admin' as const };

export const PRODUCT_FRAME = {
  id: 'p-01',
  name: 'Ember Round Frame',
  category: 'frames',
  price: 189,
  finishes: ['gold', 'brass', 'steel'],
  sizes: [
    { label: 'Small · 30cm', widthMm: 300, heightMm: 300, priceDelta: 0 },
    { label: 'Medium · 50cm', widthMm: 500, heightMm: 500, priceDelta: 80 },
  ],
  stock: 10,
  trackInventory: true,
};

export const PRODUCT_CHEAP = {
  id: 'p-11',
  name: 'Triad',
  category: 'geometric',
  price: 89,
  finishes: ['steel'],
  sizes: [],
  stock: 5,
  trackInventory: true,
};

export class FakeGateway implements PaymentGateway {
  calls: Array<{ amountPaise: number; receipt: string; notes: Record<string, string> }> = [];
  failWith: Error | null = null;

  async createOrder(params: Parameters<PaymentGateway['createOrder']>[0]) {
    this.calls.push({ amountPaise: params.amountPaise, receipt: params.receipt, notes: params.notes });
    if (this.failWith) throw this.failWith;
    return { id: `order_rzp${String(this.calls.length).padStart(6, '0')}`, amount: params.amountPaise, currency: 'INR' };
  }
}

export function seededStore(): MemoryStore {
  const store = new MemoryStore();
  store.seed('products/p-01', PRODUCT_FRAME);
  store.seed('products/p-11', PRODUCT_CHEAP);
  return store;
}

export function deps(store: MemoryStore, gateway = new FakeGateway()): CheckoutDeps & { gateway: FakeGateway } {
  return {
    store,
    gateway,
    razorpayKeyId: 'rzp_test_key',
    config: SELLER_CONFIG,
    shipping: new ManualShippingProvider({ transitDays: 5, codEnabled: true }),
    now: () => NOW,
  };
}

export class FakeRefundGateway implements RefundGateway {
  calls: Array<{ paymentId: string; amountPaise: number; receipt: string; notes: Record<string, string> }> = [];
  status: 'processed' | 'pending' = 'pending';
  failWith: Error | null = null;

  async createRefund(params: Parameters<RefundGateway['createRefund']>[0]) {
    this.calls.push(params);
    if (this.failWith) throw this.failWith;
    return { id: `rfnd_${String(this.calls.length).padStart(6, '0')}`, status: this.status, amount: params.amountPaise };
  }
}

/** Creates an order and confirms its payment; returns the checkout response. */
export async function paidOrder(store: MemoryStore, overrides: Record<string, unknown> = {}, paymentId = 'pay_001') {
  const res = (await createCheckoutIntent(deps(store), checkoutRequest(overrides), null)) as PrepaidCheckoutResponse;
  await confirmPayment(store, { orderId: res.orderId, razorpayPaymentId: paymentId, source: 'checkout_callback', now: NOW });
  return res;
}

/** Test-only shortcut through the workshop stages (each is covered by the state machine tests). */
export function setStatus(store: MemoryStore, orderId: string, status: string, extra: Record<string, unknown> = {}) {
  store.seed(`orders/${orderId}`, { ...store.read(`orders/${orderId}`)!, status, ...extra });
}

/** Scripted fetch: each call takes the next response whose matcher fits the URL. */
export function scriptedFetch(responses: Array<{ match: RegExp; status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
  const queue = [...responses];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const idx = queue.findIndex(r => r.match.test(url));
    if (idx < 0) throw new Error(`unexpected fetch ${url}`);
    const [r] = queue.splice(idx, 1);
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
  };
  return { impl, calls, remaining: queue };
}

export function checkoutRequest(overrides: Record<string, unknown> = {}): CheckoutRequest {
  return checkoutRequestSchema.parse({
    items: [{ productId: 'p-01', sizeLabel: 'Medium · 50cm', finish: 'brass', quantity: 2 }],
    idempotencyKey: 'idem-key-0001',
    customer: {
      email: 'Asha@Example.com',
      name: 'Asha Rao',
      phone: '+91 98765 43210',
      address: '12 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      country: 'India',
    },
    ...overrides,
  });
}
