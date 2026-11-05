/** Customer order lookup for the confirmation and tracking pages. */
import { useQuery } from '@tanstack/react-query';
import type { Order, PublicOrderSummary } from '@/types/store';
import { fetchOwnOrder, fetchPublicOrderStatus } from './orders';

export function toPublicSummary(order: Order): PublicOrderSummary {
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
  };
}

/**
 * Resolves one order for a customer. Signed-in owners read Firestore directly; everyone else
 * (and owners whose direct read is denied) goes through the email-verified public endpoint.
 */
export async function lookupOrder(orderId: string, email: string | undefined, uid: string | undefined): Promise<PublicOrderSummary> {
  if (uid) {
    try {
      const own = await fetchOwnOrder(orderId);
      if (own && own.userId === uid) return toPublicSummary(own);
    } catch (err) {
      if (!email) throw err;
    }
  }
  if (!email) throw new Error('Enter the email used at checkout to view this order.');
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
