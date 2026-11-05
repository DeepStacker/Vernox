import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCatalog } from '@/lib/catalogContext';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { reviewStatsByProduct, sortProducts } from '@/lib/storefront/listing';

export function Bestsellers() {
  const { products, reviews, productsLoading, productsError } = useCatalog();
  const top = useMemo(
    () => sortProducts(products, 'popular', reviewStatsByProduct(reviews)).slice(0, 8),
    [products, reviews],
  );

  return (
    <section className="container py-12" aria-labelledby="best-heading">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 id="best-heading" className="section-title">Bestsellers</h2>
        <Link to="/shop" className="text-sm font-semibold text-burgundy hover:underline">View all</Link>
      </div>
      {productsLoading && <div className="h-64 animate-pulse rounded-lg bg-secondary" aria-hidden="true" />}
      {productsError && <p role="alert" className="text-sm text-destructive">Designs could not be loaded. Please refresh the page.</p>}
      {!productsLoading && !productsError && top.length === 0 && <p className="text-muted-foreground">New designs are coming soon.</p>}
      {top.length > 0 && <ProductGrid products={top} />}
    </section>
  );
}
