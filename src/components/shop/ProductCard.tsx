import { useState, type MouseEvent } from 'react';
import { flyToCart } from '@/lib/storefront/motion';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { discountPercent, finishLabels, finishName, type Product } from '@/lib/catalog';
import { useCart } from '@/lib/cartContext';
import type { ReviewStats } from '@/lib/storefront/listing';
import { ProductVisual } from '@/components/shop/ProductVisual';
import { PriceTag } from '@/components/shop/PriceTag';
import { StarRating } from '@/components/shop/StarRating';

interface Props {
  product: Product;
  stats?: ReviewStats;
  isWishlisted: boolean;
  onToggleWishlist: (productId: string) => void;
  priority?: boolean;
}

export function ProductCard({ product, stats, isWishlisted, onToggleWishlist, priority }: Props) {
  const { add } = useCart();
  const [finish, setFinish] = useState<string>(product.finishes[0] ?? 'brass');
  const off = discountPercent(product);
  const smallest = product.sizes[0];
  const outOfStock = product.trackInventory !== false && product.stock <= 0;

  const quickAdd = (e: MouseEvent<HTMLButtonElement>) => {
    flyToCart(e.currentTarget);
    add({
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      shapeId: product.shapeId,
      sizeLabel: smallest?.label ?? 'Standard',
      widthMm: smallest?.widthMm ?? 0,
      heightMm: smallest?.heightMm ?? 0,
      finish,
      unitPrice: product.price + (smallest?.priceDelta ?? 0),
      quantity: 1,
    });
    toast.success(`${product.name} added to your cart`, { description: `${smallest?.label ?? 'Standard size'}, ${finishName(finish)}` });
  };

  return (
    <article className="group lift flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative">
        <Link to={`/product/${product.slug}`} aria-label={product.name} className="block">
          <ProductVisual product={product} finish={finish} priority={priority} />
        </Link>
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1">
          {off > 0 && <span className="rounded bg-burgundy px-2 py-0.5 text-xs font-semibold text-cream">{off}% off</span>}
          {product.isNew && <span className="rounded bg-card px-2 py-0.5 text-xs font-semibold text-foreground shadow-soft">New</span>}
        </div>
        <button
          type="button"
          onClick={() => onToggleWishlist(product.id)}
          aria-pressed={isWishlisted}
          aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-card/90 text-foreground shadow-soft hover:bg-card"
        >
          <Heart className={isWishlisted ? 'h-5 w-5 fill-burgundy text-burgundy' : 'h-5 w-5'} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <Link to={`/product/${product.slug}`} className="line-clamp-2 min-h-[2.6em] font-display text-lg leading-snug text-foreground hover:text-burgundy sm:text-xl">
          {product.name}
        </Link>

        <div className="flex items-center gap-1.5" role="group" aria-label="Finish">
          {product.finishes.slice(0, 5).map(id => (
            <button
              key={id}
              type="button"
              onClick={() => setFinish(id)}
              aria-label={finishName(id)}
              aria-pressed={finish === id}
              title={finishName(id)}
              className={`h-6 w-6 rounded-full border ${finish === id ? 'ring-2 ring-ring ring-offset-1' : 'border-border'}`}
              style={{ background: finishLabels[id]?.swatch }}
            />
          ))}
        </div>

        <PriceTag product={product} from={product.sizes.length > 1} compact className="mt-auto" />
        {stats && stats.count > 0 && <StarRating average={stats.average} count={stats.count} />}

        <button
          type="button"
          onClick={quickAdd}
          disabled={outOfStock}
          className="btn-secondary mt-1 w-full py-2 text-sm"
          aria-label={`Quick add ${product.name} (${smallest?.label ?? 'standard size'}) to cart`}
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          {outOfStock ? 'Out of stock' : 'Quick add'}
        </button>
      </div>
    </article>
  );
}
