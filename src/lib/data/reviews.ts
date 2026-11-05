/**
 * Reviews. The storefront reads only published reviews; moderation (all statuses) and writes
 * go through the admin API so they are role-checked and audited server-side.
 */
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Review } from '@/types/store';
import { adminAction } from './adminApi';
import { stripUndefined, useOptimisticMutation } from './optimistic';

export const PUBLISHED_REVIEWS_KEY = ['reviews', 'published'] as const;
export const ALL_REVIEWS_KEY = ['admin', 'reviews'] as const;

function toReview(id: string, raw: Record<string, unknown>): Review {
  const r = raw as Partial<Review>;
  return {
    productId: '',
    customerName: 'Anonymous',
    rating: 0,
    comment: '',
    placedAt: 0,
    ...r,
    id,
  };
}

export async function fetchPublishedReviews(): Promise<Review[]> {
  const snap = await getDocs(query(collection(db, 'reviews'), where('status', '==', 'published'), limit(500)));
  return snap.docs.map(d => toReview(d.id, d.data())).sort((a, b) => b.placedAt - a.placedAt);
}

export async function fetchAllReviews(): Promise<Review[]> {
  const snap = await getDocs(query(collection(db, 'reviews'), limit(1000)));
  return snap.docs.map(d => toReview(d.id, d.data())).sort((a, b) => b.placedAt - a.placedAt);
}

export function usePublishedReviews() {
  return useQuery({ queryKey: PUBLISHED_REVIEWS_KEY, queryFn: fetchPublishedReviews, staleTime: 5 * 60_000 });
}

/** Moderation list; only fetched when the signed-in staff role may moderate reviews. */
export function useAllReviews(enabled: boolean) {
  return useQuery({ queryKey: ALL_REVIEWS_KEY, queryFn: fetchAllReviews, enabled, staleTime: 30_000 });
}

export function useReviewMutations() {
  const save = useOptimisticMutation<Review[], Review>({
    queryKey: ALL_REVIEWS_KEY,
    mutationFn: review => adminAction('SAVE_REVIEW', { review: stripUndefined(review) }),
    apply: (cur = [], review) =>
      cur.some(r => r.id === review.id) ? cur.map(r => (r.id === review.id ? review : r)) : [review, ...cur],
    failureMessage: 'Could not save review',
  });

  const remove = useOptimisticMutation<Review[], string>({
    queryKey: ALL_REVIEWS_KEY,
    mutationFn: reviewId => adminAction('DELETE_REVIEW', { reviewId }),
    apply: (cur = [], id) => cur.filter(r => r.id !== id),
    failureMessage: 'Could not delete review',
  });

  return { saveReview: save.run, deleteReview: remove.run };
}
