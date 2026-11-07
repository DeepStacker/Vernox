/**
 * POST /api/verify-payment — Razorpay Checkout success callback.
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature } — nothing else is read.
 * Verifies the HMAC signature and transitions the order to Paid in one transaction
 * (stock committed, coupon redeemed; a design consultation and its credit coupon are created and its
 * wall photos copied). Returns failure if any write fails.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRazorpayCredentials } from './_lib/config';
import { ApiError, sendError } from './_lib/errors';
import { getPhotoStorage, getStore } from './_lib/firebaseAdmin';
import { assertMethod, parseBody } from './_lib/http';
import { confirmPayment, findOrderIdByRazorpayOrderId } from './_lib/payments';
import { verifyPaymentSignature } from './_lib/razorpay';
import { withStoredIntegrations } from './_lib/withIntegrations';

const bodySchema = z.object({
  razorpay_order_id: z.string().trim().min(1).max(64),
  razorpay_payment_id: z.string().trim().min(1).max(64),
  razorpay_signature: z.string().trim().min(1).max(256),
});

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['POST']);
    const body = parseBody(req, bodySchema);
    const { keySecret } = getRazorpayCredentials();

    const signatureValid = verifyPaymentSignature(
      { razorpayOrderId: body.razorpay_order_id, razorpayPaymentId: body.razorpay_payment_id, signature: body.razorpay_signature },
      keySecret,
    );
    if (!signatureValid) throw new ApiError(400, 'SIGNATURE_INVALID', 'Payment signature could not be verified.');

    const store = getStore();
    const orderId = await findOrderIdByRazorpayOrderId(store, body.razorpay_order_id);
    if (!orderId) {
      throw new ApiError(404, 'NOT_FOUND', 'Order not found for this payment.', `razorpay order ${body.razorpay_order_id}`);
    }

    const result = await confirmPayment(store, {
      orderId,
      razorpayPaymentId: body.razorpay_payment_id,
      source: 'checkout_callback',
      photoStorage: getPhotoStorage(),
    });
    if (result.outcome === 'paid' || result.outcome === 'duplicate') {
      return res.status(200).json({
        success: true,
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        status: 'Paid',
        isDuplicate: result.outcome === 'duplicate',
      });
    }
    throw new ApiError(
      409,
      'CONFLICT',
      'Your payment was received but the order needs review. Our team will contact you.',
      `order ${result.order.id} outcome ${result.outcome}`,
    );
  } catch (err) {
    return sendError(res, err, 'verify-payment');
  }
}

export default withStoredIntegrations(handler);
