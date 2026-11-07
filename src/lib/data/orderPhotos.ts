/**
 * Private order photos in Firebase Storage, read by staff with a normal download URL:
 *  - `returns/{orderId}/{file}`: the customer's return-request evidence (api/_lib/returns.ts).
 *  - `qc/{orderId}/{file}.webp`: the finished piece photographed at QC. Kept as evidence for damage
 *    claims and returns; the paths ride in the order's notes block (src/lib/orders/orderNotes.ts).
 * storage.rules lets staff with order access (orders.read) read both. Storage is imported lazily.
 */
import { useQueries } from '@tanstack/react-query';
import { appStorage } from '@/lib/appStorage';
import { newWebpName, prepareWebp } from '@/lib/webpImage';

/** Mirrors storage.rules for `qc/`. */
export const MAX_QC_PHOTO_BYTES = 2 * 1024 * 1024;
const QC_MAX_EDGE = 1600;

async function downloadUrl(path: string): Promise<string> {
  const { ref, getDownloadURL } = await import('firebase/storage');
  return getDownloadURL(ref(await appStorage(), path));
}

/** Resizes and uploads one QC photo; returns its Storage path. Files are immutable once stored. */
export async function uploadQcPhoto(orderId: string, file: File): Promise<string> {
  const blob = await prepareWebp(file, QC_MAX_EDGE, MAX_QC_PHOTO_BYTES);
  const { ref, uploadBytes } = await import('firebase/storage');
  const path = `qc/${orderId}/${newWebpName()}`;
  await uploadBytes(ref(await appStorage(), path), blob, { contentType: 'image/webp' });
  return path;
}

export interface OrderPhoto { path: string; url?: string; error?: string; loading: boolean }

export function useOrderPhotos(paths: readonly string[]): OrderPhoto[] {
  const results = useQueries({
    queries: paths.map(path => ({
      queryKey: ['admin', 'order-photo', path],
      queryFn: () => downloadUrl(path),
      staleTime: 30 * 60_000,
      retry: false,
    })),
  });
  return results.map((r, i) => ({
    path: paths[i],
    url: r.data,
    loading: r.isLoading,
    error: r.error ? (r.error instanceof Error ? r.error.message : 'Could not load this photo.') : undefined,
  }));
}
