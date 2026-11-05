/**
 * Payment state changes. Shared by /api/verify-payment (checkout callback) and
 * /api/razorpay-webhook so both paths apply identical, idempotent transitions.
 * Each function runs one transaction: re-read the order, decide from its
 * current status, then write — so duplicate or out-of-order deliveries are safe.
 */
import { auditInTransaction, buildAuditEntry, SYSTEM_ACTOR } from './audit';
import { couponFromDoc, couponPath, customerKey, customerUsagePath } from './coupons';
import { ApiError } from './errors';
import { applyStockDelta, planRecommit, planRelease } from './inventory';
import { canTransition, isPaidStatus, refundStatus, type OrderStatus, type StatusHistoryEntry } from './orderLifecycle';
import { asOrder, orderPath, type OrderDoc } from './orders';
import { arrayUnion, increment, type DocStore } from './store';

export type PaymentSource = 'checkout_callback' | 'webhook';

export async function findOrderIdByRazorpayOrderId(store: DocStore, razorpayOrderId: string): Promise<string | null> {
  const results = await store.query('orders', {
    where: [{ field: 'razorpayOrderId', op: '==', value: razorpayOrderId }],
    limit: 1,
  });
  return results[0]?.id ?? null;
}

export async function findOrderIdByPaymentId(store: DocStore, razorpayPaymentId: string): Promise<string | null> {
  const results = await store.query('orders', {
    where: [{ field: 'razorpayPaymentId', op: '==', value: razorpayPaymentId }],
    limit: 1,
  });
  return results[0]?.id ?? null;
}

/** Reservation after a release; 'none' / 'committed' reservations are left as they are. */
const releasedReservation = (order: OrderDoc) =>
  order.stockReservation.status === 'held' ? { ...order.stockReservation, status: 'released' } : order.stockReservation;

const history = (status: OrderStatus, at: number, by: string, note?: string): StatusHistoryEntry =>
  note ? { status, at, by, note } : { status, at, by };

export type ConfirmOutcome =
  | { outcome: 'paid'; order: OrderDoc }
  | { outcome: 'duplicate'; order: OrderDoc }
  /** Captured amount/currency differs from the order: flagged for manual review. */
  | { outcome: 'discrepancy'; order: OrderDoc }
  /** Payment arrived for an order that can no longer be paid (e.g. cancelled): flagged. */
  | { outcome: 'unexpected'; order: OrderDoc };

