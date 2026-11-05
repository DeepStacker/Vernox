/**
 * Storefront read facade.
 *
 * The former 2,500-line catalog context was split by domain (src/lib/data/*, src/lib/auth/*).
 * What remains is a thin, read-only composition of PUBLIC data (products, categories, settings,
 * published reviews, topics, wishlist) so storefront components keep a single hook.
 * It never touches orders, users, coupons or staff data; admin screens use the domain hooks.
 */
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { useCategories, useProducts } from '@/lib/data/products';
import { usePublishedReviews } from '@/lib/data/reviews';
import {
  DEFAULT_HOMEPAGE_SETTINGS, DEFAULT_STORE_CONFIG, useHomepageSettings, useStoreConfig, useTopics,
} from '@/lib/data/settings';
import { useWishlist } from '@/lib/data/wishlist';
import type { Product } from '@/types/store';

export type { Product, ProductCategory, Review, Topic, HeroSlide, HomepageSettings, StoreConfig, CustomerAccount } from '@/types/store';
export { DEFAULT_HERO_SLIDES } from '@/lib/data/settings';

export function CatalogProvider({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

export function useCatalog() {
  const products = useProducts();
  const categories = useCategories();
  const homepage = useHomepageSettings();
  const storeConfig = useStoreConfig();
  const topics = useTopics();
  const reviews = usePublishedReviews();
  const { wishlist, toggleWishlist, isInWishlist } = useWishlist();

  const productList: Product[] = products.data ?? [];

  return {
    products: productList,
    categories: categories.data ?? [],
    homepageSettings: homepage.data ?? DEFAULT_HOMEPAGE_SETTINGS,
    storeConfig: storeConfig.data ?? DEFAULT_STORE_CONFIG,
    topics: topics.data ?? [],
    reviews: reviews.data ?? [],
    wishlist,
    toggleWishlist,
    isInWishlist,
    getProductBySlug: (slug: string) => productList.find(p => p.slug === slug),
    /** Surfaces catalog load failures so pages can show an error instead of an empty shop. */
    productsLoading: products.isLoading,
    productsError: (products.error as Error | null) ?? null,
    refetchProducts: () => products.refetch(),
  };
}
