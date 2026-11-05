/**
 * Returns: customer request (POST /api/return-request) and staff review
 * (APPROVE_RETURN, REJECT_RETURN, MARK_RETURN_RECEIVED).
 *
 *   Delivered ──request──► Return_Requested ──approve──► Return_Approved ──received──► Returned
 *                                  └──reject──► Delivered
 *
 * Rules: a request is accepted within `returnWindowDays` of delivery; orders with
 * a Crafting Studio piece can be returned only for damage, defect or a wrong item
 * (made-to-order goods); damage and defect claims need at least one photo,
 * uploaded by the customer to Firebase Storage `returns/{orderId}/…`
 * (storage.rules). One return per order: `returns/{orderId}` (server-only).
 *
 * Resolution: `refund` — finance issues CREATE_REFUND once the item is received
 * (Returned → Refunded via the refund webhook). `replacement` — receiving the item
 * creates a linked zero-value order (`paymentMethod: 'replacement'`, status Paid)
 * that goes through production again; no tax invoice is issued for it (no
 * consideration; it ships on a delivery challan).
 */
import { auditInTransaction, buildAuditEntry } from './audit';
import { ApiError } from './errors';
import { applyStockDelta, planRestock } from './inventory';
import { enqueueNotification, payloadFromOrder, planNotification } from './notifications/outbox';
import { applyStatusChange, planStatusChange } from './orderTransitions';
import { asOrder, buildOrderDoc, generateOrderNumber, orderPath, type OrderDoc } from './orders';
import type { OrderTotals, PricedLine } from './pricing';
import type { DocStore } from './store';
import type { StoreConfig } from './storeConfig';

type Actor = Parameters<typeof buildAuditEntry>[0]['actor'];

export const RETURN_REASONS = ['damaged', 'defective', 'wrong_item', 'not_as_described', 'changed_mind'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
const CUSTOM_ALLOWED: readonly ReturnReason[] = ['damaged', 'defective', 'wrong_item'];
const PHOTO_REQUIRED: readonly ReturnReason[] = ['damaged', 'defective'];
const DAY_MS = 24 * 3600_000;

export interface ReturnDoc {
  orderId: string;
  status: 'requested' | 'approved' | 'rejected' | 'received';
  reason: ReturnReason;
  details: string;
  photoPaths: string[];
  resolution: 'refund' | 'replacement' | null;
  decisionNote: string | null;
  replacementOrderId: string | null;
  requestedAt: number;
  decidedAt: number | null;
  decidedBy: string | null;
  receivedAt: number | null;
  updatedAt: number;
}

export const returnPath = (orderId: string) => `returns/${orderId}`;

/** Pure eligibility check (exported for tests). */
export function assertReturnEligible(order: OrderDoc, reason: ReturnReason, photoPaths: string[], windowDays: number, now: number) {
  if (order.status !== 'Delivered') throw new ApiError(409, 'CONFLICT', 'Returns can be requested only for delivered orders.');
  const deliveredAt = order.deliveredAt ?? null;
  if (!deliveredAt || now > deliveredAt + windowDays * DAY_MS) {
    throw new ApiError(409, 'CONFLICT', `The return window of ${windowDays} days after delivery has closed. Please contact support.`);
  }
  if (order.items.some(i => i.isCustom) && !CUSTOM_ALLOWED.includes(reason)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Custom studio pieces are made to order and can be returned only if damaged, defective or wrong.');
  }
  if (PHOTO_REQUIRED.includes(reason) && photoPaths.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please add at least one photo of the damage or defect.');
  }
  const prefix = `returns/${order.id}/`;
  if (photoPaths.some(p => !p.startsWith(prefix) || p.includes('..'))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Photos must be uploaded for this order.');
  }
}

export async function requestReturn(
  store: DocStore,
  config: StoreConfig,
  params: { orderId: string; reason: ReturnReason; details: string; photoPaths: string[]; now?: number },
): Promise<ReturnDoc> {
  const now = params.now ?? Date.now();
  return store.runTransaction(async tx => {
    const order = asOrder(await tx.get(orderPath(params.orderId)));
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'No order matches these details.');
    if (await tx.get(returnPath(order.id))) throw new ApiError(409, 'CONFLICT', 'A return has already been requested for this order.');
    assertReturnEligible(order, params.reason, params.photoPaths, config.fulfilment.returnWindowDays, now);
    const plan = await planStatusChange(tx, order, { to: 'Return_Requested', by: 'customer', note: params.reason });
    const doc: ReturnDoc = {
      orderId: order.id,
      status: 'requested',
      reason: params.reason,
      details: params.details.slice(0, 2000),
      photoPaths: params.photoPaths,
      resolution: null,
      decisionNote: null,
      replacementOrderId: null,
      requestedAt: now,
      decidedAt: null,
      decidedBy: null,
      receivedAt: null,
      updatedAt: now,
    };
    tx.create(returnPath(order.id), doc as unknown as Record<string, unknown>);
    applyStatusChange(tx, plan, order, now);
    return doc;
  });
}

async function loadForDecision(tx: Parameters<Parameters<DocStore['runTransaction']>[0]>[0], orderId: string, expected: ReturnDoc['status']) {
  const order = asOrder(await tx.get(orderPath(orderId)));
  if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  const ret = (await tx.get(returnPath(orderId))) as unknown as ReturnDoc | null;
  if (!ret || ret.status !== expected) throw new ApiError(409, 'CONFLICT', `This order has no return in status "${expected}".`);
  return { order, ret };
}

