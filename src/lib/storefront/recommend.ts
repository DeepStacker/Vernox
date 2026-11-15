/**
 * Product recommendations from the public catalogue alone (no tracking backend): a product scores for what it shares
 * with the seeds (the product being viewed, or what is in the cart) and for being a good pick on its own. Pure and
 * deterministic, so every shopper sees the same suggestions for the same seeds and tests can pin them.
 */
import type { Product } from '@/lib/catalog';

export interface RecommendOptions {
  limit?: number;
  /** Ids never to suggest (already in the cart, the product being viewed). */
  exclude?: readonly string[];
  /** Average star rating per product id, when reviews are loaded. */
  ratings?: ReadonlyMap<string, number>;
}

const isBuyable = (p: Product) => p.trackInventory === false || p.stock > 0;
const overlap = <T,>(a: readonly T[] | undefined, b: readonly T[] | undefined) => (a && b ? a.filter(x => b.includes(x)).length : 0);

/** Higher is a better suggestion for someone interested in `seeds`. */
export function relevance(candidate: Product, seeds: readonly Product[], ratings?: ReadonlyMap<string, number>): number {
  let score = 0;
  for (const seed of seeds) {
    if (candidate.category === seed.category) score += 3;
    score += 2 * overlap(candidate.themes, seed.themes);
    score += 2 * overlap(candidate.rooms, seed.rooms);
    score += 0.5 * overlap(candidate.finishes, seed.finishes);
    // A similar budget: full credit within ±30 % of the seed's price, fading to none at double or half.
    const ratio = Math.max(candidate.price, seed.price) / Math.max(1, Math.min(candidate.price, seed.price));
    score += Math.max(0, 1.5 - Math.max(0, ratio - 1.3) * 2);
  }
  if (candidate.bestseller) score += 1.5;
  if (candidate.featured) score += 1;
  score += (ratings?.get(candidate.id) ?? 0) * 0.4;
  return score;
}

/**
 * Best suggestions for the seeds, in-stock only. With no seeds (empty cart, first visit) it falls back to
 * bestsellers, featured and best-rated products.
 */
export function recommendProducts(catalog: readonly Product[], seeds: readonly Product[], options: RecommendOptions = {}): Product[] {
  const { limit = 4, exclude = [], ratings } = options;
  const skip = new Set([...exclude, ...seeds.map(s => s.id)]);
  return catalog
    .filter(p => !skip.has(p.id) && isBuyable(p))
    .map(p => ({ p, score: relevance(p, seeds, ratings) }))
    // Ties keep catalogue order (Array.prototype.sort is stable), which is the merchandiser's order.
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ p }) => p);
}
