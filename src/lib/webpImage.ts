/**
 * Browser-side image preparation shared by every WebP upload (catalogue photos, review photos):
 * decode (honouring EXIF orientation), downsize to a longest edge, encode as WebP, and enforce the
 * byte limit that storage.rules applies to the same path.
 */
import { backdropFromFile } from '@/components/wall-preview/render/backdrop';

const WEBP_QUALITY = 0.85;

export async function prepareWebp(file: File, maxEdge: number, maxBytes: number): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPEG, PNG or WebP).');
  const { source } = await backdropFromFile(file, maxEdge);
  const blob = await new Promise<Blob | null>(resolve => source.toBlob(resolve, 'image/webp', WEBP_QUALITY));
  // Browsers without WebP encoding return PNG; refuse rather than store a heavy file under a .webp name.
  if (!blob || blob.type !== 'image/webp') throw new Error('This browser cannot prepare the photo. Try Chrome, Edge or Firefox.');
  if (blob.size > maxBytes) throw new Error(`The photo is still over ${Math.round(maxBytes / (1024 * 1024))} MB after resizing. Try a simpler image.`);
  return blob;
}

/** Unique, rule-safe `.webp` file name. */
export const newWebpName = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.webp`;
