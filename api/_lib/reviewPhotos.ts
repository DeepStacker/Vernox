/**
 * Review photos. A customer uploads to a PRIVATE path, `review-uploads/{uid}/{file}.webp` (storage.rules:
 * the owner and reviews.moderate staff read it). The pending review keeps those paths in `photoPaths`.
 * Only when a moderator publishes the review does the server copy each photo to the PUBLIC path
 * `reviews/{reviewId}/{n}.webp` and record them in `photos`; unpublishing or deleting the review removes
 * the public copies. Clients never write `photos` or `photoPaths` (SAVE_REVIEW's schema drops them).
 */
import { ApiError } from './errors';
import type { DocStore } from './store';

export const MAX_REVIEW_PHOTOS = 3;
/** Mirrors storage.rules for review-uploads/. */
export const REVIEW_PHOTO_FILE = /^[A-Za-z0-9_-]{1,60}\.webp$/;

/** Server-side bucket access for review photos (Admin SDK in production, a fake in tests). */
export interface ReviewPhotoStorage {
  copy(fromPath: string, toPath: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Removes the object; a missing object is not an error. */
  delete(path: string): Promise<void>;
}

export const publicReviewPhotoPath = (reviewId: string, n: number) => `reviews/${reviewId}/${n}.webp`;

/** Every submitted path must be one of the caller's own uploads and exist; returns them de-duplicated. */
export async function validateReviewPhotoPaths(storage: ReviewPhotoStorage, uid: string, paths: string[]): Promise<string[]> {
  const unique = [...new Set(paths)];
  const prefix = `review-uploads/${uid}/`;
  for (const path of unique) {
    if (!path.startsWith(prefix) || !REVIEW_PHOTO_FILE.test(path.slice(prefix.length))) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'A review photo path is not valid.');
    }
  }
  const found = await Promise.all(unique.map(path => storage.exists(path)));
  if (found.some(ok => !ok)) throw new ApiError(400, 'VALIDATION_ERROR', 'A review photo has not finished uploading. Please try again.');
  return unique;
}

const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/**
 * Brings a review's public photos in line with its new moderation status, for SAVE_REVIEW. Returns the
 * `photos` value to store. Idempotent: an already-published review keeps its copies, so re-saving
 * (a reply, a featured toggle) copies nothing. A private photo the customer deleted meanwhile is skipped.
 * Copies happen before the review is written and removals before it is unpublished, so a storage failure
 * leaves the review as it was and the moderator can retry.
 */
export async function syncPublicReviewPhotos(
  storage: ReviewPhotoStorage,
  reviewId: string,
  existing: Record<string, unknown> | null,
  nextStatus: 'published' | 'pending' | 'archived',
): Promise<string[]> {
  const current = stringList(existing?.photos);
  if (nextStatus !== 'published') {
    await Promise.all(current.map(path => storage.delete(path)));
    return [];
  }
  if (existing?.status === 'published' && current.length > 0) return current;
  const out: string[] = [];
  for (const source of stringList(existing?.photoPaths).slice(0, MAX_REVIEW_PHOTOS)) {
    if (!(await storage.exists(source))) {
      console.error(`[reviews] private photo ${source} for ${reviewId} is gone; skipping`);
      continue;
    }
    const target = publicReviewPhotoPath(reviewId, out.length + 1);
    await storage.copy(source, target);
    out.push(target);
  }
  return out;
}

/** DELETE_REVIEW: removes the public copies and the customer's private uploads, then the document. */
export async function deleteReviewAndPhotos(store: DocStore, storage: ReviewPhotoStorage, reviewId: string): Promise<void> {
  const existing = await store.get(`reviews/${reviewId}`);
  const paths = [...stringList(existing?.photos), ...stringList(existing?.photoPaths)];
  await Promise.all(paths.map(path => storage.delete(path)));
  await store.delete(`reviews/${reviewId}`);
}
