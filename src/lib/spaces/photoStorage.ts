/**
 * Firebase Storage access for wall photos and consultation images. Storage is imported lazily
 * so the SDK is not part of the storefront's first load. Paths and access rules: storage.rules.
 */
import { backdropFromFile, type Backdrop } from '@/components/wall-preview/render/backdrop';
import { app } from '@/lib/firebase';

async function storage() {
  const { getStorage, connectStorageEmulator } = await import('firebase/storage');
  const instance = getStorage(app);
  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    try { connectStorageEmulator(instance, import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1', 9199); } catch { /* already connected */ }
  }
  return instance;
}

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
  /** The same pixels, for marking a known object on the photo. */
  backdrop: Backdrop;
}

const JPEG_QUALITY = 0.85;

/** Decodes a photo (honouring EXIF orientation), downsizes it to at most 1600 px and re-encodes it as JPEG. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const backdrop = await backdropFromFile(file);
  const blob = await new Promise<Blob | null>(resolve => backdrop.source.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('This photo could not be prepared. Try another one.');
  return { blob, width: backdrop.width, height: backdrop.height, backdrop };
}

export async function uploadImage(path: string, blob: Blob): Promise<void> {
  const { ref, uploadBytes } = await import('firebase/storage');
  await uploadBytes(ref(await storage(), path), blob, { contentType: blob.type || 'image/jpeg' });
}

export async function deleteImage(path: string): Promise<void> {
  const { ref, deleteObject } = await import('firebase/storage');
  try {
    await deleteObject(ref(await storage(), path));
  } catch (err) {
    if ((err as { code?: string }).code !== 'storage/object-not-found') throw err;
  }
}

/**
 * Downloads an image through the Storage SDK and returns a same-origin blob: URL. The wall preview needs
 * pixels it can read back (lighting, export), which a cross-origin <img> would taint. In production the
 * bucket must allow the site's origin in its CORS configuration (DEPLOYMENT.md).
 */
export async function imageObjectUrl(path: string): Promise<string> {
  const { ref, getBlob } = await import('firebase/storage');
  return URL.createObjectURL(await getBlob(ref(await storage(), path)));
}
