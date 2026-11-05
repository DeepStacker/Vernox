import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Picture, SITE_IMAGES } from '@/components/shop/Picture';
import { ProductVisual } from '@/components/shop/ProductVisual';
import { RoomVisualizer } from '@/components/experience/RoomVisualizer';
import type { Product, ProductSize } from '@/lib/catalog';
import { cn } from '@/lib/utils';

type View = 'product' | 'closeup' | 'room' | 'wall';

interface Props {
  product: Product;
  finish: string;
  size: ProductSize;
  /** Plate scale for the chosen size (0..1); the product view morphs to it. */
  plateScale?: number;
}

const ROOM_PHOTO = {
  living: SITE_IMAGES.livingRoom, bedroom: SITE_IMAGES.bedroom, office: SITE_IMAGES.office,
  entrance: SITE_IMAGES.entrance, outdoor: SITE_IMAGES.round, pooja: SITE_IMAGES.livingRoom, kids: SITE_IMAGES.bedroom,
} as const;

/** Product views: the design, a close-up, a sample room photo and the to-scale wall view. Click the stage to zoom. */
export function ProductGallery({ product, finish, size, plateScale = 1 }: Props) {
  const [view, setView] = useState<View>('product');
  const [zoom, setZoom] = useState(false);
  const roomPhoto = ROOM_PHOTO[product.rooms?.[0] ?? 'living'];

  const tabs: { id: View; label: string }[] = [
    { id: 'product', label: 'Product' },
    { id: 'closeup', label: 'Close-up' },
    { id: 'room', label: 'In a room' },
    { id: 'wall', label: 'View on your wall' },
  ];

  const stage = (large: boolean) => {
    if (view === 'wall') return <RoomVisualizer shapeId={product.shapeId} finish={finish} widthMm={size.widthMm} heightMm={size.heightMm} />;
    if (view === 'room') {
      return (
        <div>
          {/* TODO(catalogue) lives in src/lib/catalog.ts: swap for the real lifestyle photo of this product. */}
          <Picture {...roomPhoto} alt="Sample room with metal wall art" className="w-full rounded-lg object-cover" />
          <p className="mt-2 text-xs text-muted-foreground">Sample room photo for mood only. Your piece is shown in the other views.</p>
        </div>
      );
    }
    return (
      <div className={cn('overflow-hidden rounded-lg', view === 'closeup' && 'cursor-zoom-in')}>
        <ProductVisual product={product} finish={finish} priority={!large} scale={plateScale} className={cn('rounded-lg', view === 'closeup' && 'scale-[1.8]')} />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        {stage(false)}
        {(view === 'product' || view === 'closeup') && (
          <button type="button" onClick={() => setZoom(true)} aria-label="Zoom image" className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-card/90 shadow-soft">
            <Maximize2 className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div role="tablist" aria-label="Product views" className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={view === t.id}
            onClick={() => setView(t.id)}
            className={cn('min-h-10 rounded-full border px-3 text-sm', view === t.id ? 'border-burgundy bg-burgundy text-cream' : 'border-border bg-card')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{product.name} enlarged</DialogTitle>
          <ProductVisual product={product} finish={finish} className="rounded-lg" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
