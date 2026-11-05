import { Star } from 'lucide-react';

interface Props {
  average: number;
  count: number;
}

/** Only rendered when real published reviews exist; callers must not pass placeholder values. */
export function StarRating({ average, count }: Props) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-label={`Rated ${average.toFixed(1)} out of 5 from ${count} reviews`}>
      <Star className="h-3.5 w-3.5 fill-brass text-brass" aria-hidden="true" />
      <span className="font-semibold text-foreground">{average.toFixed(1)}</span>
      <span>({count})</span>
    </span>
  );
}
