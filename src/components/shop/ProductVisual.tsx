import { Picture } from '@/components/shop/Picture';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import type { Product } from '@/lib/catalog';
import { cn } from '@/lib/utils';

interface Props {
  product: Pick<Product, 'name' | 'shapeId' | 'imageUrl'>;
  finish: string;
  className?: string;
  priority?: boolean;
}

/**
 * Product picture. Uses the real photograph when `imageUrl` is set; otherwise draws the design
 * as a metal plate on a wall-coloured tile (see TODO(catalogue) in src/lib/catalog.ts).
 */
export function ProductVisual({ product, finish, className, priority }: Props) {
  if (product.imageUrl) {
    return (
      <div className={cn('aspect-square overflow-hidden bg-secondary', className)}>
        <Picture src={product.imageUrl} alt={product.name} width={800} height={800} priority={priority} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={`${product.name} in ${finish.replace(/_/g, ' ')} finish`}
      className={cn('flex aspect-square items-center justify-center bg-[#EFE8DD] p-[14%]', className)}
    >
      <ShapeThumb shapeId={product.shapeId} finish={finish} className="h-full w-full" />
    </div>
  );
}
