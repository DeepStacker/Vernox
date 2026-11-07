/**
 * The public storefront data in one document: products, categories, topics, public settings and
 * published reviews. Served by GET /api/catalog and cached at the CDN, so shoppers' browsers never
 * read these collections from Firestore themselves (see ROADMAP "Performance and scale plan").
 *
 * Only public fields leave the server: reviews are reduced to what the storefront shows (no userId,
 * orderId or private upload paths) and `adminEmail` is dropped from the store settings.
 */
import type { DocStore } from './store';

export const CATALOG_SCHEMA_VERSION = 1;
const MAX_PRODUCTS = 2000;
const MAX_REVIEWS = 500;

/** Fields of a published review that the storefront displays (src/types/store.ts `Review`). */
const PUBLIC_REVIEW_FIELDS = [
  'productId', 'customerName', 'customerRole', 'location', 'rating', 'comment', 'placedAt', 'verified', 'featured',
  'helpfulCount', 'status', 'conciergeResponse', 'conciergeRespondedAt', 'photos',
] as const;
const PRIVATE_STORE_FIELDS = new Set(['adminEmail']);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type CatalogDoc = { id: string } & Record<string, Json>;

export interface PublicCatalog {
  version: typeof CATALOG_SCHEMA_VERSION;
  generatedAt: number;
  products: CatalogDoc[];
  categories: CatalogDoc[];
  topics: CatalogDoc[];
  /** `settings/store` without private fields; null when the document does not exist. */
  store: Record<string, Json> | null;
  homepage: Record<string, Json> | null;
  /** Published reviews, newest first. */
  reviews: CatalogDoc[];
}

/** Firestore values to JSON: Timestamps become epoch milliseconds, everything else passes through. */
export function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    const v = value as { toMillis?: () => number };
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (value instanceof Date) return value.getTime();
    if (Array.isArray(value)) return value.map(toJson);
    return Object.fromEntries(Object.entries(value).filter(([, x]) => x !== undefined).map(([k, x]) => [k, toJson(x)]));
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value as Json;
}

const asRecord = (data: Record<string, unknown>) => toJson(data) as Record<string, Json>;

export async function buildPublicCatalog(store: DocStore, now = Date.now()): Promise<PublicCatalog> {
  const [products, categories, topics, storeDoc, homepage, reviews] = await Promise.all([
    store.query('products', { limit: MAX_PRODUCTS }),
    store.query('categories', { limit: 200 }),
    store.query('topics', { limit: 200 }),
    store.get('settings/store'),
    store.get('settings/homepage'),
    store.query('reviews', { where: [{ field: 'status', op: '==', value: 'published' }], limit: MAX_REVIEWS }),
  ]);
  const withId = ({ id, data }: { id: string; data: Record<string, unknown> }): CatalogDoc => ({ ...asRecord(data), id });
  const publicReview = ({ id, data }: { id: string; data: Record<string, unknown> }): CatalogDoc => ({
    ...asRecord(Object.fromEntries(PUBLIC_REVIEW_FIELDS.filter(k => data[k] !== undefined).map(k => [k, data[k]]))),
    id,
  });
  const placedAt = (r: CatalogDoc) => (typeof r.placedAt === 'number' ? r.placedAt : 0);
  return {
    version: CATALOG_SCHEMA_VERSION,
    generatedAt: now,
    products: products.map(withId),
    categories: categories.map(withId),
    topics: topics.map(withId),
    store: storeDoc ? asRecord(Object.fromEntries(Object.entries(storeDoc).filter(([k]) => !PRIVATE_STORE_FIELDS.has(k)))) : null,
    homepage: homepage ? asRecord(homepage) : null,
    reviews: reviews.map(publicReview).sort((a, b) => placedAt(b) - placedAt(a)),
  };
}
