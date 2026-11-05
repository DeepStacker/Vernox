import { discountPercent, mrpFor, unitPrice, type Product, type ProductSize } from '@/lib/catalog';
import { formatINR } from '@/lib/storefront/format';
import { cn } from '@/lib/utils';

interface Props {
  product: Pick<Product, 'price' | 'mrp'>;
  size?: ProductSize;
  /** "From" prefix for listings that show the lowest price. */
  from?: boolean;
  large?: boolean;
  /** Card layout: one line, price and MRP only (the badge on the image already shows the discount). */
  compact?: boolean;
  className?: string;
}

/** Price, strike-through MRP and discount. All figures exclude GST, matching what the server prices. */
export function PriceTag({ product, size, from, large, compact, className }: Props) {
  const price = unitPrice(product, size);
  const mrp = mrpFor(product, size);
  const off = discountPercent(product);
  return (
    <div className={cn('flex items-baseline gap-x-2', !compact && 'flex-wrap', className)}>
      {from && <span className="text-xs text-muted-foreground">From</span>}
      <span className={cn('font-semibold text-foreground', large ? 'text-3xl' : 'text-base')}>{formatINR(price)}</span>
      {mrp && <span className={cn('text-muted-foreground line-through', large ? 'text-base' : 'text-sm')}>{formatINR(mrp)}</span>}
      {!compact && mrp && off > 0 && <span className={cn('font-semibold text-emerald-800', large ? 'text-base' : 'text-sm')}>{off}% off</span>}
    </div>
  );
}
