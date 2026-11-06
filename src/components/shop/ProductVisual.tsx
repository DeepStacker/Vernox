import { Picture } from '@/components/shop/Picture';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import type { Product } from '@/lib/catalog';
import { cn } from '@/lib/utils';

interface Props {
  product: Pick<Product, 'name' | 'shapeId' | 'imageUrl'>;
  finish: string;
  className?: string;
  priority?: boolean;
  /** 0..1 share of the largest size; the plate scales to it (PDP size changes morph, never jump). */
  scale?: number;
  /** Second photograph that crossfades in while the parent `.group` is hovered (product cards, pointer devices only). */
  hoverSrc?: string;
}

/**
 * Product picture. Uses the real photograph when `imageUrl` is set; otherwise draws the design
 * as a metal plate on a wall-coloured tile (see TODO(catalogue) in src/lib/catalog.ts).
 */
export function ProductVisual({ product, finish, className, priority, scale = 1, hoverSrc }: Props) {
  if (product.imageUrl) {
    return (
      <div className={cn('relative aspect-square overflow-hidden bg-secondary', className)}>
        <Picture src={product.imageUrl} alt={product.name} width={800} height={800} priority={priority} className="h-full w-full object-cover" />
        {hoverSrc && (
          // Decorative duplicate view; prefers-reduced-motion collapses the transition to an instant swap.
          <Picture src={hoverSrc} alt="" aria-hidden="true" width={800} height={800}
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-[var(--dur-3)] ease-[var(--ease-out)] [@media(hover:hover)]:group-hover:opacity-100" />
        )}
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={`${product.name} in ${finish.replace(/_/g, ' ')} finish`}
      className={cn('flex aspect-square items-center justify-center wall-tile p-[12%]', className)}
    >
      <ShapeThumb shapeId={product.shapeId} finish={finish} name={product.name} className="metal-plate h-full w-full" style={scale === 1 ? undefined : { transform: `scale(${scale})` }} />
    </div>
  );
}
