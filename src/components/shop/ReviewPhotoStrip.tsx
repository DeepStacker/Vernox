import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { reviewPhotoUrl } from '@/lib/data/reviewPhotos';

function usePhotoUrl(path: string) {
  return useQuery({ queryKey: ['review-photo-url', path], queryFn: () => reviewPhotoUrl(path), staleTime: 30 * 60_000, retry: false });
}

function Thumb({ path, size, onOpen }: { path: string; size: string; onOpen: (url: string) => void }) {
  const { data: url } = usePhotoUrl(path);
  if (!url) return <span className={`${size} rounded-md bg-muted`} aria-hidden="true" />;
  return (
    <button type="button" onClick={() => onOpen(url)} aria-label="View review photo" className={`${size} overflow-hidden rounded-md border border-border`}>
      <img src={url} alt="Customer's review photo" loading="lazy" className="h-full w-full object-cover" />
    </button>
  );
}

/**
 * Thumbnails for a review's photos; click opens a larger view. URLs are resolved lazily from the Storage
 * paths (public `reviews/{id}/{n}.webp` on the storefront, the private upload for a moderator), so the
 * Storage SDK loads only when a review actually has photos.
 */
export function ReviewPhotoStrip({ paths, size = 'h-16 w-16' }: { paths: string[] | undefined; size?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!paths || paths.length === 0) return null;
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {paths.map(path => <Thumb key={path} path={path} size={size} onOpen={setOpen} />)}
      </div>
      <Dialog open={open !== null} onOpenChange={next => { if (!next) setOpen(null); }}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">Review photo</DialogTitle>
          <DialogDescription className="sr-only">A larger view of the customer's photo.</DialogDescription>
          {open && <img src={open} alt="Customer's review photo, enlarged" className="max-h-[80vh] w-full rounded object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
