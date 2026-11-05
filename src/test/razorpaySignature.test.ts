// @vitest-environment node
import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { verifyPaymentSignature, verifyWebhookSignature } from '../../api/_lib/razorpay';

const SECRET = 'test_key_secret';
const sign = (payload: string | Buffer) => crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

describe('checkout callback signature', () => {
  const params = { razorpayOrderId: 'order_ABC', razorpayPaymentId: 'pay_XYZ' };

  it('accepts HMAC(order_id|payment_id)', () => {
    expect(verifyPaymentSignature({ ...params, signature: sign('order_ABC|pay_XYZ') }, SECRET)).toBe(true);
  });

  it('rejects a signature for another payment, a wrong secret, or malformed input', () => {
    expect(verifyPaymentSignature({ ...params, signature: sign('order_ABC|pay_OTHER') }, SECRET)).toBe(false);
    expect(verifyPaymentSignature({ ...params, signature: sign('order_ABC|pay_XYZ') }, 'other_secret')).toBe(false);
    expect(verifyPaymentSignature({ ...params, signature: 'abc' }, SECRET)).toBe(false);
    expect(verifyPaymentSignature({ ...params, signature: 'not-hex-'.repeat(8) }, SECRET)).toBe(false);
  });
});

describe('webhook signature', () => {
  // Whitespace matters: Razorpay signs the exact bytes it sends.
  const raw = Buffer.from('{"event":"payment.captured", "payload":{"payment":{"entity":{"id":"pay_1"}}}}');

  it('verifies against the raw body', () => {
    expect(verifyWebhookSignature(raw, sign(raw), SECRET)).toBe(true);
  });

  it('does not verify against a re-serialised body (why the handler reads the raw stream)', () => {
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(raw.toString())));
    expect(verifyWebhookSignature(reserialised, sign(raw), SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyWebhookSignature(raw, undefined, SECRET)).toBe(false);
  });
});