export async function confirmPayment(
  store: DocStore,
  params: {
    orderId: string;
    razorpayPaymentId: string;
    source: PaymentSource;
    /** Known only from webhooks; the checkout callback's signature already binds the server-set amount. */
    captured?: { amountPaise: number; currency: string };
    now?: number;
  },
): Promise<ConfirmOutcome> {
  const now = params.now ?? Date.now();
  const by = params.source === 'webhook' ? 'razorpay' : 'customer';

  return store.runTransaction(async tx => {
    const order = asOrder(await tx.get(orderPath(params.orderId)));
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');

    if (isPaidStatus(order.status)) {
      if (order.razorpayPaymentId && order.razorpayPaymentId !== params.razorpayPaymentId) {
        console.error(
          `[payments] order ${order.id} already paid by ${order.razorpayPaymentId}; second payment ${params.razorpayPaymentId} needs a refund`,
        );
        tx.update(orderPath(order.id), {
          flags: arrayUnion('DUPLICATE_PAYMENT'),
          unexpectedPayments: arrayUnion(params.razorpayPaymentId),
          updatedAt: now,
        });
      }
      return { outcome: 'duplicate', order };
    }

    if (
      params.captured &&
      (params.captured.amountPaise !== order.amounts.totalPaise ||
        params.captured.currency.toUpperCase() !== order.currency)
    ) {
      const note = `captured ${params.captured.amountPaise} ${params.captured.currency}, expected ${order.amounts.totalPaise} ${order.currency}`;
      console.error(`[payments] SECURITY: amount mismatch on order ${order.id}: ${note}`);
      const canFlagStatus = canTransition(order.status, 'Payment_Discrepancy');
      tx.update(orderPath(order.id), {
        ...(canFlagStatus
          ? { status: 'Payment_Discrepancy', statusHistory: arrayUnion(history('Payment_Discrepancy', now, by, note)) }
          : {}),
        flags: arrayUnion('AMOUNT_MISMATCH'),
        unexpectedPayments: arrayUnion(params.razorpayPaymentId),
        updatedAt: now,
      });
      return { outcome: 'discrepancy', order };
    }

    if (!canTransition(order.status, 'Paid')) {
      console.error(`[payments] payment ${params.razorpayPaymentId} received for order ${order.id} in status ${order.status}`);
      tx.update(orderPath(order.id), {
        flags: arrayUnion('PAYMENT_FOR_CLOSED_ORDER'),
        unexpectedPayments: arrayUnion(params.razorpayPaymentId),
        updatedAt: now,
      });
      return { outcome: 'unexpected', order };
    }

    // ---- reads ----
    const recommit = await planRecommit(tx, order);
    const couponDoc = order.coupon ? await tx.get(couponPath(order.coupon.id)) : null;
    const usagePath = order.coupon ? customerUsagePath(order.coupon.id, order.email) : null;
    const usageDoc = usagePath ? await tx.get(usagePath) : null;

    // ---- decide ----
    const flags: string[] = [];
    if (recommit.shortfalls.length > 0) flags.push('STOCK_SHORTFALL_AFTER_LATE_PAYMENT');
    const coupon = order.coupon && couponDoc ? couponFromDoc(order.coupon.id, couponDoc) : null;
    if (order.coupon && !coupon) flags.push('COUPON_MISSING_AT_PAYMENT');
    if (coupon) {
      const customerCount = typeof usageDoc?.count === 'number' ? usageDoc.count : 0;
      // The customer already paid the quoted price, so an exhausted coupon is
      // honoured and flagged rather than failing a captured payment.
      if (
        (coupon.maxUsageCount !== null && coupon.usedCount >= coupon.maxUsageCount) ||
        (coupon.maxUsagePerCustomer !== null && customerCount >= coupon.maxUsagePerCustomer)
      ) {
        flags.push('COUPON_LIMIT_EXCEEDED_AT_PAYMENT');
      }
    }

    // ---- writes ----
    const wasReleased = order.stockReservation?.status === 'released';
    applyStockDelta(tx, recommit, -1, now);
    tx.update(orderPath(order.id), {
      status: 'Paid',
      statusHistory: arrayUnion(history('Paid', now, by, wasReleased ? 'late payment after reservation release' : undefined)),
      razorpayPaymentId: params.razorpayPaymentId,
      paidAt: now,
      paymentConfirmedVia: params.source,
      ...(order.stockReservation?.status === 'none' ? {} : { stockReservation: { ...order.stockReservation, status: 'committed' } }),
      ...(flags.length > 0 ? { flags: arrayUnion(...flags) } : {}),
      updatedAt: now,
    });

    if (order.coupon && coupon && usagePath) {
      tx.update(couponPath(coupon.id), { usedCount: increment(1), updatedAt: now });
      tx.set(usagePath, { count: increment(1), customerKey: customerKey(order.email), updatedAt: now }, { merge: true });
      tx.set(`coupon_usages/${order.id}`, {
        couponId: coupon.id,
        couponCode: coupon.code,
        orderId: order.id,
        customerEmail: order.email,
        discountPaise: order.coupon.discountPaise,
        orderTotalPaise: order.amounts.totalPaise,
        usedAt: now,
      });
    }

    auditInTransaction(
      store,
      tx,
      buildAuditEntry({
        actor: SYSTEM_ACTOR,
        action: params.source === 'webhook' ? 'ORDER_PAID_WEBHOOK' : 'ORDER_PAID_CALLBACK',
        targetType: 'order',
        targetId: order.id,
        details: { razorpayPaymentId: params.razorpayPaymentId, flags },
        now,
      }),
    );

    return { outcome: 'paid', order: { ...order, status: 'Paid', razorpayPaymentId: params.razorpayPaymentId } };
  });
}

