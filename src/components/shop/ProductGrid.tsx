import { useMemo } from 'react';
import type { Product } from '@/lib/catalog';
import { useCatalog } from '@/lib/catalogContext';
import { reviewStatsByProduct } from '@/lib/storefront/listing';
import { ProductCard } from '@/components/shop/ProductCard';

interface Props {
  products: Product[];
  /** Number of leading cards treated as above the fold (eager images). */
  priorityCount?: number;
  className?: string;
}

/** Grid of product cards wired to wishlist and real review stats; shared by home, shop, PDP and cart. */
export function ProductGrid({ products, priorityCount = 0, className = 'grid-cols-2 lg:grid-cols-4' }: Props) {
  const { reviews, isInWishlist, toggleWishlist } = useCatalog();
  const stats = useMemo(() => reviewStatsByProduct(reviews), [reviews]);
  return (
    <div className={`grid gap-3 sm:gap-5 ${className}`}>
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} stats={stats.get(p.id)} isWishlisted={isInWishlist(p.id)} onToggleWishlist={toggleWishlist} priority={i < priorityCount} />
      ))}
    </div>
  );
}
