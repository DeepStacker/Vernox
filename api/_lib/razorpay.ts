/**
 * Razorpay integration: signature verification (pure) and the order-creation gateway.
 *
 * Local development uses Razorpay TEST keys (rzp_test_*) — there is no mock or
 * bypass path; test mode accepts Razorpay's test cards/UPI ids.
 */
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { ApiError } from './errors';
import { getRazorpayCredentials, isRazorpayConfigured } from './config';

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

export interface RefundGateway {
  /** POST /payments/{id}/refund. `receipt` is our refund document id (Razorpay echoes it and its notes). */
  createRefund(params: {
    paymentId: string;
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<{ id: string; status: string; amount: number }>;
}

const providerFailure = (err: unknown) =>
  (err as { error?: { description?: string } })?.error?.description || (err instanceof Error ? err.message : 'unknown Razorpay error');

export function createRazorpayRefundGateway(): RefundGateway {
  const { keyId, keySecret } = getRazorpayCredentials();
  const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return {
    async createRefund({ paymentId, amountPaise, receipt, notes }) {
      try {
        const refund = await client.payments.refund(paymentId, { amount: amountPaise, receipt, notes, speed: 'normal' });
        return { id: refund.id, status: String(refund.status), amount: Number(refund.amount) };
      } catch (err) {
        throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment provider could not start this refund. Please try again.', providerFailure(err));
      }
    },
  };
}

/**
 * Razorpay Payment Links (POST /v1/payment_links), for staff-entered prepaid orders: Razorpay sends the link to
 * the customer by SMS / email and the payment arrives as `payment_link.paid` (api/_lib/webhook.ts).
 * Docs: https://razorpay.com/docs/api/payments/payment-links/create-standard/ and
 * https://razorpay.com/docs/webhooks/payment-links/
 */
export interface PaymentLinkGateway {
  /** False until the Razorpay keys are set (DEPLOYMENT.md). */
  isConfigured(): boolean;
  createPaymentLink(params: {
    amountPaise: number;
    /** Our order number; Razorpay requires it unique per link (max 40 chars). */
    referenceId: string;
    description: string;
    customer: { name: string; email?: string; contact?: string };
    /** Unix seconds; at least 15 minutes ahead. */
    expireBy: number;
    notes: Record<string, string>;
  }): Promise<{ id: string; url: string; razorpayOrderId: string | null }>;
}

export function createRazorpayPaymentLinkGateway(): PaymentLinkGateway {
  return {
    isConfigured: isRazorpayConfigured,
    async createPaymentLink({ amountPaise, referenceId, description, customer, expireBy, notes }) {
      const { keyId, keySecret } = getRazorpayCredentials();
      const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
      try {
        const link = await client.paymentLink.create({
          amount: amountPaise,
          currency: 'INR',
          reference_id: referenceId,
          description,
          customer: {
            name: customer.name,
            ...(customer.email ? { email: customer.email } : {}),
            ...(customer.contact ? { contact: customer.contact } : {}),
          },
          notify: { sms: Boolean(customer.contact), email: Boolean(customer.email) },
          reminder_enable: true,
          expire_by: expireBy,
          notes,
        });
        // Not in the SDK typings; present when Razorpay creates the link's order up front.
        const orderId = (link as unknown as { order_id?: unknown }).order_id;
        return { id: link.id, url: link.short_url, razorpayOrderId: typeof orderId === 'string' && orderId ? orderId : null };
      } catch (err) {
        throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment provider could not create the payment link. Please try again.', providerFailure(err));
      }
    },
  };
}

/** Credentials are read on first use, so flows that never charge (COD) work without Razorpay configured. */
export function createRazorpayGateway(): PaymentGateway {
  let client: Razorpay | null = null;
  const getClient = () => {
    if (!client) {
      const { keyId, keySecret } = getRazorpayCredentials();
      client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
    return client;
  };
  return {
    async createOrder({ amountPaise, currency, receipt, notes }) {
      const razorpay = getClient();
      try {
        const order = await razorpay.orders.create({ amount: amountPaise, currency, receipt, notes });
        return { id: order.id, amount: Number(order.amount), currency: order.currency };
      } catch (err) {
        throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment provider could not start this payment. Please try again.', providerFailure(err));
      }
    },
  };
}
