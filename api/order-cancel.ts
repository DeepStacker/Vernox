/**
 * POST /api/order-cancel — customer cancellation before production starts.
 * Body: { orderId, email?, reason? }. Access as for order-status (owner token or
 * the order's email); rate-limited per IP. No OTP yet: the order id is a random
 * 20-character id that only the customer receives. See api/_lib/cancellation.ts.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { optionalUser } from './_lib/auth';
import { cancelOrder } from './_lib/cancellation';
import { sendError } from './_lib/errors';
import { getAdminAuth, getStore } from './_lib/firebaseAdmin';
import { assertMethod, clientIp, parseBody } from './_lib/http';
import { loadCustomerOrder, optionalEmailSchema, orderIdSchema } from './_lib/orderAccess';
import { createRazorpayRefundGateway } from './_lib/razorpay';
import { enforceRateLimit, RATE_LIMITS } from './_lib/rateLimit';
import { withStoredIntegrations } from './_lib/withIntegrations';

const bodySchema = z.object({
  orderId: orderIdSchema,
  email: optionalEmailSchema,
  reason: z.string().trim().max(300).optional(),
}) as unknown as z.ZodType<{ orderId: string; email?: string; reason?: string }, z.ZodTypeDef, unknown>;

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['POST']);
    const body = parseBody(req, bodySchema);
    const store = getStore();
    await enforceRateLimit(store, req, RATE_LIMITS.orderCancel);
    const user = await optionalUser(req, getAdminAuth());
    const order = await loadCustomerOrder(store, body.orderId, body.email, user);

    const result = await cancelOrder(store, order.paymentMethod === 'prepaid' ? createRazorpayRefundGateway() : null, {
      orderId: order.id,
      reason: body.reason || 'Cancelled by customer',
      initiatedBy: 'customer',
      actor: { uid: user?.uid ?? 'guest', email: order.email, role: 'system' },
      ip: clientIp(req),
    });
    return res.status(200).json({
      success: true,
      orderId: result.order.id,
      status: result.order.status,
      refund: result.refund ? { status: result.refund.status, amount: result.refund.amountPaise / 100 } : null,
      message: result.refundError ?? (result.refund ? 'Your order is cancelled. The refund has been initiated.' : 'Your order is cancelled.'),
    });
  } catch (err) {
    return sendError(res, err, 'order-cancel');
  }
}

export default withStoredIntegrations(handler);
