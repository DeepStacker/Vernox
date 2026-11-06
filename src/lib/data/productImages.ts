/**
 * Catalogue photo upload for the admin product form. Photos are decoded and downsized in the browser
 * (longest edge 2000 px, WebP), so storefront pages stay light on mobile data, then stored at
 * `products/{folder}/{file}.webp` — publicly readable, written only by catalogue staff (storage.rules).
 * The returned download URL is what the product's `imageUrl` / `lifestyleImage` field stores.
 */
import { backdropFromFile } from '@/components/wall-preview/render/backdrop';
import { appStorage } from '@/lib/appStorage';

const MAX_EDGE = 2000;
const WEBP_QUALITY = 0.85;
/** Mirrors the storage.rules limit for catalogue photos. */
export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

export async function uploadProductImage(folder: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPEG, PNG or WebP).');
  const { source } = await backdropFromFile(file, MAX_EDGE);
  const blob = await new Promise<Blob | null>(resolve => source.toBlob(resolve, 'image/webp', WEBP_QUALITY));
  // Browsers without WebP encoding return PNG; refuse rather than store a heavy file under a .webp name.
  if (!blob || blob.type !== 'image/webp') throw new Error('This browser cannot prepare the photo. Try Chrome, Edge or Firefox.');
  if (blob.size > MAX_PRODUCT_IMAGE_BYTES) throw new Error('The photo is still over 2 MB after resizing. Try a simpler image.');
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const target = ref(await appStorage(), `products/${folder}/${name}`);
  await uploadBytes(target, blob, { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' });
  return getDownloadURL(target);
}
