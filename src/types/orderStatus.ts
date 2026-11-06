/**
 * Order statuses and the transition table — SINGLE SOURCE OF TRUTH, imported by
 * the API (api/_lib/orderLifecycle.ts) and the browser (src/lib/orders/orderStateMachine.ts).
 * Dependency-free so both builds can import it.
 *
 * firestore.rules cannot import TypeScript: its `staffWorkshopMoves()` map mirrors
 * STAFF_WORKSHOP_MOVES below, and src/test/orderLifecycle.test.ts parses the rules
 * file to assert they match. Change both together.
 *
 *   Prepaid:  Pending_Payment ──► Paid ──┐
 *   COD:      (checkout) ──► Confirmed_COD ┤
 *                                          ▼
 *     In_Design ──► Cutting ──► Finishing ──► Quality_Check ──► Packed ──► Shipped ──► Out_For_Delivery ──► Delivered
 *        (rework: Cutting → In_Design, Finishing → Cutting,     │             │               │
 *         Quality_Check → Finishing | Cutting, Packed → QC)     │             └──► RTO_Initiated ──► RTO_Delivered
 *     Delivered ──► Return_Requested ──► Return_Approved ──► Returned ──► (Partially_)Refunded
 *                         └──► Delivered (rejected)
 *
 *   Pending_Payment ──► Payment_Failed | Expired | Cancelled | Payment_Discrepancy
 *   Payment_Failed | Expired ──► Paid (late payment, stock re-committed)
 *   Paid | Confirmed_COD | workshop stages ──► Cancelled (customers: before production only)
 *   money collected ──► Partially_Refunded ──► Refunded
 *
 * Phase 1 orders may carry the legacy statuses `Designing` and `Finished`; they are
 * normalised on read (Designing → In_Design, Finished → Finishing) and never written.
 */

export const ORDER_STATUSES = [
  'Pending_Payment', 'Paid', 'Confirmed_COD', 'Payment_Failed', 'Payment_Discrepancy', 'Expired',
  'In_Design', 'Cutting', 'Finishing', 'Quality_Check', 'Packed', 'Shipped', 'Out_For_Delivery',
  'Delivered', 'RTO_Initiated', 'RTO_Delivered', 'Cancelled', 'Return_Requested', 'Return_Approved',
  'Returned', 'Partially_Refunded', 'Refunded',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses written by earlier versions, mapped onto the current set when read. */
export const LEGACY_ORDER_STATUS_MAP: Readonly<Record<string, OrderStatus>> = {
  Pending: 'Pending_Payment',
  Designing: 'In_Design',
  Finished: 'Finishing',
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Current status for a stored value (legacy names mapped), or null when unknown. */
export function toOrderStatus(raw: unknown): OrderStatus | null {
  if (isOrderStatus(raw)) return raw;
  if (typeof raw === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_ORDER_STATUS_MAP, raw)) return LEGACY_ORDER_STATUS_MAP[raw];
  return null;
}

const REFUNDS: OrderStatus[] = ['Partially_Refunded', 'Refunded'];

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  Pending_Payment: ['Paid', 'Payment_Failed', 'Expired', 'Cancelled', 'Payment_Discrepancy'],
  Payment_Failed: ['Paid', 'Expired', 'Cancelled', 'Payment_Discrepancy'],
  Expired: ['Paid', 'Payment_Discrepancy'],
  Payment_Discrepancy: ['Cancelled', ...REFUNDS],
  Cancelled: REFUNDS,
  Paid: ['In_Design', 'Cancelled', ...REFUNDS],
  Confirmed_COD: ['In_Design', 'Cancelled'],
  In_Design: ['Cutting', 'Cancelled', ...REFUNDS],
  Cutting: ['Finishing', 'In_Design', 'Cancelled', ...REFUNDS],
  Finishing: ['Quality_Check', 'Cutting', 'Cancelled', ...REFUNDS],
  Quality_Check: ['Packed', 'Finishing', 'Cutting', 'Cancelled', ...REFUNDS],
  Packed: ['Shipped', 'Quality_Check', 'Cancelled', ...REFUNDS],
  Shipped: ['Out_For_Delivery', 'Delivered', 'RTO_Initiated', ...REFUNDS],
  Out_For_Delivery: ['Delivered', 'RTO_Initiated', ...REFUNDS],
  Delivered: ['Return_Requested', ...REFUNDS],
  RTO_Initiated: ['RTO_Delivered', 'Delivered', ...REFUNDS],
  RTO_Delivered: ['Cancelled', ...REFUNDS],
  Return_Requested: ['Return_Approved', 'Delivered', ...REFUNDS],
  Return_Approved: ['Returned', ...REFUNDS],
  Returned: REFUNDS,
  // A partial refund (e.g. a goodwill amount) does not stop fulfilment.
  Partially_Refunded: [
    'Partially_Refunded', 'Refunded', 'In_Design', 'Cutting', 'Finishing', 'Quality_Check', 'Packed',
    'Shipped', 'Out_For_Delivery', 'Delivered', 'RTO_Initiated', 'RTO_Delivered', 'Return_Requested',
  ],
  Refunded: [],
};

