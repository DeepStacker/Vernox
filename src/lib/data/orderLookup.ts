/** Customer order lookup for the confirmation and tracking pages. */
import { useQuery } from '@tanstack/react-query';
import { CUSTOMER_CANCELLABLE_STATUSES } from '@/types/orderStatus';
import type { Order, PublicOrderSummary } from '@/types/store';
import { fetchPublicOrderStatus } from './orders';

/**
 * Summary of an order already loaded from Firestore (the Account order list). Same shape as the
 * API summary. `canCancel` uses the shared status list the server uses; the return deadline needs
 * the store's return window, so it is filled only when the caller passes it, and otherwise the
 * order detail asks /api/order-status, which is authoritative.
 */
export function toPublicSummary(order: Order, returnWindowDays?: number): PublicOrderSummary {
  const ops = order.ops;
  const deliveredAt = ops?.deliveredAt ?? null;
  return {
    orderId: order.id,
    orderNumber: order.orderNumber ?? order.id,
    status: order.status,
    placedAt: order.placedAt || undefined,
    total: order.total,
    currency: 'INR',
    items: order.items.map(i => ({ productId: i.productId, name: i.productName, quantity: i.quantity, lineTotal: i.lineTotal })),
    tracking: order.tracking,
    statusHistory: order.statusHistory.map(h => ({ status: h.status, at: h.at })),
    shippingCity: order.shippingCity,
    shippingState: order.shippingState,
    paymentMethod: ops?.paymentMethod ?? 'prepaid',
    invoiceNumber: ops?.invoiceNumber ?? null,
    canCancel: CUSTOMER_CANCELLABLE_STATUSES.includes(order.status),
    returnEligibleUntil:
      order.status === 'Delivered' && deliveredAt && returnWindowDays !== undefined ? deliveredAt + returnWindowDays * 24 * 3600_000 : null,
    codFee: (ops?.codFeePaise ?? 0) / 100,
  };
}

/**
 * Resolves one order for a customer through /api/order-status. A signed-in owner is recognised by
 * their token (no email needed); everyone else proves ownership with the checkout email.
 */
export async function lookupOrder(orderId: string, email: string | undefined, uid: string | undefined): Promise<PublicOrderSummary> {
  if (!uid && !email) throw new Error('Enter the email used at checkout to view this order.');
  return fetchPublicOrderStatus(orderId, email);
}

export function useOrderLookup(orderId: string | undefined, email: string | undefined, uid: string | undefined) {
  return useQuery({
    queryKey: ['order-lookup', orderId, email?.toLowerCase() ?? null, uid ?? null],
    queryFn: () => lookupOrder(orderId as string, email, uid),
    enabled: Boolean(orderId) && Boolean(email || uid),
    retry: false,
    // Payment confirmation can lag the redirect by a few seconds; keep polling until it settles.
    refetchInterval: query => (query.state.data?.status === 'Pending_Payment' ? 4000 : false),
  });
}
