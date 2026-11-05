import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCatalog } from '@/lib/catalogContext';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { EmptyState, ErrorState, ProductGridSkeleton } from '@/components/shop/StateViews';
import { reviewStatsByProduct, sortProducts } from '@/lib/storefront/listing';

export function Bestsellers() {
  const { products, reviews, productsLoading, productsError } = useCatalog();
  const top = useMemo(
    () => sortProducts(products, 'popular', reviewStatsByProduct(reviews)).slice(0, 8),
    [products, reviews],
  );

  return (
    <section className="container py-10 sm:py-12" aria-labelledby="best-heading">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 id="best-heading" className="section-title">Bestsellers</h2>
        <Link to="/shop" className="inline-flex min-h-11 items-center text-sm font-semibold text-burgundy hover:underline">View all</Link>
      </div>
      {productsLoading && <ProductGridSkeleton />}
      {productsError && <ErrorState>Designs could not be loaded. Please refresh the page.</ErrorState>}
      {!productsLoading && !productsError && top.length === 0 && <EmptyState title="New designs are coming soon" />}
      {top.length > 0 && <ProductGrid products={top} />}
    </section>
  );
}
