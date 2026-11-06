/**
 * Return-request photos. They live in Firebase Storage at `returns/{orderId}/{file}`; storage.rules
 * lets the order's customer and staff with order access (orders.read) read them, so staff load
 * them with a normal download URL. Storage is imported lazily: only the Returns console needs it.
 */
import { useQueries } from '@tanstack/react-query';
import { appStorage } from '@/lib/appStorage';

async function downloadUrl(path: string): Promise<string> {
  const { ref, getDownloadURL } = await import('firebase/storage');
  return getDownloadURL(ref(await appStorage(), path));
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
