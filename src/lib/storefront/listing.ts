/**
 * Shop listing state lives in the URL (?room=&theme=&category=&finish=&size=&price=&ready=&sort=&q=)
 * so filtered views can be shared, bookmarked and indexed. This module is the single place that
 * parses it, applies it to a product list and sorts the result.
 */
import { discountPercent, fromPrice, type Product } from '@/lib/catalog';
import type { Review } from '@/types/store';

export type SortKey = 'popular' | 'newest' | 'price-asc' | 'price-desc' | 'discount';

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'popular', label: 'Popular' },
  { id: 'newest', label: 'Newest' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'discount', label: 'Biggest discount' },
];

export const SIZE_BANDS = [
  { id: 'small', label: 'Small (up to 50 cm)', min: 0, max: 50 },
  { id: 'medium', label: 'Medium (50 to 80 cm)', min: 50, max: 80 },
  { id: 'large', label: 'Large (80 cm and above)', min: 80, max: Infinity },
] as const;

export const PRICE_BANDS = [
  { id: '0-3000', label: 'Under ₹3,000', min: 0, max: 3000 },
  { id: '3000-5000', label: '₹3,000 to ₹5,000', min: 3000, max: 5000 },
  { id: '5000-10000', label: '₹5,000 to ₹10,000', min: 5000, max: 10000 },
  { id: '10000-', label: '₹10,000 and above', min: 10000, max: Infinity },
] as const;

export interface ListingFilters {
  q: string;
  room: string;
  theme: string;
  category: string;
  finishes: string[];
  size: string;
  price: string;
  ready: boolean;
  sort: SortKey;
}

const isSort = (v: string | null): v is SortKey => SORT_OPTIONS.some(o => o.id === v);

export function parseFilters(params: URLSearchParams, categoryFromPath?: string): ListingFilters {
  const sort = params.get('sort');
  return {
    q: params.get('q')?.trim() ?? '',
    room: params.get('room') ?? '',
    theme: params.get('theme') ?? '',
    category: params.get('category') ?? categoryFromPath ?? '',
    finishes: (params.get('finish') ?? '').split(',').filter(Boolean),
    size: params.get('size') ?? '',
    price: params.get('price') ?? '',
    ready: params.get('ready') === '1',
    sort: isSort(sort) ? sort : 'popular',
  };
}

/** Serialises filters back to a query string; defaults are omitted to keep URLs clean. */
export function toSearchParams(f: ListingFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.room) p.set('room', f.room);
  if (f.theme) p.set('theme', f.theme);
  if (f.category) p.set('category', f.category);
  if (f.finishes.length) p.set('finish', f.finishes.join(','));
  if (f.size) p.set('size', f.size);
  if (f.price) p.set('price', f.price);
  if (f.ready) p.set('ready', '1');
  if (f.sort !== 'popular') p.set('sort', f.sort);
  return p;
}

const inStock = (p: Product) => p.trackInventory === false || p.stock > 0;
const maxSideCm = (w: number, h: number) => Math.max(w, h) / 10;

export function applyFilters(products: Product[], f: ListingFilters): Product[] {
  const q = f.q.toLowerCase();
  const sizeBand = SIZE_BANDS.find(b => b.id === f.size);
  const priceBand = PRICE_BANDS.find(b => b.id === f.price);
  return products.filter(p => {
    if (q && !`${p.name} ${p.tagline} ${p.category} ${(p.themes ?? []).join(' ')} ${(p.rooms ?? []).join(' ')}`.toLowerCase().includes(q)) return false;
    if (f.room && !(p.rooms as string[] | undefined)?.includes(f.room)) return false;
    if (f.theme && !(p.themes as string[] | undefined)?.includes(f.theme)) return false;
    if (f.category && p.category !== f.category) return false;
    if (f.finishes.length && !f.finishes.some(id => (p.finishes as string[]).includes(id))) return false;
    if (sizeBand && !p.sizes.some(s => {
      const side = maxSideCm(s.widthMm, s.heightMm);
      return side >= sizeBand.min && side < sizeBand.max;
    })) return false;
    if (priceBand) {
      const from = fromPrice(p);
      if (from < priceBand.min || from >= priceBand.max) return false;
    }
    if (f.ready && !inStock(p)) return false;
    return true;
  });
}

export interface ReviewStats {
  count: number;
  average: number;
}

export function reviewStatsByProduct(reviews: Review[]): Map<string, ReviewStats> {
  const sums = new Map<string, { count: number; total: number }>();
  for (const r of reviews) {
    if (!r.rating) continue;
    const s = sums.get(r.productId) ?? { count: 0, total: 0 };
    s.count += 1;
    s.total += r.rating;
    sums.set(r.productId, s);
  }
  return new Map([...sums].map(([id, s]) => [id, { count: s.count, average: s.total / s.count }]));
}

const popularityScore = (p: Product, stats?: ReviewStats) =>
  (p.bestseller ? 100 : 0) + (p.featured ? 40 : 0) + (stats ? stats.count * stats.average : 0);

export function sortProducts(products: Product[], sort: SortKey, stats: Map<string, ReviewStats>): Product[] {
  const list = [...products];
  switch (sort) {
    case 'newest': return list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    case 'price-asc': return list.sort((a, b) => fromPrice(a) - fromPrice(b));
    case 'price-desc': return list.sort((a, b) => fromPrice(b) - fromPrice(a));
    case 'discount': return list.sort((a, b) => discountPercent(b) - discountPercent(a));
    default: return list.sort((a, b) => popularityScore(b, stats.get(b.id)) - popularityScore(a, stats.get(a.id)));
  }
}

export const hasActiveFilters = (f: ListingFilters) =>
  !!(f.q || f.room || f.theme || f.category || f.finishes.length || f.size || f.price || f.ready);
