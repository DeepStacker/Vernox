/**
 * The storefront's public data from GET /api/catalog (api/catalog.ts), one CDN-cached JSON document
 * instead of six Firestore reads per visitor. Admin screens use the live Firestore hooks instead
 * (products.ts, settings.ts, reviews.ts) so staff see their own saves at once; shoppers see catalogue
 * edits within the CDN's 60-second window.
 *
 * No Firebase import here: the storefront's first paint must not wait for the Firestore SDK.
 */
import { useQuery } from '@tanstack/react-query';
import type { CategoryDoc, HomepageSettings, Product, Review, StoreConfig, Topic } from '@/types/store';
import { toCategory, toHomepageSettings, toProduct, toReview, toStoreConfig, toTopic } from './catalogMappers';

export const PUBLIC_CATALOG_KEY = ['public-catalog'] as const;

export interface PublicCatalogData {
  products: Product[];
  categories: CategoryDoc[];
  topics: Topic[];
  storeConfig: StoreConfig;
  homepage: HomepageSettings;
  reviews: Review[];
  generatedAt: number;
}

type RawDoc = { id: string } & Record<string, unknown>;
interface RawCatalog {
  version: number;
  generatedAt: number;
  products: RawDoc[];
  categories: RawDoc[];
  topics: RawDoc[];
  store: Record<string, unknown> | null;
  homepage: Record<string, unknown> | null;
  reviews: RawDoc[];
}

const list = (v: unknown): RawDoc[] => (Array.isArray(v) ? v.filter((d): d is RawDoc => typeof d?.id === 'string') : []);

export function mapPublicCatalog(raw: RawCatalog): PublicCatalogData {
  return {
    products: list(raw.products).map(({ id, ...d }) => toProduct(id, d)),
    categories: list(raw.categories).map(({ id, ...d }) => toCategory(id, d)),
    topics: list(raw.topics).map(({ id, ...d }) => toTopic(id, d)),
    storeConfig: toStoreConfig(raw.store),
    homepage: toHomepageSettings(raw.homepage),
    reviews: list(raw.reviews).map(({ id, ...d }) => toReview(id, d)),
    generatedAt: Number(raw.generatedAt) || 0,
  };
}

export async function fetchPublicCatalog(): Promise<PublicCatalogData> {
  // Plain GET with no extra headers so it matches the <link rel="preload"> in index.html.
  const res = await fetch('/api/catalog');
  if (!res.ok) throw new Error(`The catalogue could not be loaded (${res.status}).`);
  return mapPublicCatalog((await res.json()) as RawCatalog);
}

export function usePublicCatalog() {
  return useQuery({ queryKey: PUBLIC_CATALOG_KEY, queryFn: fetchPublicCatalog, staleTime: 60_000 });
}
