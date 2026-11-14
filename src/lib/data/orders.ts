/**
 * Orders. The client NEVER creates orders (the server does, in /api/checkout-intent).
 *  - Customers read their own orders (`userId == uid`).
 *  - Guests read a public summary through /api/order-status.
 *  - Staff read paginated/filtered pages and may update only the operational fields.
 */
import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData,
} from '@tanstack/react-query';
import {
  collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, updateDoc, where,
  type DocumentData, type QueryDocumentSnapshot, type QueryConstraint,
} from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '@/lib/firestoreDb';
import { ROLE_PERMISSIONS, type StaffRole } from '@/lib/auth/permissions';
import { assertClientTransition, type OrderStatus } from '@/lib/orders/orderStateMachine';
import type { CustomerAccount, Order, OrderTracking, StatusHistoryEntry } from '@/types/store';
import { logAudit } from './adminApi';
import { errorMessage, stripUndefined } from './optimistic';
import { normalizeOrder } from './orderModel';

export { fetchPublicOrderStatus, normalizeOrder, parsePublicOrder, toMillis } from './orderModel';

export const ADMIN_ORDERS_PAGE_SIZE = 50;

const fromSnapshot = (d: QueryDocumentSnapshot<DocumentData>) => normalizeOrder(d.id, d.data());

// ---------------------------------------------------------------- customer reads

export const myOrdersKey = (uid: string | undefined) => ['orders', 'mine', uid ?? 'anonymous'] as const;

export async function fetchMyOrders(uid: string): Promise<Order[]> {
  const snap = await getDocs(
    query(collection(db, 'orders'), where('userId', '==', uid), orderBy('placedAt', 'desc'), limit(100)),
  );
  return snap.docs.map(fromSnapshot);
}

export function useMyOrders(uid: string | undefined) {
  return useQuery({
    queryKey: myOrdersKey(uid),
    queryFn: () => fetchMyOrders(uid as string),
    enabled: Boolean(uid),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------- staff reads

/** One order by id for staff (e.g. printing a receipt right after the order is created). */
export function useStaffOrder(orderId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'order', orderId ?? ''] as const,
    enabled: enabled && Boolean(orderId),
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'orders', orderId as string));
      return snap.exists() ? normalizeOrder(snap.id, snap.data()) : null;
    },
  });
}

export const adminOrdersKey = (status?: OrderStatus) => ['admin', 'orders', status ?? 'all'] as const;

/**
 * Pages of orders for staff. All admin order feeds share the `['admin', 'orders', ...]` key prefix
 * and the same page shape so the optimistic update in useOrderMutations patches every one of them.
 */
function useOrderFeed(key: readonly unknown[], enabled: boolean, buildConstraints: () => QueryConstraint[], pageSize: number) {
  const q = useInfiniteQuery({
    queryKey: key,
    enabled,
    staleTime: 15_000,
    initialPageParam: null as QueryDocumentSnapshot<DocumentData> | null,
    queryFn: async ({ pageParam }) => {
      const constraints = [...buildConstraints()];
      if (pageParam) constraints.push(startAfter(pageParam));
      constraints.push(limit(pageSize));
      const snap = await getDocs(query(collection(db, 'orders'), ...constraints));
      return { orders: snap.docs.map(fromSnapshot), cursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null };
    },
    getNextPageParam: last => last.cursor,
  });

  const orders = q.data?.pages.flatMap(p => p.orders) ?? [];
  return {
    orders,
    isLoading: q.isLoading,
    error: q.error as Error | null,
    hasMore: Boolean(q.hasNextPage),
    isFetchingMore: q.isFetchingNextPage,
    loadMore: () => q.fetchNextPage(),
    refetch: () => q.refetch(),
  };
}

/** Paginated, optionally status-filtered order feed. Disabled unless the caller is staff. */
export function useAdminOrders(enabled: boolean, status?: OrderStatus) {
  return useOrderFeed(adminOrdersKey(status), enabled, () => {
    const constraints: QueryConstraint[] = [];
    if (status) constraints.push(where('status', '==', status));
    constraints.push(orderBy('placedAt', 'desc'));
    return constraints;
  }, ADMIN_ORDERS_PAGE_SIZE);
}

/**
 * Status names that may still be stored on older orders (see LEGACY_STATUS_MAP in
 * orderStateMachine). A Firestore `in` filter must list them or those orders would be invisible.
 */
const STORED_ALIASES: Partial<Record<OrderStatus, string[]>> = { In_Design: ['Designing'], Finishing: ['Finished'] };

export const WORKSHOP_QUEUE_LIMIT = 200;

/** Orders currently in any of the given statuses (workshop queues). Uses the (status, placedAt) index. */
export function useAdminOrdersInStatuses(enabled: boolean, statuses: readonly OrderStatus[]) {
  const values = statuses.flatMap(s => [s, ...(STORED_ALIASES[s] ?? [])]);
  return useOrderFeed(['admin', 'orders', 'in', ...values], enabled, () => [
    where('status', 'in', values),
    orderBy('placedAt', 'desc'),
  ], WORKSHOP_QUEUE_LIMIT);
}

