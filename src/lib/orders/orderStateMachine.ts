/**
 * Order lifecycle: the single definition of statuses and allowed transitions.
 * Payment outcomes (Paid, Payment_Failed, Expired) and refunds are written by the server
 * (verify-payment, webhooks, refund flow); the client may never move an order into them.
 */
import type { RolePermissions } from '@/lib/auth/permissions';

export const ORDER_STATUSES = [
  'Pending_Payment', 'Paid', 'Payment_Failed', 'Expired', 'In_Design', 'Cutting', 'Finishing',
  'Quality_Check', 'Packed', 'Shipped', 'Out_For_Delivery', 'Delivered', 'Cancelled',
  'Return_Requested', 'Returned', 'Partially_Refunded', 'Refunded',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const LEGACY_STATUS_MAP: Record<string, OrderStatus> = {
  Pending: 'Pending_Payment',
  Designing: 'In_Design',
  Finished: 'Finishing',
};

export function normalizeOrderStatus(raw: unknown): OrderStatus {
  if (typeof raw === 'string') {
    if ((ORDER_STATUSES as readonly string[]).includes(raw)) return raw as OrderStatus;
    if (raw in LEGACY_STATUS_MAP) return LEGACY_STATUS_MAP[raw];
  }
  return 'Pending_Payment';
}

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  Pending_Payment: ['Paid', 'Payment_Failed', 'Expired', 'Cancelled'],
  Payment_Failed: ['Pending_Payment', 'Expired', 'Cancelled'],
  Expired: [],
  Paid: ['In_Design', 'Cutting', 'Cancelled', 'Partially_Refunded', 'Refunded'],
  In_Design: ['Cutting', 'Cancelled'],
  Cutting: ['Finishing', 'In_Design', 'Cancelled'],
  Finishing: ['Quality_Check', 'Cutting'],
  Quality_Check: ['Packed', 'Finishing'],
  Packed: ['Shipped', 'Cancelled'],
  Shipped: ['Out_For_Delivery', 'Delivered', 'Returned'],
  Out_For_Delivery: ['Delivered', 'Returned'],
  Delivered: ['Return_Requested'],
  Cancelled: ['Refunded'],
  Return_Requested: ['Returned', 'Delivered'],
  Returned: ['Refunded', 'Partially_Refunded'],
  Partially_Refunded: ['Refunded'],
  Refunded: [],
};

const SERVER_ONLY_TARGETS: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'Paid', 'Payment_Failed', 'Expired', 'Refunded', 'Partially_Refunded', 'Pending_Payment',
]);

type PermissionKey = keyof RolePermissions;

/** Permissions that allow moving an order INTO the given status (any one suffices). */
function permissionsForTarget(to: OrderStatus): PermissionKey[] {
  switch (to) {
    case 'In_Design': case 'Cutting': case 'Finishing': case 'Quality_Check': case 'Packed':
      return ['canManageOrders', 'canManageProduction'];
    case 'Shipped': case 'Out_For_Delivery': case 'Delivered': case 'Returned':
      return ['canManageOrders', 'canManageShipping'];
    default:
      return ['canManageOrders'];
  }
}

/** Orders that represent real, retained revenue (paid and not cancelled or fully refunded). */
export function isRevenueStatus(status: OrderStatus): boolean {
  return !['Pending_Payment', 'Payment_Failed', 'Expired', 'Cancelled', 'Refunded'].includes(status);
}

export function isTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Statuses an operator may pick next, given the role. Excludes server-owned targets. */
export function nextClientStatuses(from: OrderStatus, perms: RolePermissions): OrderStatus[] {
  return ORDER_TRANSITIONS[from].filter(
    to => !SERVER_ONLY_TARGETS.has(to) && permissionsForTarget(to).some(k => perms[k]),
  );
}

export function assertClientTransition(from: OrderStatus, to: OrderStatus, perms: RolePermissions): void {
  if (!isTransitionAllowed(from, to)) {
    throw new Error(`Order cannot move from ${from} to ${to}.`);
  }
  if (!nextClientStatuses(from, perms).includes(to)) {
    throw new Error(`Your role may not move an order to ${to}.`);
  }
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  Pending_Payment: 'Pending Payment', Paid: 'Paid', Payment_Failed: 'Payment Failed',
  Expired: 'Expired', In_Design: 'In Design', Cutting: 'Cutting', Finishing: 'Finishing',
  Quality_Check: 'Quality Check', Packed: 'Packed', Shipped: 'Shipped',
  Out_For_Delivery: 'Out for Delivery', Delivered: 'Delivered', Cancelled: 'Cancelled',
  Return_Requested: 'Return Requested', Returned: 'Returned',
  Partially_Refunded: 'Partially Refunded', Refunded: 'Refunded',
};
