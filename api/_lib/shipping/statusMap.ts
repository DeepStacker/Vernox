/**
 * Courier (Shiprocket) tracking status → order status (pure).
 *
 * Shiprocket sends both a status name (`current_status`, e.g. "OUT FOR DELIVERY")
 * and a numeric `shipment_status_id`. Names are matched first because they are
 * stable across couriers; the id is the fallback. Statuses with no order
 * meaning (pickup scheduled, undelivered attempt, delayed, lost, …) map to null:
 * they are recorded on the shipment but do not move the order.
 */
import type { OrderStatus } from '../orderLifecycle';

const BY_NAME: Array<[RegExp, OrderStatus]> = [
  [/^RTO[ _-]?(DELIVERED|ACKNOWLEDGED)/, 'RTO_Delivered'],
  [/^RTO/, 'RTO_Initiated'],
  [/^OUT FOR DELIVERY/, 'Out_For_Delivery'],
  [/^DELIVERED/, 'Delivered'],
  [/^(PICKED UP|SHIPPED|IN TRANSIT|REACHED (AT )?DESTINATION HUB|OUT FOR DELIVERY HUB)/, 'Shipped'],
];

const BY_ID: Record<number, OrderStatus> = {
  6: 'Shipped',
  7: 'Delivered',
  9: 'RTO_Initiated',
  10: 'RTO_Delivered',
  14: 'RTO_Delivered',
  17: 'Out_For_Delivery',
  18: 'Shipped',
  38: 'Shipped',
  42: 'Shipped',
};

export function normaliseCourierStatus(status: unknown): string {
  return typeof status === 'string' ? status.trim().toUpperCase().replace(/[_\s]+/g, ' ') : '';
}

export function mapCourierStatus(status: unknown, statusId?: unknown): OrderStatus | null {
  const name = normaliseCourierStatus(status);
  for (const [pattern, target] of BY_NAME) if (pattern.test(name)) return target;
  const id = typeof statusId === 'number' ? statusId : Number.parseInt(String(statusId ?? ''), 10);
  return Number.isFinite(id) ? BY_ID[id] ?? null : null;
}
