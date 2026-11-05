/**
 * Refund creation (staff CREATE_REFUND, customer cancellation).
 *
 * 1. Transaction: check the ceiling (collected − refunded − pending), write
 *    `refunds/{id}` as `pending` and reserve the amount in `order.refundPendingPaise`.
 *    Two concurrent refunds therefore cannot together exceed what was collected.
 * 2. Call Razorpay `POST /payments/{paymentId}/refund` with `receipt` = refund id and
 *    the id in notes, so the refund.processed webhook reconciles to this document.
 * 3. A `processed` response is recorded immediately; otherwise the webhook records
 *    it. recordRefund() is keyed by the Razorpay refund id, so whichever arrives
 *    second is a no-op. A provider failure marks the document `failed` and releases
 *    the reservation.
 *
 * Manual refunds (bank transfer / UPI for COD orders) skip step 2 and are recorded
 * at once with the staff-entered reference.
 */
import { auditInTransaction, buildAuditEntry } from './audit';
import { ApiError } from './errors';
import { asOrder, orderPath, type OrderDoc } from './orders';
import { collectedPaise, recordRefund } from './payments';
import type { RefundGateway } from './razorpay';
import { refundPath, type RefundDoc, type RefundMethod } from './refundRecords';
import { increment, type DocStore } from './store';

export interface CreateRefundParams {
  orderId: string;
  amountPaise: number;
  reason: string;
  method: RefundMethod;
  /** Manual refunds: bank/UPI transaction reference. */
  reference?: string;
  /** Makes retries of the same request return the same refund. */
  idempotencyKey?: string;
  requestedBy: string;
  source: RefundDoc['source'];
  actor: Parameters<typeof buildAuditEntry>[0]['actor'];
  ip?: string;
  now?: number;
}

export function refundCeilingPaise(order: OrderDoc): number {
  return Math.max(0, collectedPaise(order) - (order.refundedPaise ?? 0) - (order.refundPendingPaise ?? 0));
}

export async function createRefund(store: DocStore, gateway: RefundGateway | null, params: CreateRefundParams): Promise<RefundDoc> {
  const now = params.now ?? Date.now();
  const id = params.idempotencyKey ? `rf_${params.idempotencyKey}` : store.newId('refunds');

  const reserved = await store.runTransaction(async tx => {
    const existing = (await tx.get(refundPath(id))) as unknown as RefundDoc | null;
    if (existing) {
      if (existing.orderId !== params.orderId || existing.amountPaise !== params.amountPaise) {
        throw new ApiError(409, 'CONFLICT', 'This idempotency key was already used for a different refund.');
      }
      return { refund: existing, created: false, order: null };
    }
    const order = asOrder(await tx.get(orderPath(params.orderId)));
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    if (params.method === 'razorpay' && !order.razorpayPaymentId) {
      throw new ApiError(409, 'CONFLICT', 'This order has no online payment to refund. Use a manual refund for COD orders.');
    }
    if (params.method === 'manual' && !params.reference) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Manual refunds need the bank or UPI transaction reference.');
    }
    const ceiling = refundCeilingPaise(order);
    if (params.amountPaise <= 0 || params.amountPaise > ceiling) {
      throw new ApiError(409, 'CONFLICT', `Refund amount exceeds the refundable balance of ₹${(ceiling / 100).toFixed(2)}.`);
    }
    const refund: RefundDoc = {
      id,
      orderId: order.id,
      amountPaise: params.amountPaise,
      reason: params.reason.slice(0, 500),
      method: params.method,
      source: params.source,
      status: 'pending',
      requestedBy: params.requestedBy,
      providerRefundId: params.method === 'manual' ? params.reference! : null,
      createdAt: now,
      processedAt: null,
      updatedAt: now,
      error: null,
      creditNoteId: null,
      creditNoteNumber: null,
    };
    tx.create(refundPath(id), refund as unknown as Record<string, unknown>);
    tx.update(orderPath(order.id), { refundPendingPaise: increment(params.amountPaise), updatedAt: now });
    auditInTransaction(
      store,
      tx,
      buildAuditEntry({
        actor: params.actor,
        action: 'REFUND_REQUESTED',
        targetType: 'order',
        targetId: order.id,
        details: { refundId: id, amountPaise: params.amountPaise, method: params.method, reason: refund.reason },
        ip: params.ip,
        now,
      }),
    );
    return { refund, created: true, order };
  });

  if (!reserved.created) return reserved.refund;
  const { refund, order } = reserved;

  if (refund.method === 'manual') {
    // Our document id is the dedupe key for manual refunds.
    await recordRefund(store, { orderId: refund.orderId, refundId: refund.id, amountPaise: refund.amountPaise, refundDocId: refund.id, by: params.requestedBy, now });
    return { ...refund, status: 'processed' };
  }

  if (!gateway) throw new ApiError(500, 'CONFIG_ERROR', 'Refunds are not configured.', 'no refund gateway');
  let providerRefund: { id: string; status: string; amount: number };
  try {
    providerRefund = await gateway.createRefund({
      paymentId: order!.razorpayPaymentId!,
      amountPaise: refund.amountPaise,
      receipt: refund.id,
      notes: { orderId: refund.orderId, refundDocId: refund.id },
    });
  } catch (err) {
    await store.runTransaction(async tx => {
      const current = (await tx.get(refundPath(refund.id))) as unknown as RefundDoc | null;
      if (current?.status !== 'pending') return;
      tx.update(refundPath(refund.id), { status: 'failed', error: err instanceof ApiError ? err.internalDetail ?? err.message : String(err), updatedAt: now });
      tx.update(orderPath(refund.orderId), { refundPendingPaise: increment(-refund.amountPaise), updatedAt: now });
    });
    throw err;
  }

  await store.update(refundPath(refund.id), { providerRefundId: providerRefund.id, updatedAt: now });
  if (providerRefund.status === 'processed') {
    await recordRefund(store, { orderId: refund.orderId, refundId: providerRefund.id, amountPaise: providerRefund.amount, refundDocId: refund.id, by: params.requestedBy, now });
    return { ...refund, providerRefundId: providerRefund.id, status: 'processed' };
  }
  return { ...refund, providerRefundId: providerRefund.id };
}
