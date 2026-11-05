/**
 * Transactional outbox: enqueue a customer notification in the same transaction
 * as the business change that causes it (see types.ts for the model).
 *
 * Usage inside a transaction (reads before writes, as Firestore requires):
 *   const plan = await planNotification(tx, order.id, 'shipped');   // read phase
 *   ...
 *   enqueueNotification(tx, plan, payloadFromOrder(order), now);   // write phase
 */
import { phoneKey, type OrderDoc } from '../orders';
import type { StoreTransaction } from '../store';
import type { NotificationEvent, NotificationPayload, OutboxDoc } from './types';

export const OUTBOX_COLLECTION = 'notifications_outbox';

export interface NotificationPlan {
  path: string;
  id: string;
  orderId: string;
  event: NotificationEvent;
  exists: boolean;
}

export function outboxId(orderId: string, event: NotificationEvent, discriminator?: string): string {
  const suffix = discriminator ? `_${discriminator.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)}` : '';
  return `${orderId}_${event}${suffix}`;
}

export async function planNotification(
  tx: StoreTransaction,
  orderId: string,
  event: NotificationEvent,
  discriminator?: string,
): Promise<NotificationPlan> {
  const id = outboxId(orderId, event, discriminator);
  const path = `${OUTBOX_COLLECTION}/${id}`;
  return { path, id, orderId, event, exists: (await tx.get(path)) !== null };
}

export function payloadFromOrder(order: OrderDoc, extra: Partial<NotificationPayload> = {}): NotificationPayload {
  const phone = phoneKey(order.customer?.phone ?? order.phone ?? '');
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customer?.name ?? order.shippingName ?? '',
    email: order.email,
    phone: /^[6-9][0-9]{9}$/.test(phone) ? phone : '',
    paymentMethod: order.paymentMethod ?? 'prepaid',
    totalPaise: order.amounts.totalPaise,
    courier: order.shipment?.courier ?? order.tracking?.carrier ?? null,
    awb: order.shipment?.awb ?? order.tracking?.trackingNumber ?? null,
    trackingUrl: order.shipment?.trackingUrl ?? order.tracking?.url ?? null,
    ...(order.kind === 'service' ? { service: 'consultation' as const } : {}),
    ...extra,
  };
}

/** Writes the outbox document unless the plan found one already (one notification per order + event). */
export function enqueueNotification(tx: StoreTransaction, plan: NotificationPlan, payload: NotificationPayload, now: number): boolean {
  if (plan.exists) return false;
  const doc: OutboxDoc = {
    id: plan.id,
    orderId: plan.orderId,
    event: plan.event,
    payload,
    channels: { email: payload.email ? 'pending' : 'skipped', sms: payload.phone ? 'pending' : 'skipped' },
    status: 'pending',
    attempts: 0,
    nextAttemptAt: now,
    leaseUntil: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
  };
  tx.create(plan.path, doc as unknown as Record<string, unknown>);
  return true;
}
