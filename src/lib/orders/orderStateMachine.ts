/**
 * Order lifecycle for the browser. Statuses and transitions come from the shared
 * definition in src/types/orderStatus.ts (also used by the API and mirrored in
 * firestore.rules); this module adds the role-aware helpers and labels the UI needs.
 *
 * Staff browsers may write only workshop stages directly (STAFF_WORKSHOP_MOVES).
 * Payment outcomes, shipping and delivery, cancellation, returns and refunds are
 * written by the API because they have side effects (GST invoice, stock, Razorpay
 * refunds, notifications); staff trigger them through /api/admin actions
 * (CREATE_SHIPMENT, UPDATE_DELIVERY_STATUS, CANCEL_ORDER, APPROVE_RETURN, ...; API.md).
 */
import type { RolePermissions } from '@/lib/auth/permissions';
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  STAFF_WORKSHOP_MOVES,
  canTransition,
  toOrderStatus,
  type OrderStatus,
} from '@/types/orderStatus';

export { ORDER_STATUSES, ORDER_TRANSITIONS, type OrderStatus };

/** Current status for a stored value (legacy Designing/Finished mapped); unknown values read as Pending_Payment. */
export function normalizeOrderStatus(raw: unknown): OrderStatus {
  return toOrderStatus(raw) ?? 'Pending_Payment';
}

type PermissionKey = keyof RolePermissions;

/** Permissions that allow moving an order INTO a workshop status (any one suffices). */
const WORKSHOP_PERMISSIONS: PermissionKey[] = ['canManageOrders', 'canManageProduction'];

/** Orders that represent real, retained revenue (confirmed and not cancelled, returned to origin or fully refunded). */
export function isRevenueStatus(status: OrderStatus): boolean {
  return !['Pending_Payment', 'Payment_Failed', 'Payment_Discrepancy', 'Expired', 'Cancelled', 'RTO_Delivered', 'Refunded'].includes(status);
}

export function isTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return canTransition(from, to);
}

/** Statuses an operator may pick next and write directly, given the role. Excludes API-only targets. */
export function nextClientStatuses(from: OrderStatus, perms: RolePermissions): OrderStatus[] {
  if (!WORKSHOP_PERMISSIONS.some(k => perms[k])) return [];
  return [...(STAFF_WORKSHOP_MOVES[from] ?? [])];
}

export function assertClientTransition(from: OrderStatus, to: OrderStatus, perms: RolePermissions): void {
  if (!isTransitionAllowed(from, to)) {
    throw new Error(`Order cannot move from ${from} to ${to}.`);
  }
  if (!nextClientStatuses(from, perms).includes(to)) {
    throw new Error(`Moving an order to ${to} must go through the order actions, or your role may not do it.`);
  }
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  Pending_Payment: 'Pending Payment', Paid: 'Paid', Confirmed_COD: 'Confirmed (Cash on Delivery)',
  Payment_Failed: 'Payment Failed', Payment_Discrepancy: 'Payment Under Review', Expired: 'Expired',
  In_Design: 'In Design', Cutting: 'Cutting', Finishing: 'Finishing', Quality_Check: 'Quality Check',
  Packed: 'Packed', Shipped: 'Shipped', Out_For_Delivery: 'Out for Delivery', Delivered: 'Delivered',
  RTO_Initiated: 'Returning to Sender', RTO_Delivered: 'Returned to Sender', Cancelled: 'Cancelled',
  Return_Requested: 'Return Requested', Return_Approved: 'Return Approved', Returned: 'Returned',
  Partially_Refunded: 'Partially Refunded', Refunded: 'Refunded',
};
