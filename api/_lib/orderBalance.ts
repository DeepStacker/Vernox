/**
 * Balance of an advance-paid staff order (staffOrders.ts `advancePaise`). The advance starts production; the
 * balance is collected before dispatch, either in person (RECORD_ORDER_PAYMENT) or with a Razorpay payment link
 * for exactly the amount owed (SEND_BALANCE_LINK, paid through the `payment_link.paid` webhook).
 *
 * GST: tax on goods is due at the invoice, which is issued when the shipment is created (or at counter handover),
 * after the balance is in, so advances need no tax entry of their own; the thermal receipt is the payment record.
 * Dispatch, delivery and shipment creation refuse while `balanceDuePaise` > 0 (orderTransitions.ts, shipments).
 *
 * Every payment is one `payments` entry with a unique id, so a webhook retry or a double click records it once.
 */
import { ApiError } from './errors';
import { auditInTransaction, buildAuditEntry, SYSTEM_ACTOR } from './audit';
import { paiseToRupees } from './money';
import { asOrder, orderPath, type OrderDoc, type OrderPaymentEntry, type PaymentLinkRecord } from './orders';
import type { PaymentLinkGateway } from './razorpay';
import { arrayUnion, type DocStore } from './store';
import type { StaffUser } from './auth';
import { PAYMENT_LINK_TTL_HOURS, type OfflinePaymentMode } from '../../src/types/staffOrders';
import type { OrderStatus } from './orderLifecycle';

/** Statuses in which the balance can be taken: paid and not yet dispatched, cancelled or refunded. */
const COLLECTABLE: readonly OrderStatus[] = ['Paid', 'In_Design', 'Cutting', 'Finishing', 'Quality_Check', 'Packed'];

/** Message for every path that would dispatch or deliver an order with money still owed. */
export function balanceDueError(order: Pick<OrderDoc, 'balanceDuePaise'>): ApiError {
  return new ApiError(409, 'CONFLICT', `₹${paiseToRupees(order.balanceDuePaise ?? 0)} is still owed on this order. Collect the balance before dispatch.`);
}

export const hasBalanceDue = (order: Pick<OrderDoc, 'balanceDuePaise'>) => (order.balanceDuePaise ?? 0) > 0;

function assertCollectable(order: OrderDoc) {
  if (!hasBalanceDue(order)) throw new ApiError(409, 'CONFLICT', 'Nothing is owed on this order.');
  if (!COLLECTABLE.includes(order.status)) {
    throw new ApiError(409, 'CONFLICT', `An order in status ${order.status} cannot take a balance payment.`);
  }
}

type Actor = Pick<StaffUser, 'uid' | 'email' | 'role'>;

export interface RecordPaymentInput {
  orderId: string;
  amountPaise: number;
  mode: OfflinePaymentMode;
  reference: string;
  /** Client-generated; makes a retried request record the payment once. */
  idempotencyKey: string;
}

/** Money taken in person towards the balance. Cancels an open balance link once nothing is owed. */
export async function recordOfflineBalancePayment(
  store: DocStore,
  links: PaymentLinkGateway | null,
  input: RecordPaymentInput,
  actor: Actor,
  now = Date.now(),
): Promise<{ balanceDuePaise: number; duplicate: boolean }> {
  if (input.mode !== 'cash' && !input.reference.trim()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Enter the UPI, card or bank transaction reference.');
  }
  const entryId = `bal_${input.idempotencyKey}`;
  const result = await store.runTransaction(async tx => {
    const order = asOrder(await tx.get(orderPath(input.orderId)));
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    if ((order.payments ?? []).some(p => p.id === entryId)) {
      return { balanceDuePaise: order.balanceDuePaise ?? 0, duplicate: true, staleLink: null };
    }
    assertCollectable(order);
    const owed = order.balanceDuePaise ?? 0;
    if (input.amountPaise > owed) {
      throw new ApiError(400, 'VALIDATION_ERROR', `Only ₹${paiseToRupees(owed)} is owed; enter that amount or less.`);
    }
    const entry: OrderPaymentEntry = {
      id: entryId, kind: 'balance', amountPaise: input.amountPaise, mode: input.mode, reference: input.reference.trim(), at: now, by: actor.email ?? actor.uid,
    };
    const balanceDuePaise = owed - input.amountPaise;
    // An open link still asks for the old amount: retire it whenever the balance changes.
    const staleLink = order.balanceLink ?? null;
    tx.update(orderPath(order.id), {
      payments: arrayUnion(entry),
      balanceDuePaise,
      ...(staleLink ? { balanceLink: null } : {}),
      updatedAt: now,
    });
    auditInTransaction(store, tx, buildAuditEntry({
      actor, action: 'ORDER_BALANCE_PAYMENT', targetType: 'order', targetId: order.id,
      details: { amountPaise: input.amountPaise, mode: input.mode, balanceDuePaise }, now,
    }));
    return { balanceDuePaise, duplicate: false, staleLink };
  });
  if (result.staleLink) await cancelQuietly(links, result.staleLink, input.orderId);
  return { balanceDuePaise: result.balanceDuePaise, duplicate: result.duplicate };
}

