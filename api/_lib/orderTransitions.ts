/**
 * Status changes with their customer notification, inside one transaction.
 *
 * Every server path that moves an order (payments, COD checkout, staff actions,
 * courier webhook, cancellations, returns) uses plan → apply so the status, its
 * history entry and the outbox document commit atomically, and the transition is
 * checked against the state machine in orderLifecycle.ts.
 */
import { ApiError } from './errors';
import { enqueueNotification, payloadFromOrder, planNotification, type NotificationPlan } from './notifications/outbox';
import type { NotificationEvent, NotificationPayload } from './notifications/types';
import { canTransition, type OrderStatus, type StatusHistoryEntry } from './orderLifecycle';
import { orderPath, type OrderDoc } from './orders';
import { arrayUnion, type DocData, type StoreTransaction } from './store';

const EVENT_FOR_STATUS: Partial<Record<OrderStatus, NotificationEvent>> = {
  Paid: 'order_confirmed',
  Confirmed_COD: 'order_confirmed',
  In_Design: 'in_production',
  Shipped: 'shipped',
  Out_For_Delivery: 'out_for_delivery',
  Delivered: 'delivered',
  Cancelled: 'cancelled',
  Return_Requested: 'return_requested',
  Return_Approved: 'return_approved',
  Returned: 'return_received',
};

export interface StatusChangeRequest {
  /** One status, or a path of consecutive statuses (e.g. a courier event that skipped a scan). */
  to: OrderStatus | OrderStatus[];
  by: string;
  /** Internal history note (staff-visible only). */
  note?: string;
  /** Text shown to the customer in the notification (e.g. a rejection reason). Never the internal note. */
  customerNote?: string;
  /** Overrides the default event for the final status; null sends nothing. */
  event?: NotificationEvent | null;
  /** Makes the notification id unique per occurrence (e.g. a refund id). */
  eventDiscriminator?: string;
}

export interface StatusChangePlan {
  path: OrderStatus[];
  request: StatusChangeRequest;
  notification: NotificationPlan | null;
}

/** Throws CONFLICT when the order cannot take this path. */
export function assertPath(order: OrderDoc, path: OrderStatus[]) {
  let from: OrderStatus = order.status;
  for (const to of path) {
    if (!canTransition(from, to)) throw new ApiError(409, 'CONFLICT', `An order in status ${from} cannot move to ${to}.`);
    from = to;
  }
}

/** Read phase. */
export async function planStatusChange(tx: StoreTransaction, order: OrderDoc, request: StatusChangeRequest): Promise<StatusChangePlan> {
  const path = Array.isArray(request.to) ? request.to : [request.to];
  assertPath(order, path);
  const final = path[path.length - 1];
  const event = request.event === undefined ? EVENT_FOR_STATUS[final] : request.event;
  const notification = event ? await planNotification(tx, order.id, event, request.eventDiscriminator) : null;
  return { path, request, notification };
}

/** Plans only a notification (for events that do not change status, e.g. a refund). */
export async function planEvent(tx: StoreTransaction, orderId: string, event: NotificationEvent, discriminator?: string) {
  return planNotification(tx, orderId, event, discriminator);
}

/** Write phase: status + history + extra fields on the order, and the outbox document. */
export function applyStatusChange(
  tx: StoreTransaction,
  plan: StatusChangePlan,
  order: OrderDoc,
  now: number,
  fields: DocData = {},
  payloadExtra: Partial<NotificationPayload> = {},
) {
  const { request } = plan;
  const entries: StatusHistoryEntry[] = plan.path.map(status => ({
    status,
    at: now,
    by: request.by,
    ...(request.note ? { note: request.note.slice(0, 500) } : {}),
  }));
  const final = plan.path[plan.path.length - 1];
  tx.update(orderPath(order.id), { ...fields, status: final, statusHistory: arrayUnion(...entries), updatedAt: now });
  if (plan.notification) {
    const updated = { ...order, ...(fields as Partial<OrderDoc>), status: final };
    enqueueNotification(tx, plan.notification, payloadFromOrder(updated, { note: request.customerNote ?? null, ...payloadExtra }), now);
  }
}
