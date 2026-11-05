/**
 * Order cancellation (customer POST /api/order-cancel, staff CANCEL_ORDER).
 *
 * Customers may cancel only before production starts (Paid / Confirmed_COD).
 * Staff may cancel from any status the state machine allows (before dispatch,
 * or after an RTO comes back).
 *
 * One transaction: status → Cancelled, committed stock returned, cancellation
 * notification enqueued; for a COD order that was already invoiced (RTO), a
 * credit note reverses the invoice since no refund will. Then, for prepaid
 * orders, a full refund of the refundable balance is requested (refunds.ts);
 * the order becomes Refunded when Razorpay confirms it. A refund that cannot be
 * started leaves the order Cancelled and flagged REFUND_NOT_STARTED for finance.
 */
import { auditInTransaction, buildAuditEntry } from './audit';
import { ApiError } from './errors';
import { applyCreditNote, planCreditNote } from './gst/invoice';
import { applyStockDelta, planRestock } from './inventory';
import { CUSTOMER_CANCELLABLE_STATUSES, canTransition } from './orderLifecycle';
import { applyStatusChange, planStatusChange } from './orderTransitions';
import { asOrder, orderPath, type OrderDoc } from './orders';
import type { RefundGateway } from './razorpay';
import { createRefund, refundCeilingPaise } from './refunds';
import type { RefundDoc } from './refundRecords';
import { arrayUnion, type DocStore } from './store';

type Actor = Parameters<typeof buildAuditEntry>[0]['actor'];

export interface CancelResult {
  order: OrderDoc;
  refund: RefundDoc | null;
  refundError: string | null;
}

export async function cancelOrder(
  store: DocStore,
  gateway: RefundGateway | null,
  params: { orderId: string; reason: string; initiatedBy: 'customer' | 'staff'; actor: Actor; refund?: boolean; ip?: string; now?: number },
): Promise<CancelResult> {
  const now = params.now ?? Date.now();
  const reason = params.reason.trim().slice(0, 300) || 'Cancelled';

  const order = await store.runTransaction(async tx => {
    const current = asOrder(await tx.get(orderPath(params.orderId)));
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    if (params.initiatedBy === 'customer' && !CUSTOMER_CANCELLABLE_STATUSES.includes(current.status)) {
      throw new ApiError(409, 'CONFLICT', 'This order is already in production and can no longer be cancelled online. Please contact support.');
    }
    if (!canTransition(current.status, 'Cancelled')) {
      throw new ApiError(409, 'CONFLICT', `An order in status ${current.status} cannot be cancelled.`);
    }
    const restock = await planRestock(tx, current);
    const creditNote = current.paymentMethod === 'cod' ? await planCreditNote(tx, current.id, `cancel_${current.id}`, now) : null;
    const plan = await planStatusChange(tx, current, {
      to: 'Cancelled',
      by: params.initiatedBy === 'customer' ? 'customer' : params.actor.uid,
      note: reason,
      customerNote: params.initiatedBy === 'staff' ? reason : undefined,
    });

    applyStockDelta(tx, restock, 1, now);
    const note = creditNote ? applyCreditNote(tx, creditNote, { refundId: `cancel_${current.id}`, amountPaise: current.amounts.totalPaise, reason, now }) : null;
    applyStatusChange(tx, plan, current, now, {
      cancelledAt: now,
      cancellationReason: reason,
      cancelledBy: params.initiatedBy,
      ...(restock.items.length > 0 ? { stockReservation: { ...current.stockReservation, status: 'released' } } : {}),
    });
    auditInTransaction(
      store,
      tx,
      buildAuditEntry({
        actor: params.actor,
        action: params.initiatedBy === 'customer' ? 'ORDER_CANCELLED_BY_CUSTOMER' : 'ORDER_CANCELLED',
        targetType: 'order',
        targetId: current.id,
        details: { from: current.status, reason, creditNote: note?.number ?? null },
        ip: params.ip,
        now,
      }),
    );
    return { ...current, status: 'Cancelled' } as OrderDoc;
  });

  const wantsRefund = params.refund !== false && order.paymentMethod === 'prepaid' && refundCeilingPaise(order) > 0;
  if (!wantsRefund) return { order, refund: null, refundError: null };
  try {
    const refund = await createRefund(store, gateway, {
      orderId: order.id,
      amountPaise: refundCeilingPaise(order),
      reason: `Cancellation: ${reason}`,
      method: 'razorpay',
      idempotencyKey: `cancel_${order.id}`,
      requestedBy: params.initiatedBy === 'customer' ? 'customer' : params.actor.uid,
      source: params.initiatedBy === 'customer' ? 'customer_cancel' : 'staff',
      actor: params.actor,
      ip: params.ip,
      now,
    });
    return { order, refund, refundError: null };
  } catch (err) {
    console.error(`[cancellation] refund for cancelled order ${order.id} could not be started`, err);
    await store.update(orderPath(order.id), { flags: arrayUnion('REFUND_NOT_STARTED'), updatedAt: now });
    return { order, refund: null, refundError: 'The refund could not be started automatically; our team will process it.' };
  }
}
