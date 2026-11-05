/**
 * Order state machine (pure). Every status change made by the API goes through
 * canTransition(); firestore.rules mirror the staff-settable subset.
 *
 *   Pending_Payment ──► Paid ──► Designing ──► Cutting ──► Finished ──► Shipped ──► Delivered
 *        │  ▲
 *        │  └── late payment (Payment_Failed / Expired → Paid, stock re-committed)
 *        ├──► Payment_Failed   (payment.failed webhook; reservation released)
 *        ├──► Expired          (reservation TTL passed; cron releases stock)
 *        ├──► Cancelled        (provider order creation failed; staff)
 *        └──► Payment_Discrepancy (captured amount/currency ≠ order; manual review)
 *   any paid state ──► Partially_Refunded ──► Refunded   (refund.processed webhook)
 */

export const ORDER_STATUSES = [
  'Pending_Payment',
  'Paid',
  'Payment_Failed',
  'Payment_Discrepancy',
  'Expired',
  'Cancelled',
  'Designing',
  'Cutting',
  'Finished',
  'Shipped',
  'Delivered',
  'Partially_Refunded',
  'Refunded',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses in which money has been captured. */
export const PAID_STATUSES: readonly OrderStatus[] = [
  'Paid',
  'Designing',
  'Cutting',
  'Finished',
  'Shipped',
  'Delivered',
  'Partially_Refunded',
  'Refunded',
];

/** Fulfilment statuses staff may set (via UPDATE_ORDER_STATUS or, per firestore.rules, directly). */
export const STAFF_SETTABLE_STATUSES: readonly OrderStatus[] = [
  'Designing',
  'Cutting',
  'Finished',
  'Shipped',
  'Delivered',
  'Cancelled',
];

const FULFILMENT_FLOW: OrderStatus[] = ['Paid', 'Designing', 'Cutting', 'Finished', 'Shipped', 'Delivered'];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  Pending_Payment: ['Paid', 'Payment_Failed', 'Expired', 'Cancelled', 'Payment_Discrepancy'],
  Payment_Failed: ['Paid', 'Expired', 'Cancelled', 'Payment_Discrepancy'],
  Expired: ['Paid', 'Payment_Discrepancy'],
  Payment_Discrepancy: ['Cancelled', 'Refunded', 'Partially_Refunded'],
  Cancelled: ['Refunded', 'Partially_Refunded'],
  Paid: ['Designing', 'Cancelled', 'Partially_Refunded', 'Refunded'],
  Designing: ['Cutting', 'Cancelled', 'Partially_Refunded', 'Refunded'],
  Cutting: ['Finished', 'Cancelled', 'Partially_Refunded', 'Refunded'],
  Finished: ['Shipped', 'Cancelled', 'Partially_Refunded', 'Refunded'],
  Shipped: ['Delivered', 'Partially_Refunded', 'Refunded'],
  Delivered: ['Partially_Refunded', 'Refunded'],
  Partially_Refunded: ['Partially_Refunded', 'Refunded', ...FULFILMENT_FLOW.slice(1)],
  Refunded: [],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: unknown, to: OrderStatus): boolean {
  return isOrderStatus(from) && TRANSITIONS[from].includes(to);
}

export function isPaidStatus(status: unknown): boolean {
  return isOrderStatus(status) && PAID_STATUSES.includes(status);
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  at: number;
  by: string; // 'system' | 'customer' | 'razorpay' | staff uid
  note?: string;
}

/** Refund status from cumulative refunded amount. */
export function refundStatus(refundedPaise: number, totalPaise: number): OrderStatus {
  return refundedPaise >= totalPaise ? 'Refunded' : 'Partially_Refunded';
}
