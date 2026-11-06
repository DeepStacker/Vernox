/**
 * Catalogue photo upload for the admin product form. Photos are decoded and downsized in the browser
 * (longest edge 2000 px, WebP), so storefront pages stay light on mobile data, then stored at
 * `products/{folder}/{file}.webp` — publicly readable, written only by catalogue staff (storage.rules).
 * The returned download URL is what the product's `imageUrl` / `lifestyleImage` field stores.
 */
import { appStorage } from '@/lib/appStorage';
import { newWebpName, prepareWebp } from '@/lib/webpImage';

const MAX_EDGE = 2000;
/** Mirrors the storage.rules limit for catalogue photos. */
export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

export async function uploadProductImage(folder: string, file: File): Promise<string> {
  const blob = await prepareWebp(file, MAX_EDGE, MAX_PRODUCT_IMAGE_BYTES);
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
  const target = ref(await appStorage(), `products/${folder}/${newWebpName()}`);
  await uploadBytes(target, blob, { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' });
  return getDownloadURL(target);
}