/** True when the stored `from` (legacy names accepted) may move to `to`. */
export function canTransition(from: unknown, to: OrderStatus): boolean {
  const current = toOrderStatus(from);
  return current !== null && ORDER_TRANSITIONS[current].includes(to);
}

/**
 * Workshop statuses staff may set with UPDATE_ORDER_STATUS and, per firestore.rules,
 * by writing the order directly. Shipping, delivery, cancellation, returns and refunds
 * have side effects (invoice, stock, Razorpay, notifications) and are API-only.
 */
export const STAFF_SETTABLE_STATUSES: readonly OrderStatus[] = ['In_Design', 'Cutting', 'Finishing', 'Quality_Check', 'Packed'];

/** Direct staff moves: ORDER_TRANSITIONS restricted to staff-settable targets (mirrored in firestore.rules). */
export const STAFF_WORKSHOP_MOVES: Readonly<Partial<Record<OrderStatus, readonly OrderStatus[]>>> = Object.fromEntries(
  ORDER_STATUSES.map(from => [from, ORDER_TRANSITIONS[from].filter(to => STAFF_SETTABLE_STATUSES.includes(to))] as const).filter(
    ([, moves]) => moves.length > 0,
  ),
);

/** Statuses a customer may still cancel from: confirmed, production not started. */
export const CUSTOMER_CANCELLABLE_STATUSES: readonly OrderStatus[] = ['Paid', 'Confirmed_COD'];

/** Statuses in which a prepaid order's money has been captured (detects duplicate payments). */
export const PAID_STATUSES: readonly OrderStatus[] = [
  'Paid', 'In_Design', 'Cutting', 'Finishing', 'Quality_Check', 'Packed', 'Shipped', 'Out_For_Delivery',
  'Delivered', 'RTO_Initiated', 'RTO_Delivered', 'Return_Requested', 'Return_Approved', 'Returned',
  'Partially_Refunded', 'Refunded',
];

/**
 * Hold: a flag beside the status, not a status, so a held order keeps its stage and resumes from it, the
 * customer's status is unchanged and the state machine stays as it is. `material_shortage` is a hold that
 * production raises when raw stock runs out. Written only by the API (SET_ORDER_HOLD / RELEASE_ORDER_HOLD);
 * firestore.rules refuse direct status moves while it is set.
 */
export const HOLD_KINDS = ['hold', 'material_shortage'] as const;
export type HoldKind = (typeof HOLD_KINDS)[number];

export interface OrderHold {
  kind: HoldKind;
  reason: string;
  by: string;
  at: number;
}

/** Statuses a hold can be placed in: confirmed, in production or packed (not yet with the courier). */
export const HOLDABLE_STATUSES: readonly OrderStatus[] = ['Paid', 'Confirmed_COD', ...STAFF_SETTABLE_STATUSES, 'Partially_Refunded'];

/** Moves a held order cannot make: fulfilment progress and dispatch. Cancellation and refunds stay possible. */
export const HOLD_BLOCKED_TARGETS: readonly OrderStatus[] = [...STAFF_SETTABLE_STATUSES, 'Shipped'];
