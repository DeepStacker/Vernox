import { useOrderPhotos } from '@/lib/data/orderPhotos';

/** Thumbnails of private order photos (return evidence, QC photos); each opens full size. */
export function PhotoStrip({ paths, label, alt, empty }: { paths: readonly string[]; label: string; alt: string; empty?: string }) {
  const photos = useOrderPhotos(paths);
  if (paths.length === 0) return empty ? <p className="text-xs text-muted-foreground">{empty}</p> : null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label={label}>
      {photos.map(p => (
        <li key={p.path} className="h-24 w-24 overflow-hidden rounded-md border border-border bg-muted">
          {p.url ? (
            <a href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt={alt} className="h-full w-full object-cover" /></a>
          ) : (
            <span className="flex h-full items-center justify-center px-1 text-center text-[11px] text-muted-foreground">{p.loading ? 'Loading…' : p.error ?? 'Unavailable'}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
