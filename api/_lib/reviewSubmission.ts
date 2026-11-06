/**
 * Customer review submission (`reviews/{id}`; moderation is SAVE_REVIEW in api/admin.ts).
 *
 * Only a signed-in customer with a Delivered order that contains the product may review it, checked
 * here against the order (never trusted from the client). A customer has one review per product:
 * the id is derived from (uid, product), so a repeated submit is a conflict instead of a duplicate.
 * Reviews are written `pending` and `verified: true` (the purchase was checked); nothing is public
 * until staff with `reviews.moderate` publish it. Up to 3 photos may be attached as `photoPaths` (private
 * uploads, see reviewPhotos.ts); they become public only when the review is published.
 */
import crypto from 'crypto';
import { z } from 'zod';
import type { AuthenticatedUser } from './auth';
import { ApiError } from './errors';
import { asOrder, type OrderDoc } from './orders';
import { MAX_REVIEW_PHOTOS, validateReviewPhotoPaths, type ReviewPhotoStorage } from './reviewPhotos';
import { AlreadyExistsError, type DocStore } from './store';

export const reviewStatusRequestSchema = z.object({
  action: z.literal('REVIEW_STATUS'),
  productId: z.string().trim().min(1).max(128),
});

export const submitReviewRequestSchema = z.object({
  action: z.literal('SUBMIT_REVIEW'),
  productId: z.string().trim().min(1).max(128),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(10).max(2000),
  photoPaths: z.array(z.string().trim().min(1).max(200)).max(MAX_REVIEW_PHOTOS).optional(),
});

export interface ReviewEligibility {
  eligible: boolean;
  /** Set when not eligible. */
  reason?: 'not_purchased' | 'already_reviewed';
  /** Moderation status of the customer's existing review, when there is one. */
  reviewStatus?: string;
}

export const reviewId = (uid: string, productId: string) =>
  `rv_${crypto.createHash('sha256').update(`${uid}:${productId}`).digest('hex').slice(0, 32)}`;

/** "Asha Rao" -> "Asha R."; one-word names stay as they are. */
export function publicReviewerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Customer';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

async function deliveredOrdersWithProduct(store: DocStore, user: AuthenticatedUser, productId: string): Promise<OrderDoc[]> {
  const queries = [store.query('orders', { where: [{ field: 'userId', op: '==', value: user.uid }, { field: 'status', op: '==', value: 'Delivered' }], limit: 100 })];
  // Guest checkouts are keyed by email; a verified address ties them to this account.
  if (user.email && user.emailVerified) {
    queries.push(store.query('orders', { where: [{ field: 'email', op: '==', value: user.email }, { field: 'status', op: '==', value: 'Delivered' }], limit: 100 }));
  }
  const seen = new Map<string, OrderDoc>();
  for (const rows of await Promise.all(queries)) {
    for (const row of rows) {
      const order = asOrder({ ...row.data, id: row.id });
      if (order && order.items.some(i => i.productId === productId)) seen.set(order.id, order);
    }
  }
  return [...seen.values()].sort((a, b) => (b.deliveredAt ?? b.placedAt) - (a.deliveredAt ?? a.placedAt));
}

export async function reviewEligibility(store: DocStore, user: AuthenticatedUser, productId: string): Promise<ReviewEligibility> {
  const existing = await store.get(`reviews/${reviewId(user.uid, productId)}`);
  if (existing) return { eligible: false, reason: 'already_reviewed', reviewStatus: String(existing.status ?? 'pending') };
  const orders = await deliveredOrdersWithProduct(store, user, productId);
  return orders.length > 0 ? { eligible: true } : { eligible: false, reason: 'not_purchased' };
}

export async function submitReview(
  store: DocStore,
  user: AuthenticatedUser,
  input: z.infer<typeof submitReviewRequestSchema>,
  storage: ReviewPhotoStorage,
  now = Date.now(),
): Promise<{ id: string }> {
  const existing = await store.get(`reviews/${reviewId(user.uid, input.productId)}`);
  if (existing) throw new ApiError(409, 'CONFLICT', 'You have already reviewed this design.');
  const [order] = await deliveredOrdersWithProduct(store, user, input.productId);
  if (!order) throw new ApiError(403, 'FORBIDDEN', 'You can review a design after an order containing it has been delivered.');

  const photoPaths = await validateReviewPhotoPaths(storage, user.uid, input.photoPaths ?? []);

  const id = reviewId(user.uid, input.productId);
  try {
    await store.create(`reviews/${id}`, {
      id,
      productId: input.productId,
      userId: user.uid,
      orderId: order.id,
      customerName: publicReviewerName(order.customer?.name ?? ''),
      ...(order.customer?.city ? { location: order.customer.city } : {}),
      rating: input.rating,
      comment: input.comment,
      ...(photoPaths.length > 0 ? { photoPaths } : {}),
      verified: true,
      status: 'pending',
      placedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    if (err instanceof AlreadyExistsError) throw new ApiError(409, 'CONFLICT', 'You have already reviewed this design.');
    throw err;
  }
  return { id };
}
