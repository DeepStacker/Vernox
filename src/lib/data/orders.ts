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
  collection, doc, getDocs, limit, orderBy, query, startAfter, updateDoc, where,
  type DocumentData, type QueryDocumentSnapshot, type QueryConstraint,
} from 'firebase/firestore';
import { toast } from 'sonner';
import { auth, db } from '@/lib/firebase';
import { ROLE_PERMISSIONS, type StaffRole } from '@/lib/auth/permissions';
import { assertClientTransition, normalizeOrderStatus, type OrderStatus } from '@/lib/orders/orderStateMachine';
import type {
  CustomerAccount, Order, OrderItem, OrderTracking, PaymentStatus, PublicOrderSummary, StatusHistoryEntry,
} from '@/types/store';
import type { OrderOps } from '@/types/orderOps';
import { logAudit } from './adminApi';
import { errorMessage, stripUndefined } from './optimistic';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- Firestore documents are untyped at the boundary

export const ADMIN_ORDERS_PAGE_SIZE = 50;

/** Firestore Timestamp | millis | ISO string -> epoch millis. */
export function toMillis(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function normalizeItem(raw: Raw, index: number): OrderItem {
  const quantity = Number(raw.quantity) || 1;
  const unitPrice = Number(raw.unitPrice) || 0;
  return {
    id: raw.id ?? `${raw.productId ?? 'item'}-${index}`,
    productId: raw.productId ?? '',
    productName: raw.productName ?? raw.name ?? 'Item',
    productSlug: raw.productSlug ?? '',
    shapeId: raw.shapeId ?? '',
    sizeLabel: raw.sizeLabel ?? '',
    widthMm: Number(raw.widthMm) || 0,
    heightMm: Number(raw.heightMm) || 0,
    finish: raw.finish ?? '',
    unitPrice,
    quantity,
    lineTotal: Number(raw.lineTotal) || unitPrice * quantity,
    customDesignThumb: raw.customDesignThumb,
    customDesignRef: raw.customDesignRef,
    userUploadedImage: raw.userUploadedImage,
    uploadedArtworkName: raw.uploadedArtworkName,
  };
}

/**
 * Maps a stored order document to the client shape. Tolerates the server's nested
 * `customer`/`pricing`/`tracking`/`notes` layout and legacy flat fields; legacy statuses
 * are mapped onto the current state machine.
 */
export function normalizeOrder(id: string, raw: Raw): Order {
  const customer: Raw = raw.customer ?? {};
  const pricing: Raw = raw.pricing ?? {};
  const tracking: Raw = raw.tracking ?? {};
  const items = Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [];
  const total = Number(pricing.total ?? raw.total) || 0;
  const history: StatusHistoryEntry[] = Array.isArray(raw.statusHistory)
    ? raw.statusHistory.map((h: Raw) => ({ status: normalizeOrderStatus(h.status), at: toMillis(h.at), by: String(h.by ?? 'system') }))
    : [];

  return {
    id,
    orderNumber: raw.orderNumber,
    userId: raw.userId,
    email: String(raw.email ?? customer.email ?? ''),
    status: normalizeOrderStatus(raw.status),
    paymentStatus: raw.paymentStatus as PaymentStatus | undefined,
    ...(raw.kind === 'service' ? { kind: 'service' as const } : {}),
    ...(raw.hold && typeof raw.hold === 'object' ? { hold: raw.hold as Order['hold'] } : {}),
    placedAt: toMillis(raw.placedAt ?? raw.createdAt),
    updatedAt: toMillis(raw.updatedAt) || undefined,
    items,
    subtotal: Number(pricing.subtotal ?? raw.subtotal) || items.reduce((s, i) => s + i.lineTotal, 0),
    discountTotal: Number(pricing.discount ?? raw.discount ?? raw.discountTotal) || 0,
    shippingTotal: Number(pricing.shipping ?? raw.shipping) || 0,
    taxTotal: Number(pricing.tax ?? raw.tax) || 0,
    total,
    couponCode: raw.couponCode,
    customerName: customer.name ?? raw.customerName ?? raw.shippingName,
    phone: customer.phone ?? raw.phone,
    shippingAddress: customer.address ?? raw.shippingAddress,
    shippingCity: customer.city ?? raw.shippingCity,
    shippingState: customer.state ?? raw.shippingState,
    shippingPincode: customer.pincode ?? raw.shippingPincode ?? raw.shippingZip,
    shippingCountry: customer.country ?? raw.shippingCountry,
    tracking: {
      carrier: tracking.carrier ?? raw.trackingCarrier,
      trackingNumber: tracking.trackingNumber ?? tracking.number ?? raw.trackingNumber,
      url: tracking.url,
      estimatedDelivery: tracking.estimatedDelivery ?? raw.estimatedDelivery,
    },
    assignedTo: raw.assignedTo,
    adminNotes: raw.notes ?? raw.adminNotes,
    statusHistory: history,
    ops: normalizeOps(raw),
  };
}

const orNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const paise = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Staff view of the server-written money, payment and shipment fields. Absent on pre-Phase-2 orders (defaults apply). */
function normalizeOps(raw: Raw): OrderOps {
  const a: Raw = raw.amounts ?? {};
  const ship: Raw | null = raw.shipment && typeof raw.shipment === 'object' ? raw.shipment : null;
  return {
    paymentMethod: raw.paymentMethod === 'cod' || raw.paymentMethod === 'replacement' ? raw.paymentMethod : 'prepaid',
    razorpayPaymentId: orNull(raw.razorpayPaymentId),
    paidAt: toMillis(raw.paidAt) || null,
    subtotalPaise: paise(a.subtotalPaise),
    discountPaise: paise(a.discountPaise),
    shippingPaise: paise(a.shippingPaise),
    codFeePaise: paise(a.codFeePaise),
    taxPaise: paise(a.taxPaise),
    totalPaise: paise(a.totalPaise),
    refundedPaise: paise(raw.refundedPaise),
    refundPendingPaise: paise(raw.refundPendingPaise),
    refunds: Array.isArray(raw.refunds)
      ? raw.refunds.map((r: Raw) => ({ refundId: String(r.refundId ?? ''), amountPaise: paise(r.amountPaise), at: toMillis(r.at) }))
      : [],
    codCollectedPaise: paise(raw.codCollectedPaise),
    codCollectedAt: toMillis(raw.codCollectedAt) || null,
    deliveredAt: toMillis(raw.deliveredAt) || null,
    invoiceNumber: orNull(raw.invoiceNumber),
    flags: Array.isArray(raw.flags) ? raw.flags.filter((f: unknown): f is string => typeof f === 'string') : [],
    shipment: ship
      ? {
          provider: ship.provider === 'shiprocket' ? 'shiprocket' : 'manual',
          status: ship.status ?? 'created',
          awb: orNull(ship.awb),
          courier: orNull(ship.courier),
          trackingUrl: orNull(ship.trackingUrl),
          labelUrl: orNull(ship.labelUrl),
          manifestUrl: orNull(ship.manifestUrl),
          error: orNull(ship.error),
        }
      : null,
    parentOrderId: orNull(raw.parentOrderId),
  };
}

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

/**
 * Maps the `order` object of GET /api/order-status to the summary the storefront renders. The
 * server owns canCancel and returnEligibleUntil (state machine and return window), so every
 * customer lookup (guest or signed-in owner) reads them from here.
 */
export function parsePublicOrder(order: Raw, fallbackOrderId = ''): PublicOrderSummary {
  // /api/order-status returns `timeline` and `shipTo`; the other names cover the owner-read shape.
  const timeline = order.timeline ?? order.statusHistory;
  const codFee = Number(order.pricing?.codFee ?? order.codFee);
  return {
    orderId: String(order.orderId ?? order.id ?? fallbackOrderId),
    orderNumber: String(order.orderNumber ?? ''),
    status: normalizeOrderStatus(order.status),
    placedAt: toMillis(order.placedAt) || undefined,
    total: typeof order.total === 'number' ? order.total : order.pricing?.total,
    currency: order.currency,
    items: Array.isArray(order.items)
      ? order.items.map((i: Raw) => ({ productId: i.productId, name: i.name ?? i.productName ?? 'Item', quantity: Number(i.quantity) || 1, lineTotal: i.lineTotal }))
      : undefined,
    tracking: order.tracking as OrderTracking | undefined,
    statusHistory: Array.isArray(timeline)
      ? timeline.map((h: Raw) => ({ status: normalizeOrderStatus(h.status), at: toMillis(h.at) }))
      : undefined,
    shippingCity: order.shipTo?.city ?? order.shippingCity ?? order.city,
    shippingState: order.shippingState ?? order.state,
    paymentMethod: order.paymentMethod === 'cod' || order.paymentMethod === 'replacement' ? order.paymentMethod : 'prepaid',
    invoiceNumber: typeof order.invoiceNumber === 'string' ? order.invoiceNumber : null,
    canCancel: order.canCancel === true,
    returnEligibleUntil: typeof order.returnEligibleUntil === 'number' ? order.returnEligibleUntil : null,
    codFee: Number.isFinite(codFee) ? codFee : 0,
  };
}

/**
 * Order lookup through /api/order-status. Guests identify the order with its email; a signed-in
 * owner's bearer token is sent as well, so the email becomes optional for them.
 */
export async function fetchPublicOrderStatus(orderId: string, email?: string): Promise<PublicOrderSummary> {
  const params = new URLSearchParams({ orderId: orderId.trim() });
  if (email?.trim()) params.set('email', email.trim());
  const user = auth.currentUser;
  const res = await fetch(`/api/order-status?${params.toString()}`, user ? { headers: { Authorization: `Bearer ${await user.getIdToken()}` } } : undefined);
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success === false) {
    const msg = (body?.message as string) || (res.status === 404 ? 'No order matches that number and email.' : `Lookup failed (${res.status}).`);
    throw new Error(msg);
  }
  return parsePublicOrder((body.order ?? body) as Raw, orderId);
}

// ---------------------------------------------------------------- staff reads

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