/** payment.failed: release the reservation; the customer may still retry on the same Razorpay order. */
export async function markPaymentFailed(
  store: DocStore,
  params: { orderId: string; razorpayPaymentId: string | null; reason: string; now?: number },
): Promise<'failed' | 'ignored'> {
  const now = params.now ?? Date.now();
  return store.runTransaction(async tx => {
    const order = asOrder(await tx.get(orderPath(params.orderId)));
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    if (order.status !== 'Pending_Payment') return 'ignored';
    const release = await planRelease(tx, order);
    applyStockDelta(tx, release, 1, now);
    tx.update(orderPath(order.id), {
      status: 'Payment_Failed',
      statusHistory: arrayUnion(history('Payment_Failed', now, 'razorpay', params.reason.slice(0, 200))),
      failureReason: params.reason.slice(0, 500),
      lastFailedPaymentId: params.razorpayPaymentId,
      stockReservation: releasedReservation(order),
      updatedAt: now,
    });
    return 'failed';
  });
}

/** Releases an unpaid order whose reservation TTL has passed. Returns false if it no longer qualifies. */
export async function expireOrder(store: DocStore, orderId: string, now = Date.now()): Promise<boolean> {
  return store.runTransaction(async tx => {
    const order = asOrder(await tx.get(orderPath(orderId)));
    if (!order || order.status !== 'Pending_Payment' || order.reservationExpiresAt > now) return false;
    const release = await planRelease(tx, order);
    applyStockDelta(tx, release, 1, now);
    tx.update(orderPath(order.id), {
      status: 'Expired',
      statusHistory: arrayUnion(history('Expired', now, 'system', 'payment window elapsed')),
      stockReservation: releasedReservation(order),
      updatedAt: now,
    });
    return true;
  });
}

/**
 * Compensates a checkout whose Razorpay order could not be created: cancels the
 * order, returns its stock and frees the idempotency key so the client can retry.
 */
export async function cancelUnstartedCheckout(store: DocStore, orderId: string, now = Date.now()): Promise<void> {
  await store.runTransaction(async tx => {
    const order = asOrder(await tx.get(orderPath(orderId)));
    if (!order || order.status !== 'Pending_Payment' || order.razorpayOrderId) return;
    const release = await planRelease(tx, order);
    applyStockDelta(tx, release, 1, now);
    tx.update(orderPath(order.id), {
      status: 'Cancelled',
      statusHistory: arrayUnion(history('Cancelled', now, 'system', 'payment provider unavailable')),
      stockReservation: releasedReservation(order),
      updatedAt: now,
    });
    tx.delete(`idempotency/${order.idempotencyKey}`);
  });
}

/** refund.processed: records the refund once (by refund id) and derives full vs partial status. */
export async function recordRefund(
  store: DocStore,
  params: { orderId: string; refundId: string; amountPaise: number; now?: number },
): Promise<'recorded' | 'duplicate'> {
  const now = params.now ?? Date.now();
  return store.runTransaction(async tx => {
    const order = asOrder(await tx.get(orderPath(params.orderId)));
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    if ((order.refunds ?? []).some(r => r.refundId === params.refundId)) return 'duplicate';

    const refundedPaise = (order.refundedPaise ?? 0) + params.amountPaise;
    const next = refundStatus(refundedPaise, order.amounts.totalPaise);
    const statusChange = canTransition(order.status, next)
      ? { status: next, statusHistory: arrayUnion(history(next, now, 'razorpay', `refund ${params.refundId}`)) }
      : {};
    if (!statusChange.status) {
      console.error(`[payments] refund ${params.refundId} on order ${order.id} in status ${order.status}; status left unchanged`);
    }
    tx.update(orderPath(order.id), {
      ...statusChange,
      refunds: arrayUnion({ refundId: params.refundId, amountPaise: params.amountPaise, at: now }),
      refundedPaise,
      updatedAt: now,
    });
    auditInTransaction(
      store,
      tx,
      buildAuditEntry({
        actor: SYSTEM_ACTOR,
        action: next === 'Refunded' ? 'ORDER_REFUNDED' : 'ORDER_PARTIALLY_REFUNDED',
        targetType: 'order',
        targetId: order.id,
        details: { refundId: params.refundId, amountPaise: params.amountPaise, refundedPaise },
        now,
      }),
    );
    return 'recorded';
  });
}
