import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { formatSizeCm, type ProductSize } from '@/lib/catalog';
import { trackWallPreview, type EventData } from '@/lib/wallPreview/analytics';
import { recommendSizes, type SizeVerdict } from '@/lib/wallPreview/recommend';

interface Props {
  sizes: ProductSize[];
  sizeIndex: number;
  onPick: (index: number) => void;
  eventData: EventData;
}

const VERDICT_TEXT: Record<SizeVerdict, string> = {
  small: 'a little small for this wall',
  good: 'a good proportion for this wall',
  large: 'bold, it will dominate the wall',
  toobig: 'too big for this wall',
};

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

/** "Will it fit?": the customer types their wall (and optionally the furniture below it) and gets a size to pick. */
export function FitPanel({ sizes, sizeIndex, onPick, eventData }: Props) {
  const [wallW, setWallW] = useState('');
  const [wallH, setWallH] = useState('');
  const [furnW, setFurnW] = useState('');
  const w = num(wallW), h = num(wallH), f = num(furnW);
  const rec = useMemo(() => (w > 0 ? recommendSizes(sizes, w, h > 0 ? h : undefined, f > 0 ? f : undefined) : null), [sizes, w, h, f]);
  const current = sizes[sizeIndex];
  const aspect = h > 0 ? h / w : 0.6;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="grid grid-cols-3 gap-3">
        {([['Wall width (cm)', wallW, setWallW], ['Wall height (cm)', wallH, setWallH], ['Sofa or bed (cm)', furnW, setFurnW]] as const).map(([label, value, set]) => (
          <label key={label} className="block text-xs text-muted-foreground">
            <span className="mb-1 block">{label}</span>
            <input
              type="number" inputMode="decimal" min={1} value={value} onChange={e => set(e.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-background px-2 text-base text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-burgundy"
            />
          </label>
        ))}
      </div>

      {rec && current && (
        <>
          <svg viewBox={`0 0 100 ${Math.max(20, Math.min(100, aspect * 100))}`} className="w-full rounded-lg bg-secondary" role="img" aria-label={`${formatSizeCm(current)} piece on a ${w} cm wide wall`}>
            <rect
              x={50 - (Math.min(current.widthMm / 10, w) / w) * 50}
              y={(Math.max(20, Math.min(100, aspect * 100)) - ((Math.min(current.heightMm / 10, h > 0 ? h : w * aspect) / w) * 100)) / 2}
              width={(Math.min(current.widthMm / 10, w) / w) * 100}
              height={(Math.min(current.heightMm / 10, h > 0 ? h : w * aspect) / w) * 100}
              fill="#B08A3E" opacity={0.9} rx={0.6}
            />
          </svg>
          <p className="text-sm" aria-live="polite">
            Best width here: {rec.minWidthCm} to {rec.maxWidthCm} cm. {formatSizeCm(current)} is {VERDICT_TEXT[rec.verdicts[sizeIndex]]}.
          </p>
          {rec.bestIndex >= 0 && rec.bestIndex !== sizeIndex && (
            <button
              type="button"
              onClick={() => {
                onPick(rec.bestIndex);
                trackWallPreview('fit_recommendation_used', { ...eventData, recommendedSize: sizes[rec.bestIndex].label, wallWidthCm: Math.round(w) });
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-burgundy px-5 text-sm font-medium text-cream"
            >
              <Check className="h-4 w-4" aria-hidden /> Try {formatSizeCm(sizes[rec.bestIndex])}
            </button>
          )}
        </>
      )}
    </div>
  );
}
