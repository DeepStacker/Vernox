/**
 * Review photos in the browser. Customers upload a resized WebP to their PRIVATE folder
 * `review-uploads/{uid}/` and send the paths with SUBMIT_REVIEW; the server publishes a public copy at
 * `reviews/{id}/{n}.webp` only after a moderator approves the review (api/_lib/reviewPhotos.ts).
 * URLs are resolved on demand so the Storage SDK loads only when a photo is actually shown.
 */
import { appStorage } from '@/lib/appStorage';
import { newWebpName, prepareWebp } from '@/lib/webpImage';

export const MAX_REVIEW_PHOTOS = 3;
const MAX_EDGE = 1600;
/** Mirrors the storage.rules limit for review uploads. */
export const MAX_REVIEW_PHOTO_BYTES = 2 * 1024 * 1024;

/** Resizes and uploads one photo to the customer's private folder; returns its Storage path. */
export async function uploadReviewPhoto(uid: string, file: File): Promise<string> {
  const blob = await prepareWebp(file, MAX_EDGE, MAX_REVIEW_PHOTO_BYTES);
  const { ref, uploadBytes } = await import('firebase/storage');
  const path = `review-uploads/${uid}/${newWebpName()}`;
  await uploadBytes(ref(await appStorage(), path), blob, { contentType: 'image/webp' });
  return path;
}

/** Download URL for a Storage path (public review copy, or a private upload for a moderator). */
export async function reviewPhotoUrl(path: string): Promise<string> {
  const { ref, getDownloadURL } = await import('firebase/storage');
  return getDownloadURL(ref(await appStorage(), path));
}
