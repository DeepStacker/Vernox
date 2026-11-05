import type { Product } from '@/lib/catalog';

export type ProductFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'customizable' | 'sample';

export const LOW_STOCK_THRESHOLD = 5;

export const PRODUCT_FILTERS: Array<{ id: ProductFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'in_stock', label: 'In stock' },
  { id: 'low_stock', label: `Low stock (${LOW_STOCK_THRESHOLD} or fewer)` },
  { id: 'out_of_stock', label: 'Out of stock' },
  { id: 'customizable', label: 'Customisable' },
  { id: 'sample', label: 'Sample products' },
];

/** Products with inventory tracking off are never "out of stock": they are always orderable. */
const tracked = (p: Product) => p.trackInventory !== false;

export function matchesProductFilter(p: Product, filter: ProductFilter): boolean {
  switch (filter) {
    case 'in_stock': return !tracked(p) || p.stock > 0;
    case 'low_stock': return tracked(p) && p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD;
    case 'out_of_stock': return tracked(p) && p.stock <= 0;
    case 'customizable': return Boolean(p.customizable);
    case 'sample': return Boolean(p.isSample);
    default: return true;
  }
}

export function matchesProductSearch(p: Product, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.slug, p.category, p.alloySpec ?? '', p.hsnCode ?? ''].some(v => v.toLowerCase().includes(q));
}