export async function decideReturn(
  store: DocStore,
  params: { orderId: string; approve: boolean; resolution?: 'refund' | 'replacement'; note?: string; actor: Actor; now?: number },
) {
  const now = params.now ?? Date.now();
  return store.runTransaction(async tx => {
    const { order } = await loadForDecision(tx, params.orderId, 'requested');
    const plan = params.approve
      ? await planStatusChange(tx, order, { to: 'Return_Approved', by: params.actor.uid, note: params.note, customerNote: params.note })
      : await planStatusChange(tx, order, { to: 'Delivered', by: params.actor.uid, note: params.note, customerNote: params.note, event: 'return_rejected' });
    tx.update(returnPath(order.id), {
      status: params.approve ? 'approved' : 'rejected',
      resolution: params.approve ? params.resolution ?? 'refund' : null,
      decisionNote: params.note ?? null,
      decidedAt: now,
      decidedBy: params.actor.uid,
      updatedAt: now,
    });
    applyStatusChange(tx, plan, order, now);
    auditInTransaction(
      store,
      tx,
      buildAuditEntry({ actor: params.actor, action: params.approve ? 'RETURN_APPROVED' : 'RETURN_REJECTED', targetType: 'order', targetId: order.id, details: { resolution: params.resolution ?? null }, now }),
    );
    return { orderId: order.id, status: plan.path[plan.path.length - 1] };
  });
}

/** Zero-value copy of the returned order's lines for a replacement. */
function replacementLines(order: OrderDoc): { lines: PricedLine[]; totals: OrderTotals } {
  const lines: PricedLine[] = order.items.map(i => ({
    productId: i.productId,
    name: i.name,
    category: i.category,
    sizeLabel: i.sizeLabel,
    widthMm: i.widthMm,
    heightMm: i.heightMm,
    finish: i.finish,
    quantity: i.quantity,
    unitPricePaise: 0,
    lineTotalPaise: 0,
    isCustom: i.isCustom,
    customDesignRef: i.customDesignRef,
    hsnCode: i.hsnCode ?? '',
    gstRateBps: i.gstRateBps ?? order.amounts.gstRateBps,
  }));
  return {
    lines,
    totals: {
      subtotalPaise: 0,
      discountPaise: 0,
      shippingPaise: 0,
      codFeePaise: 0,
      taxPaise: 0,
      totalPaise: 0,
      gstRateBps: order.amounts.gstRateBps,
      taxBreakdown: { lines: lines.map(l => ({ discountPaise: 0, taxablePaise: 0, gstRateBps: l.gstRateBps, taxPaise: 0 })), charges: [] },
    },
  };
}

export async function markReturnReceived(
  store: DocStore,
  params: { orderId: string; restock: boolean; note?: string; actor: Actor; now?: number },
) {
  const now = params.now ?? Date.now();
  const replacementId = store.newId('orders');
  const replacementNumber = generateOrderNumber(now);
  return store.runTransaction(async tx => {
    const { order, ret } = await loadForDecision(tx, params.orderId, 'approved');
    const replacing = ret.resolution === 'replacement';
    const items = order.stockReservation?.items ?? [];
    const stock = items.length > 0 ? await planRestock(tx, { ...order, stockReservation: { status: 'committed', items } }) : { items: [], shortfalls: [] };
    const plan = await planStatusChange(tx, order, { to: 'Returned', by: params.actor.uid, note: params.note });
    const replacementNotice = replacing ? await planNotification(tx, replacementId, 'order_confirmed') : null;

    // Net stock change: the returned goods come back (if resellable) and the replacement takes the same items.
    const delta = (params.restock ? 1 : 0) - (replacing ? 1 : 0);
    if (delta !== 0) applyStockDelta(tx, stock, delta as 1 | -1, now);
    let replacement: OrderDoc | null = null;
    if (replacing) {
      const { lines, totals } = replacementLines(order);
      replacement = buildOrderDoc({
        id: replacementId,
        orderNumber: replacementNumber,
        userId: order.userId,
        customer: order.customer,
        lines,
        totals,
        coupon: null,
        reservedItems: stock.items,
        idempotencyKey: `replacement_${order.id}`,
        reservationTtlMs: 0,
        now,
        paymentMethod: 'replacement',
        leadTimeDays: order.leadTimeDays,
        parentOrderId: order.id,
      });
      tx.create(orderPath(replacementId), replacement as unknown as Record<string, unknown>);
      if (replacementNotice) enqueueNotification(tx, replacementNotice, payloadFromOrder(replacement), now);
    }
    tx.update(returnPath(order.id), { status: 'received', receivedAt: now, replacementOrderId: replacement?.id ?? null, updatedAt: now });
    applyStatusChange(tx, plan, order, now, replacement ? { replacementOrderId: replacement.id } : {});
    auditInTransaction(
      store,
      tx,
      buildAuditEntry({ actor: params.actor, action: 'RETURN_RECEIVED', targetType: 'order', targetId: order.id, details: { restocked: params.restock, replacementOrderId: replacement?.id ?? null }, now }),
    );
    return { orderId: order.id, status: 'Returned' as const, replacementOrderId: replacement?.id ?? null, replacementOrderNumber: replacement?.orderNumber ?? null };
  });
}