/** Exact lookups for support when the loaded orders do not contain the order (order number or email). */
export async function searchOrdersRemote(term: string): Promise<Order[]> {
  const t = term.trim();
  if (!t) return [];
  const byField = t.includes('@')
    ? query(collection(db, 'orders'), where('email', '==', t.toLowerCase()), orderBy('placedAt', 'desc'), limit(50))
    : query(collection(db, 'orders'), where('orderNumber', '==', t.toUpperCase()), limit(5));
  return (await getDocs(byField)).docs.map(fromSnapshot);
}

/** Upper bound for one date-range export; the result says when it was truncated. */
export const EXPORT_ORDER_LIMIT = 2000;

/** Orders placed in [from, to] (epoch ms), oldest first, for finance exports. Uses the single-field `placedAt` index. */
export async function fetchOrdersBetween(from: number, to: number): Promise<{ orders: Order[]; truncated: boolean }> {
  const snap = await getDocs(
    query(collection(db, 'orders'), where('placedAt', '>=', from), where('placedAt', '<=', to), orderBy('placedAt', 'asc'), limit(EXPORT_ORDER_LIMIT + 1)),
  );
  const orders = snap.docs.slice(0, EXPORT_ORDER_LIMIT).map(fromSnapshot);
  return { orders, truncated: snap.docs.length > EXPORT_ORDER_LIMIT };
}

/** Customers are derived from loaded orders; there is no client read of the users collection. */
export function deriveCustomers(orders: Order[]): CustomerAccount[] {
  const byEmail = new Map<string, CustomerAccount>();
  for (const o of orders) {
    const email = o.email.toLowerCase();
    if (!email) continue;
    const existing = byEmail.get(email);
    if (existing) {
      const prev = Number(existing.createdAt) || Infinity;
      if (o.placedAt && o.placedAt < prev) existing.createdAt = o.placedAt;
      continue;
    }
    byEmail.set(email, {
      uid: o.userId,
      email,
      name: o.customerName || email,
      phone: o.phone,
      address: o.shippingAddress,
      city: o.shippingCity,
      state: o.shippingState,
      pincode: o.shippingPincode,
      country: o.shippingCountry,
      createdAt: o.placedAt,
    });
  }
  return [...byEmail.values()];
}

// ---------------------------------------------------------------- staff writes

/** The only fields the client may change on an order (mirrors the Firestore rule). */
export interface OrderUpdate {
  status?: OrderStatus;
  assignedTo?: string;
  tracking?: OrderTracking;
  notes?: string;
}

interface UpdateOrderVars {
  order: Order;
  update: OrderUpdate;
  actor: { email: string; role: StaffRole };
}

type OrdersCache = InfiniteData<{ orders: Order[]; cursor: QueryDocumentSnapshot<DocumentData> | null }, unknown>;

export function useOrderMutations() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ order, update, actor }: UpdateOrderVars) => {
      const now = Date.now();
      const fields: Record<string, unknown> = { updatedAt: now };
      if (update.status && update.status !== order.status) {
        assertClientTransition(order.status, update.status, ROLE_PERMISSIONS[actor.role]);
        const entry: StatusHistoryEntry = { status: update.status, at: now, by: actor.email };
        fields.status = update.status;
        fields.statusHistory = [...order.statusHistory, entry];
      }
      if (update.assignedTo !== undefined) fields.assignedTo = update.assignedTo;
      if (update.tracking !== undefined) fields.tracking = update.tracking;
      if (update.notes !== undefined) fields.notes = update.notes;
      await updateDoc(doc(db, 'orders', order.id), stripUndefined(fields));
      logAudit('ORDER_UPDATED', 'order', order.id, { from: order.status, to: update.status, tracking: Boolean(update.tracking) });
      return { orderId: order.id, fields };
    },
    onMutate: async ({ order, update, actor }) => {
      await qc.cancelQueries({ queryKey: ['admin', 'orders'] });
      const snapshots = qc.getQueriesData<OrdersCache>({ queryKey: ['admin', 'orders'] });
      const now = Date.now();
      const patch = (o: Order): Order => {
        if (o.id !== order.id) return o;
        const changedStatus = update.status && update.status !== o.status;
        return {
          ...o,
          status: update.status ?? o.status,
          statusHistory: changedStatus ? [...o.statusHistory, { status: update.status as OrderStatus, at: now, by: actor.email }] : o.statusHistory,
          assignedTo: update.assignedTo ?? o.assignedTo,
          tracking: update.tracking ?? o.tracking,
          adminNotes: update.notes ?? o.adminNotes,
          updatedAt: now,
        };
      };
      qc.setQueriesData<OrdersCache>({ queryKey: ['admin', 'orders'] }, cur =>
        cur ? { ...cur, pages: cur.pages.map(p => ({ ...p, orders: p.orders.map(patch) })) } : cur,
      );
      return { snapshots };
    },
    onError: (err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(`Order was not updated: ${errorMessage(err, 'please try again')}`);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    },
  });

  return {
    updateOrder: async (vars: UpdateOrderVars): Promise<boolean> => {
      try {
        await mutation.mutateAsync(vars);
        return true;
      } catch {
        return false;
      }
    },
  };
}
