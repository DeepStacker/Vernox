/**
 * Payment state changes. Shared by /api/verify-payment (checkout callback) and
 * /api/razorpay-webhook so both paths apply identical, idempotent transitions.
 * Each function runs one transaction: re-read the order, decide from its
 * current status, then write — so duplicate or out-of-order deliveries are safe.
 */
import { copyConsultationPhotos, consultationPath, creditCouponId, generateCreditCode, planConsultationOnPayment, type PhotoStorage } from './consultations';
import { auditInTransaction, buildAuditEntry, SYSTEM_ACTOR } from './audit';
import { couponFromDoc, couponPath, customerUsagePath, writeCouponRedemption } from './coupons';
import { ApiError } from './errors';
import { applyCreditNote, applyInvoice, planCreditNote, planInvoice, type InvoicePlan } from './gst/invoice';
import { applyStockDelta, planRecommit, planRelease } from './inventory';
import { enqueueNotification, payloadFromOrder } from './notifications/outbox';
import { canTransition, isPaidStatus, refundStatus, type OrderStatus, type StatusHistoryEntry } from './orderLifecycle';
import { applyStatusChange, planEvent, planStatusChange } from './orderTransitions';
import { asOrder, orderPath, type OrderDoc } from './orders';
import { refundPath, type RefundDoc } from './refundRecords';
import { arrayUnion, increment, type DocStore } from './store';
import { loadStoreConfig } from './storeConfig';

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
    /** Copies a paid consultation's wall photos after the transaction; omitted = left to the claim retry. */
    photoStorage?: PhotoStorage;
  },
): Promise<ConfirmOutcome> {
  const now = params.now ?? Date.now();
  const by = params.source === 'webhook' ? 'razorpay' : 'customer';
  const creditCode = generateCreditCode(); // only used when the order is a consultation
  // Services have no dispatch, so their GST invoice is issued on payment (time of supply);
  // goods are invoiced at CREATE_SHIPMENT. Seller details come from settings/store.
  const { seller } = await loadStoreConfig(store);

  const outcome = await store.runTransaction(async (tx): Promise<ConfirmOutcome> => {
    const order = asOrder(await tx.get(orderPath(params.orderId)));
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');

    if (isPaidStatus(order.status)) {
      // A balance payment of an advance-paid order is recorded by its payment_link.paid event (orderBalance.ts).
      const balancePayment =
        (order.payments ?? []).some(p => p.id === params.razorpayPaymentId) ||
        (order.balanceLink && params.captured?.amountPaise === order.balanceLink.amountPaise);
      if (order.razorpayPaymentId && order.razorpayPaymentId !== params.razorpayPaymentId && !balancePayment) {
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

    // An advance order's payment link asks for the advance only; everything else must pay the total.
    const expectedPaise = order.advancePaise ?? order.amounts.totalPaise;
    if (
      params.captured &&
      (params.captured.amountPaise !== expectedPaise ||
        params.captured.currency.toUpperCase() !== order.currency)
    ) {
      const note = `captured ${params.captured.amountPaise} ${params.captured.currency}, expected ${expectedPaise} ${order.currency}`;
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
    const wasReleased = order.stockReservation?.status === 'released';
    const transition = await planStatusChange(tx, order, {
      to: 'Paid',
      by,
      note: wasReleased ? 'late payment after reservation release' : undefined,
    });

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

    const consultation = planConsultationOnPayment(order, creditCode, now);
    let invoicePlan: InvoicePlan | null = null;
    if (order.kind === 'service') {
      try {
        invoicePlan = await planInvoice(tx, order, seller, now);
      } catch (err) {
        // A missing GSTIN must never fail a customer's payment: confirm it and flag the invoice for finance.
        if (!(err instanceof ApiError && err.code === 'CONFIG_ERROR')) throw err;
        console.error(`[payments] service order ${order.id} paid but not invoiced: ${err.message}`);
        flags.push('INVOICE_PENDING_SELLER_SETTINGS');
      }
    }

    // ---- writes ----
    const invoiceFields = invoicePlan ? applyInvoice(tx, invoicePlan, order, seller, now) : {};
    applyStockDelta(tx, recommit, -1, now);
    applyStatusChange(tx, transition, order, now, {
      razorpayPaymentId: params.razorpayPaymentId,
      paidAt: now,
      paymentConfirmedVia: params.source,
      ...(order.advancePaise
        ? {
            balanceDuePaise: order.amounts.totalPaise - order.advancePaise,
            payments: arrayUnion({ id: params.razorpayPaymentId, kind: 'advance', amountPaise: order.advancePaise, mode: 'razorpay', reference: params.razorpayPaymentId, at: now, by }),
          }
        : {}),
      ...invoiceFields,
      ...(order.stockReservation?.status === 'none' ? {} : { stockReservation: { ...order.stockReservation, status: 'committed' } }),
      ...(flags.length > 0 ? { flags: arrayUnion(...flags) } : {}),
    }, consultation?.notificationExtra);
    if (consultation) {
      tx.create(consultationPath(order.id), consultation.consultation as unknown as Record<string, unknown>);
      if (consultation.coupon) tx.create(`coupons/${creditCouponId(order.id)}`, consultation.coupon);
    }

    if (order.coupon && coupon) {
      writeCouponRedemption(tx, {
        couponId: coupon.id,
        couponCode: coupon.code,
        orderId: order.id,
        email: order.email,
        discountPaise: order.coupon.discountPaise,
        orderTotalPaise: order.amounts.totalPaise,
        now,
        consultationId: coupon.consultationId,
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

  if (outcome.outcome === 'paid' && outcome.order.consultation && params.photoStorage) {
    // Outside the transaction (a file copy cannot roll back); copyConsultationPhotos records failure and a claim retries.
    await copyConsultationPhotos(store, params.photoStorage, outcome.order.id, now).catch(err =>
      console.error(`[payments] consultation photo copy failed for ${outcome.order.id}`, err),
    );
  }
  return outcome;
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

/** Money actually collected for an order: the captured payment (prepaid) or the cash collected (COD). */
export function collectedPaise(order: OrderDoc): number {
  if (order.paymentMethod === 'cod') return order.codCollectedPaise ?? 0;
  if (order.paymentMethod === 'replacement') return 0;
  // Staff orders paid in person (cash, UPI, card, bank transfer) are refunded manually, like COD.
  // An advance-paid order has collected the total less what is still owed.
  return order.razorpayPaymentId || order.offlinePayment ? order.amounts.totalPaise - (order.balanceDuePaise ?? 0) : 0;
}

export type RecordRefundOutcome = 'recorded' | 'duplicate';

/**
 * Records a processed refund exactly once per provider refund id, whichever path
 * reports it first (refund.processed webhook, the refund API response, or a
 * manual refund). Reconciles with our `refunds/{id}` document (written before the
 * provider was called, see refunds.ts) so pending and refunded totals never double
 * count; refunds created outside the store (Razorpay dashboard) get a document
 * with source `external`. Issues a credit note when the order was invoiced and
 * enqueues the refund notification.
 */
export async function recordRefund(
  store: DocStore,
  params: {
    orderId: string;
    /** Provider refund id (`rfnd_...`) or, for manual refunds, our refund document id. */
    refundId: string;
    amountPaise: number;
    /** Our refunds/{id}, when known (Razorpay refund notes carry it). */
    refundDocId?: string | null;
    by?: string;
    now?: number;
  },
): Promise<RecordRefundOutcome> {
  const now = params.now ?? Date.now();
  let refundDocId = params.refundDocId ?? null;
  if (!refundDocId) {
    const found = await store.query('refunds', { where: [{ field: 'providerRefundId', op: '==', value: params.refundId }], limit: 1 });
    refundDocId = found[0]?.id ?? null;
  }
  const docId = refundDocId ?? `ext_${params.refundId.replace(/[^A-Za-z0-9_-]/g, '')}`;

  return store.runTransaction(async tx => {
    const order = asOrder(await tx.get(orderPath(params.orderId)));
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    if ((order.refunds ?? []).some(r => r.refundId === params.refundId)) return 'duplicate';
    const refundDoc = (await tx.get(refundPath(docId))) as unknown as RefundDoc | null;
    if (refundDoc?.status === 'processed') return 'duplicate';

    const refundedPaise = (order.refundedPaise ?? 0) + params.amountPaise;
    const collected = collectedPaise(order) || order.amounts.totalPaise;
    const next = refundStatus(refundedPaise, collected);
    const reason = refundDoc?.reason ?? 'Refund';
    const creditNote = await planCreditNote(tx, order.id, docId, now);
    const statusPlan = canTransition(order.status, next)
      ? await planStatusChange(tx, order, { to: next, by: params.by ?? 'razorpay', note: `refund ${params.refundId}`, event: 'refund_processed', eventDiscriminator: docId })
      : null;
    const eventPlan = statusPlan ? null : await planEvent(tx, order.id, 'refund_processed', docId);
    if (!statusPlan) {
      console.error(`[payments] refund ${params.refundId} on order ${order.id} in status ${order.status}; status left unchanged`);
    }

    // ---- writes ----
    const note = applyCreditNote(tx, creditNote, { refundId: docId, amountPaise: params.amountPaise, reason, now });
    const pendingRelease = refundDoc && refundDoc.status === 'pending' ? refundDoc.amountPaise : 0;
    const fields = {
      refunds: arrayUnion({ refundId: params.refundId, amountPaise: params.amountPaise, at: now }),
      refundedPaise,
      ...(pendingRelease > 0 ? { refundPendingPaise: increment(-pendingRelease) } : {}),
    };
    const payloadExtra = { refundAmountPaise: params.amountPaise };
    if (statusPlan) applyStatusChange(tx, statusPlan, order, now, fields, payloadExtra);
    else {
      tx.update(orderPath(order.id), { ...fields, updatedAt: now });
      if (eventPlan) enqueueNotification(tx, eventPlan, payloadFromOrder(order, payloadExtra), now);
    }
    const refundFields = {
      status: 'processed',
      providerRefundId: refundDoc?.method === 'manual' ? refundDoc.providerRefundId : params.refundId,
      processedAt: now,
      creditNoteId: note?.id ?? refundDoc?.creditNoteId ?? null,
      creditNoteNumber: note?.number ?? refundDoc?.creditNoteNumber ?? null,
      updatedAt: now,
    };
    if (refundDoc) tx.update(refundPath(docId), refundFields);
    else {
      const external: RefundDoc = {
        id: docId,
        orderId: order.id,
        amountPaise: params.amountPaise,
        reason,
        method: 'razorpay',
        source: 'external',
        requestedBy: 'razorpay',
        createdAt: now,
        error: null,
        ...refundFields,
        status: 'processed',
      };
      tx.create(refundPath(docId), external as unknown as Record<string, unknown>);
    }
    auditInTransaction(
      store,
      tx,
      buildAuditEntry({
        actor: SYSTEM_ACTOR,
        action: next === 'Refunded' ? 'ORDER_REFUNDED' : 'ORDER_PARTIALLY_REFUNDED',
        targetType: 'order',
        targetId: order.id,
        details: { refundId: params.refundId, refundDocId: docId, amountPaise: params.amountPaise, refundedPaise, creditNote: note?.number ?? null },
        now,
      }),
    );
    return 'recorded';
  });
}
