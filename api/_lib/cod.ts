/**
 * Cash on delivery eligibility (owner decision 2026-11-05: catalogue items only,
 * with a COD fee; any cart with a Crafting Studio piece is prepaid only).
 *
 * State model: a COD order is created directly as `Confirmed_COD` with its stock
 * committed (not held) and its coupon redeemed — there is no payment step to wait
 * for. No OTP confirmation yet (Indian SMS OTP needs DLT registration); abuse is
 * bounded instead by:
 *  - a per-mobile and per-email rate limit on COD checkouts (RATE_LIMITS.codCheckout*);
 *  - at most `codMaxOpenOrdersPerPhone` undelivered COD orders per mobile number;
 *  - `codMaxOrderValue` on the order total.
 * The open-order count is a query before the order transaction, so two
 * simultaneous checkouts from one number could both pass; the rate limit keeps
 * that window to a couple of orders.
 */
import { ApiError } from './errors';
import type { OrderStatus } from './orderLifecycle';
import type { PricedLine } from './pricing';
import type { DocStore } from './store';
import type { CodConfig } from './storeConfig';

export type CodRejection =
  | 'COD_DISABLED'
  | 'CUSTOM_ITEM'
  | 'PINCODE_NOT_ELIGIBLE'
  | 'ORDER_VALUE_TOO_HIGH'
  | 'TOO_MANY_OPEN_COD_ORDERS';

const MESSAGES: Record<CodRejection, string> = {
  COD_DISABLED: 'Cash on delivery is not available right now. Please pay online.',
  CUSTOM_ITEM: 'Custom studio designs are made only for prepaid orders. Please pay online.',
  PINCODE_NOT_ELIGIBLE: 'Cash on delivery is not available for this PIN code. Please pay online.',
  ORDER_VALUE_TOO_HIGH: 'This order is above the cash on delivery limit. Please pay online.',
  TOO_MANY_OPEN_COD_ORDERS: 'This mobile number already has cash on delivery orders in progress. Please pay online.',
};

export const codRejection = (reason: CodRejection, detail?: string) =>
  new ApiError(400, 'COD_NOT_AVAILABLE', MESSAGES[reason], detail ? `${reason}: ${detail}` : reason);

/** COD orders that are not yet delivered or closed count against the per-phone limit. */
export const OPEN_COD_STATUSES: readonly OrderStatus[] = [
  'Confirmed_COD',
  'In_Design',
  'Cutting',
  'Finishing',
  'Quality_Check',
  'Packed',
  'Shipped',
  'Out_For_Delivery',
  'RTO_Initiated',
];

export function hasCustomItem(items: Array<{ productId: string; isCustom?: boolean }>, customProductId: string): boolean {
  return items.some(i => i.isCustom === true || i.productId === customProductId);
}

/** Checks that need only the priced order (run inside the checkout transaction). */
export function assertCodOrderAllowed(lines: PricedLine[], totalPaise: number, cod: CodConfig) {
  if (!cod.enabled) throw codRejection('COD_DISABLED');
  if (lines.some(l => l.isCustom)) throw codRejection('CUSTOM_ITEM');
  if (totalPaise > cod.maxOrderValuePaise) throw codRejection('ORDER_VALUE_TOO_HIGH', `${totalPaise} > ${cod.maxOrderValuePaise}`);
}

export async function countOpenCodOrders(store: DocStore, phoneKey: string): Promise<number> {
  // Two equality filters are served by Firestore's single-field indexes (no composite index needed).
  const rows = await store.query('orders', {
    where: [
      { field: 'phoneKey', op: '==', value: phoneKey },
      { field: 'paymentMethod', op: '==', value: 'cod' },
    ],
    limit: 100,
  });
  return rows.filter(r => OPEN_COD_STATUSES.includes(r.data.status as OrderStatus)).length;
}