/**
 * Payment link for exactly what is owed. Reuses the open link while it still matches the balance and has not
 * expired, so sending twice gives the customer the same link.
 */
export async function sendBalanceLink(
  store: DocStore,
  links: PaymentLinkGateway,
  orderId: string,
  actor: Actor,
  now = Date.now(),
): Promise<PaymentLinkRecord> {
  if (!links.isConfigured()) {
    throw new ApiError(409, 'CONFIG_ERROR', 'Razorpay is not set up yet (Settings > Integrations), so no payment link can be sent.');
  }
  const order = asOrder(await store.get(orderPath(orderId)));
  if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  assertCollectable(order);
  const owed = order.balanceDuePaise ?? 0;
  const open = order.balanceLink;
  if (open && open.amountPaise === owed && open.expiresAt > now + 3600_000) return open;

  const expiresAt = now + PAYMENT_LINK_TTL_HOURS * 3600_000;
  const created = await links.createPaymentLink({
    amountPaise: owed,
    // Razorpay wants reference_id unique per link: the order number plus a short time suffix.
    referenceId: `${order.orderNumber}-B${Math.floor(now / 1000).toString(36).slice(-5)}`.slice(0, 40),
    description: `Balance for Vernox order ${order.orderNumber}`,
    customer: { name: order.customer.name, email: order.email || undefined, contact: order.customer.phone || undefined },
    expireBy: Math.floor(expiresAt / 1000),
    notes: { orderId: order.id, orderNumber: order.orderNumber, purpose: 'balance' },
  });
  const link: PaymentLinkRecord = { id: created.id, url: created.url, expiresAt, amountPaise: owed };

  const replaced = await store.runTransaction(async tx => {
    const current = asOrder(await tx.get(orderPath(orderId)));
    if (!current || (current.balanceDuePaise ?? 0) !== owed) return 'changed' as const;
    tx.update(orderPath(orderId), { balanceLink: link, updatedAt: now });
    auditInTransaction(store, tx, buildAuditEntry({
      actor, action: 'ORDER_BALANCE_LINK', targetType: 'order', targetId: orderId, details: { amountPaise: owed, linkId: link.id }, now,
    }));
    return current.balanceLink ?? null;
  });
  if (replaced === 'changed') {
    await cancelQuietly(links, link, orderId);
    throw new ApiError(409, 'CONFLICT', 'The balance changed while the link was being made. Please try again.');
  }
  if (replaced) await cancelQuietly(links, replaced, orderId);
  return link;
}

export type BalanceLinkOutcome = 'balance_paid' | 'duplicate_payment' | 'payment_discrepancy';

/** `payment_link.paid` for a balance link (webhook.ts). Money received is always recorded; mismatches are flagged. */
export async function recordBalanceLinkPayment(
  store: DocStore,
  params: { orderId: string; linkId: string; razorpayPaymentId: string; amountPaise: number; currency: string; now?: number },
): Promise<BalanceLinkOutcome> {
  const now = params.now ?? Date.now();
  return store.runTransaction(async tx => {
    const order = asOrder(await tx.get(orderPath(params.orderId)));
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    if ((order.payments ?? []).some(p => p.id === params.razorpayPaymentId)) return 'duplicate_payment';
    const owed = order.balanceDuePaise ?? 0;
    const expected = order.balanceLink?.id === params.linkId ? order.balanceLink.amountPaise : undefined;
    const mismatch = params.currency.toUpperCase() !== order.currency || expected === undefined || params.amountPaise !== expected || params.amountPaise > owed;
    const entry: OrderPaymentEntry = {
      id: params.razorpayPaymentId, kind: 'balance', amountPaise: params.amountPaise, mode: 'razorpay',
      reference: params.razorpayPaymentId, at: now, by: 'razorpay',
    };
    if (mismatch) {
      console.error(`[balance] SECURITY: balance payment ${params.razorpayPaymentId} of ${params.amountPaise} on order ${order.id}, owed ${owed}, link ${params.linkId}`);
    }
    tx.update(orderPath(order.id), {
      payments: arrayUnion(entry),
      balanceDuePaise: Math.max(0, owed - params.amountPaise),
      ...(order.balanceLink?.id === params.linkId ? { balanceLink: null } : {}),
      ...(mismatch ? { flags: arrayUnion('BALANCE_PAYMENT_MISMATCH') } : {}),
      updatedAt: now,
    });
    auditInTransaction(store, tx, buildAuditEntry({
      actor: SYSTEM_ACTOR, action: 'ORDER_BALANCE_PAYMENT', targetType: 'order', targetId: order.id,
      details: { amountPaise: params.amountPaise, mode: 'razorpay', razorpayPaymentId: params.razorpayPaymentId, mismatch }, now,
    }));
    return mismatch ? 'payment_discrepancy' : 'balance_paid';
  });
}

async function cancelQuietly(links: PaymentLinkGateway | null, link: PaymentLinkRecord, orderId: string) {
  if (!links) return;
  try {
    await links.cancelPaymentLink(link.id);
  } catch (err) {
    // The link may already be expired or paid; it no longer matches the order, and a payment on it is flagged.
    console.error(`[balance] could not cancel link ${link.id} on order ${orderId}:`, err instanceof Error ? err.message : err);
  }
}
