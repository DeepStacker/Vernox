/**
 * Storefront read facade.
 *
 * The former 2,500-line catalog context was split by domain (src/lib/data/*, src/lib/auth/*).
 * What remains is a thin, read-only composition of PUBLIC data (products, categories, settings,
 * published reviews, topics, wishlist) so storefront components keep a single hook. The public data
 * comes from the CDN-cached /api/catalog (publicCatalog.ts), not from Firestore.
 * It never touches orders, users, coupons or staff data; admin screens use the live domain hooks
 * (src/lib/data/adminData.ts).
 */
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { DEFAULT_HOMEPAGE_SETTINGS, DEFAULT_STORE_CONFIG } from '@/lib/data/catalogMappers';
import { usePublicCatalog } from '@/lib/data/publicCatalog';
import { useWishlist } from '@/lib/data/wishlist';
import type { Product } from '@/types/store';

export type { Product, ProductCategory, Review, Topic, HeroSlide, HomepageSettings, StoreConfig, CustomerAccount } from '@/types/store';
export { DEFAULT_HERO_SLIDES } from '@/lib/data/catalogMappers';

export function CatalogProvider({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

export function useCatalog() {
  const catalog = usePublicCatalog();
  const { wishlist, toggleWishlist, isInWishlist } = useWishlist();

  const data = catalog.data;
  const productList: Product[] = data?.products ?? [];

  return {
    products: productList,
    categories: data?.categories ?? [],
    homepageSettings: data?.homepage ?? DEFAULT_HOMEPAGE_SETTINGS,
    storeConfig: data?.storeConfig ?? DEFAULT_STORE_CONFIG,
    topics: data?.topics ?? [],
    reviews: data?.reviews ?? [],
    wishlist,
    toggleWishlist,
    isInWishlist,
    getProductBySlug: (slug: string) => productList.find(p => p.slug === slug),
    /** Surfaces catalog load failures so pages can show an error instead of an empty shop. */
    productsLoading: catalog.isLoading,
    productsError: (catalog.error as Error | null) ?? null,
    refetchProducts: () => catalog.refetch(),
  };
}
