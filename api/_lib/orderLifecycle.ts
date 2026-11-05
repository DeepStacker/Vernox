/**
 * Server view of the order state machine. Statuses and transitions are defined
 * once in src/types/orderStatus.ts (shared with the browser and mirrored in
 * firestore.rules); every status change the API makes goes through canTransition(),
 * usually via orderTransitions.ts.
 */
import { PAID_STATUSES, toOrderStatus, type OrderStatus } from '../../src/types/orderStatus';

export {
  CUSTOMER_CANCELLABLE_STATUSES,
  ORDER_STATUSES,
  PAID_STATUSES,
  STAFF_SETTABLE_STATUSES,
  STAFF_WORKSHOP_MOVES,
  canTransition,
  isOrderStatus,
  toOrderStatus,
  type OrderStatus,
} from '../../src/types/orderStatus';

export function isPaidStatus(status: unknown): boolean {
  const current = toOrderStatus(status);
  return current !== null && PAID_STATUSES.includes(current);
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  at: number;
  by: string; // 'system' | 'customer' | 'razorpay' | 'courier' | staff uid
  note?: string;
}

/** Refund status from cumulative refunded amount against the amount actually collected. */
export function refundStatus(refundedPaise: number, collectedPaise: number): OrderStatus {
  return refundedPaise >= collectedPaise ? 'Refunded' : 'Partially_Refunded';
}
