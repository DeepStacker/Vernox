/**
 * Client for the server-authoritative checkout flow.
 * The client sends only item identity and customer details; price, tax, shipping and stock
 * are decided by the server and returned in `pricing`.
 */
import { auth } from '@/lib/firebase';
import type { CartItem } from '@/lib/cartContext';
import { CUSTOM_PRODUCT_ID } from '@/types/products';

export interface CheckoutCustomer {
  email: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface ServerPricing {
  subtotal: number;
  discount: number;
  shipping: number;
  /** Cash on delivery fee (0 for prepaid). */
  codFee?: number;
  tax: number;
  total: number;
  items: Array<{ productId: string; name: string; unitPrice: number; quantity: number; lineTotal: number }>;
}

export type PaymentMethod = 'prepaid' | 'cod';

export interface CheckoutIntent {
  orderId: string;
  orderNumber: string;
  paymentMethod: 'prepaid';
  razorpayOrderId: string;
  keyId: string;
  /** Amount in paise. */
  amount: number;
  currency: 'INR';
  pricing: ServerPricing;
}

/** A cash-on-delivery order is confirmed when created: there is no payment step. */
export interface CodOrder {
  orderId: string;
  orderNumber: string;
  paymentMethod: 'cod';
  pricing: ServerPricing;
}

export type CheckoutErrorCode =
  | 'INSUFFICIENT_STOCK' | 'INVALID_ITEM' | 'INVALID_COUPON' | 'VALIDATION_ERROR' | 'COD_NOT_AVAILABLE'
  | 'RATE_LIMITED' | 'PAYMENT_PROVIDER_ERROR' | 'CONFIG_ERROR' | 'NETWORK_ERROR' | 'UNKNOWN';

export class CheckoutError extends Error {
  constructor(readonly code: CheckoutErrorCode, message: string) {
    super(message);
    this.name = 'CheckoutError';
  }
}

export interface VerifiedPayment {
  orderId: string;
  orderNumber: string;
  status: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const user = auth.currentUser;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  return headers;
}

async function postJson(url: string, body: unknown): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any -- server JSON validated by callers
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) });
  } catch (err) {
    throw new CheckoutError('NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    throw new CheckoutError('UNKNOWN', `Unexpected server response (${res.status}).`);
  }
  if (!res.ok || data.success === false) {
    throw new CheckoutError((data.code as CheckoutErrorCode) ?? 'UNKNOWN', data.message || data.error || `Request failed (${res.status}).`);
  }
  return data;
}

/** Cart lines in the shape every pricing endpoint accepts; prices are never sent. */
export function toCheckoutItems(items: CartItem[]) {
  return items.map(i => ({
    productId: i.productId,
    sizeLabel: i.sizeLabel || undefined,
    widthMm: i.widthMm || undefined,
    heightMm: i.heightMm || undefined,
    finish: i.finish,
    quantity: i.quantity,
    customDesignRef: i.customDesignRef,
  }));
}

export async function createCheckoutIntent(params: {
  items: CartItem[];
  couponCode?: string;
  idempotencyKey: string;
  customer: CheckoutCustomer;
  paymentMethod?: PaymentMethod;
}): Promise<CheckoutIntent | CodOrder> {
  const data = await postJson('/api/checkout-intent', {
    items: toCheckoutItems(params.items),
    couponCode: params.couponCode,
    idempotencyKey: params.idempotencyKey,
    customer: params.customer,
    paymentMethod: params.paymentMethod ?? 'prepaid',
  });
  // Responses from before COD carry no paymentMethod; they are prepaid.
  return (data.paymentMethod === 'cod' ? data : { ...data, paymentMethod: 'prepaid' }) as unknown as CheckoutIntent | CodOrder;
}

/** Same rule as the server (api/_lib/cod.ts): any Crafting Studio piece makes the cart prepaid only. */
export function cartHasCustomItem(items: Array<Pick<CartItem, 'productId'>>): boolean {
  return items.some(i => i.productId === CUSTOM_PRODUCT_ID);
}

export async function verifyPayment(payment: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<VerifiedPayment> {
  const data = await postJson('/api/verify-payment', payment);
  return { orderId: String(data.orderId), orderNumber: String(data.orderNumber ?? ''), status: String(data.status ?? '') };
}

// ---------------------------------------------------------------- Razorpay Checkout

interface RazorpayFailure { error?: { description?: string } }
interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
}
interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', cb: (r: RazorpayFailure) => void) => void;
}
type RazorpayCtor = new (options: RazorpayOptions) => RazorpayInstance;

let scriptPromise: Promise<RazorpayCtor> | null = null;

/** Loads checkout.js on first use only; a failed load can be retried. */
export function loadRazorpay(): Promise<RazorpayCtor> {
  const existing = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  if (!scriptPromise) {
    scriptPromise = new Promise<RazorpayCtor>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => {
        const ctor = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
        if (ctor) resolve(ctor);
        else reject(new CheckoutError('PAYMENT_PROVIDER_ERROR', 'Payment window failed to initialise.'));
      };
      script.onerror = () => {
        scriptPromise = null;
        script.remove();
        reject(new CheckoutError('PAYMENT_PROVIDER_ERROR', 'Could not load the payment window. Check your connection and try again.'));
      };
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

export type PaymentOutcome =
  | { kind: 'paid'; payment: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string } }
  | { kind: 'dismissed' };

/**
 * Opens Razorpay Checkout for a server-created order. Resolves when the customer pays or closes
 * the window. A failed attempt does not end the session (the customer may retry inside the
 * window), so it is only reported through `onPaymentFailed`.
 */
export async function openRazorpay(intent: CheckoutIntent, opts: {
  storeName: string; description: string; customer: CheckoutCustomer; themeColor?: string;
  onPaymentFailed: (message: string) => void;
}): Promise<PaymentOutcome> {
  const Razorpay = await loadRazorpay();
  return new Promise<PaymentOutcome>(resolve => {
    const rzp = new Razorpay({
      key: intent.keyId,
      order_id: intent.razorpayOrderId,
      amount: intent.amount,
      currency: intent.currency,
      name: opts.storeName,
      description: opts.description,
      prefill: { name: opts.customer.name, email: opts.customer.email, contact: opts.customer.phone },
      theme: opts.themeColor ? { color: opts.themeColor } : undefined,
      handler: payment => resolve({ kind: 'paid', payment }),
      modal: { ondismiss: () => resolve({ kind: 'dismissed' }) },
    });
    rzp.on('payment.failed', r => opts.onPaymentFailed(r.error?.description || 'The payment failed.'));
    rzp.open();
  });
}
