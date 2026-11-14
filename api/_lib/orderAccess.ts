/**
 * Customer access to one order, shared by order-status, invoice, order-cancel
 * and return-request: the caller is authorised when the bearer token's uid owns
 * the order, or when the order's email matches (compared in constant time).
 * An unknown order and a wrong email produce the same 404 so orders cannot be
 * enumerated. Endpoints using this are rate-limited per IP.
 */
import crypto from 'crypto';
import { z } from 'zod';
import type { AuthenticatedUser } from './auth';
import { ApiError } from './errors';
import { asOrder, orderPath, type OrderDoc } from './orders';
import type { DocStore } from './store';

export const orderIdSchema = z.string().trim().regex(/^[A-Za-z0-9]{10,40}$/);
/** The number customers see on emails, invoices and receipts (orders.ts generateOrderNumber), any letter case. */
export const ORDER_NUMBER_PATTERN = /^VX-\d{8}-[A-Z0-9]{6}$/;

/**
 * Accepts the internal order id or the customer-facing order number and returns the internal id (null when a
 * number matches no order). Access is still decided by the caller (email or owner token).
 */
export async function resolveOrderReference(store: DocStore, reference: string): Promise<string | null> {
  const ref = reference.trim();
  const number = ref.toUpperCase().replace(/\s+/g, '');
  if (!ORDER_NUMBER_PATTERN.test(number)) return ref;
  const found = await store.query('orders', { where: [{ field: 'orderNumber', op: '==', value: number }], limit: 1 });
  return found[0]?.id ?? null;
}

export const orderReferenceSchema = z.string().trim().max(40).refine(
  v => /^[A-Za-z0-9]{10,40}$/.test(v) || ORDER_NUMBER_PATTERN.test(v.toUpperCase().replace(/\s+/g, '')),
  'Enter the order number from your confirmation, e.g. VX-20261114-AB12CD',
);

export const optionalEmailSchema = z.string().trim().toLowerCase().email().max(254).optional();

export function sameEmail(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a.trim().toLowerCase()).digest();
  const hb = crypto.createHash('sha256').update(b.trim().toLowerCase()).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function canAccessOrder(order: OrderDoc | null, email: string | undefined, user: AuthenticatedUser | null): order is OrderDoc {
  return (
    !!order &&
    ((email !== undefined && sameEmail(order.email, email)) || (user !== null && order.userId !== null && order.userId === user.uid))
  );
}

export async function loadCustomerOrder(store: DocStore, orderId: string, email: string | undefined, user: AuthenticatedUser | null): Promise<OrderDoc> {
  const order = asOrder(await store.get(orderPath(orderId)));
  if (!canAccessOrder(order, email, user)) throw new ApiError(404, 'NOT_FOUND', 'No order matches these details.');
  return order;
}
