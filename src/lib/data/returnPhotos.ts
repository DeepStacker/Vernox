/**
 * Return-request photos. They live in Firebase Storage at `returns/{orderId}/{file}`; storage.rules
 * lets the order's customer and staff with order access (orders.read) read them, so staff load
 * them with a normal download URL. Storage is imported lazily: only the Returns console needs it.
 */
import { useQueries } from '@tanstack/react-query';
import { app } from '@/lib/firebase';

async function downloadUrl(path: string): Promise<string> {
  const { getStorage, ref, getDownloadURL, connectStorageEmulator } = await import('firebase/storage');
  const storage = getStorage(app);
  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    try { connectStorageEmulator(storage, import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1', 9199); } catch { /* already connected */ }
  }
  return getDownloadURL(ref(storage, path));
}

export interface ReturnPhoto { path: string; url?: string; error?: string; loading: boolean }

export function useReturnPhotos(paths: readonly string[]): ReturnPhoto[] {
  const results = useQueries({
    queries: paths.map(path => ({
      queryKey: ['admin', 'return-photo', path],
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
