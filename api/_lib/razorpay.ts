/**
 * Razorpay integration: signature verification (pure) and the order-creation gateway.
 *
 * Local development uses Razorpay TEST keys (rzp_test_*) — there is no mock or
 * bypass path; test mode accepts Razorpay's test cards/UPI ids.
 */
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { ApiError } from './errors';
import { getRazorpayCredentials } from './config';

function hmacHex(secret: string, payload: string | Buffer): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time comparison of a hex signature; false for any malformed input. */
export function safeEqualHex(received: unknown, expected: string): boolean {
  if (typeof received !== 'string' || !/^[0-9a-f]+$/i.test(received)) return false;
  const a = Buffer.from(received.toLowerCase(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Checkout callback signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(
  params: { razorpayOrderId: string; razorpayPaymentId: string; signature: string },
  keySecret: string,
): boolean {
  return safeEqualHex(params.signature, hmacHex(keySecret, `${params.razorpayOrderId}|${params.razorpayPaymentId}`));
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(rawBody: Buffer, signature: unknown, webhookSecret: string): boolean {
  return safeEqualHex(signature, hmacHex(webhookSecret, rawBody));
}

export interface PaymentGateway {
  createOrder(params: {
    amountPaise: number;
    currency: 'INR';
    receipt: string;
    notes: Record<string, string>;
  }): Promise<{ id: string; amount: number; currency: string }>;
}

export function createRazorpayGateway(): PaymentGateway {
  const { keyId, keySecret } = getRazorpayCredentials();
  const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return {
    async createOrder({ amountPaise, currency, receipt, notes }) {
      try {
        const order = await client.orders.create({ amount: amountPaise, currency, receipt, notes });
        return { id: order.id, amount: Number(order.amount), currency: order.currency };
      } catch (err) {
        const description = (err as { error?: { description?: string } })?.error?.description;
        throw new ApiError(
          502,
          'PAYMENT_PROVIDER_ERROR',
          'The payment provider could not start this payment. Please try again.',
          description || (err instanceof Error ? err.message : 'unknown Razorpay error'),
        );
      }
    },
  };
}
