import { useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { StoreLayout } from '@/components/shop/StoreLayout';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { PageHeader } from '@/components/shop/PageHeader';
import { EmptyState, ErrorState, ProductGridSkeleton } from '@/components/shop/StateViews';
import { FilterPanel } from '@/components/shop/FilterPanel';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { finishName, getCategory, ROOMS, THEMES, type ProductCategory } from '@/lib/catalog';
import { useCatalog } from '@/lib/catalogContext';
import { itemListJsonLd, useSeo } from '@/lib/seo';
import {
  applyFilters, hasActiveFilters, parseFilters, PRICE_BANDS, reviewStatsByProduct, SIZE_BANDS, SORT_OPTIONS,
  sortProducts, toSearchParams, type ListingFilters, type SortKey,
} from '@/lib/storefront/listing';

const PAGE_SIZE = 24;

interface Chip { key: string; label: string; clear: (f: ListingFilters) => ListingFilters }

function activeChips(f: ListingFilters): Chip[] {
  const chips: Chip[] = [];
  if (f.q) chips.push({ key: 'q', label: `"${f.q}"`, clear: x => ({ ...x, q: '' }) });
  if (f.room) chips.push({ key: 'room', label: ROOMS.find(r => r.id === f.room)?.name ?? f.room, clear: x => ({ ...x, room: '' }) });
  if (f.theme) chips.push({ key: 'theme', label: THEMES.find(t => t.id === f.theme)?.name ?? f.theme, clear: x => ({ ...x, theme: '' }) });
  if (f.category) chips.push({ key: 'category', label: getCategory(f.category as ProductCategory)?.name ?? f.category, clear: x => ({ ...x, category: '' }) });
  for (const id of f.finishes) chips.push({ key: `finish-${id}`, label: finishName(id), clear: x => ({ ...x, finishes: x.finishes.filter(v => v !== id) }) });
  if (f.size) chips.push({ key: 'size', label: SIZE_BANDS.find(b => b.id === f.size)?.label ?? f.size, clear: x => ({ ...x, size: '' }) });
  if (f.price) chips.push({ key: 'price', label: PRICE_BANDS.find(b => b.id === f.price)?.label ?? f.price, clear: x => ({ ...x, price: '' }) });
  if (f.ready) chips.push({ key: 'ready', label: 'In stock', clear: x => ({ ...x, ready: false }) });
  return chips;
}

export default function Shop() {
  const { category: categoryFromPath } = useParams<{ category: string }>();
  const [params, setParams] = useSearchParams();
  const { products, reviews, productsLoading, productsError, refetchProducts } = useCatalog();
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filters = useMemo(() => parseFilters(params), [params]);
  const stats = useMemo(() => reviewStatsByProduct(reviews), [reviews]);
  const results = useMemo(() => sortProducts(applyFilters(products, filters), filters.sort, stats), [products, filters, stats]);
  const chips = activeChips(filters);

  const heading = filters.category ? getCategory(filters.category as ProductCategory)
    : filters.room ? { name: `Wall art for the ${ROOMS.find(r => r.id === filters.room)?.name ?? 'room'}`, description: ROOMS.find(r => r.id === filters.room)?.blurb }
    : filters.theme ? { name: `${THEMES.find(t => t.id === filters.theme)?.name ?? ''} wall art`, description: undefined }
    : undefined;

  useSeo({
    title: heading?.name ?? 'Shop Metal Wall Art',
    description: `Browse laser-cut metal wall art made to order in India. Filter by room, theme, finish, size and price. ${heading?.description ?? ''}`.trim(),
    canonicalPath: '/shop',
    jsonLd: itemListJsonLd(results.slice(0, PAGE_SIZE)),
    noindex: !!filters.q,
  });

  // Legacy /shop/:category links become the query form so every filter lives in the URL.
  if (categoryFromPath) return <Navigate to={`/shop?category=${encodeURIComponent(categoryFromPath)}`} replace />;

  const update = (next: ListingFilters) => {
    setVisible(PAGE_SIZE);
    setParams(toSearchParams(next), { replace: true });
  };

  const clearAll = () => update({ ...filters, q: '', room: '', theme: '', category: '', finishes: [], size: '', price: '', ready: false });

  return (
    <StoreLayout>
      <div className="container py-6 sm:py-10">
        <PageHeader title={heading?.name ?? 'All designs'} crumbs={[{ label: 'Shop' }]} />

        <div className="mb-5 flex items-center gap-2">
          <ul className="no-scrollbar -mx-4 flex flex-1 gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Rooms">
            {ROOMS.map(r => (
              <li key={r.id} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={filters.room === r.id}
                  onClick={() => update({ ...filters, room: filters.room === r.id ? '' : r.id })}
                  className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${filters.room === r.id ? 'border-burgundy bg-burgundy text-cream' : 'border-border bg-card hover:border-burgundy'}`}
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setSheetOpen(true)} className="btn-secondary shrink-0">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters{chips.length > 0 ? ` (${chips.length})` : ''}
          </button>
        </div>

        <section aria-label="Results">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
              {productsLoading ? 'Loading...' : `${results.length} ${results.length === 1 ? 'design' : 'designs'}`}
            </p>
            {chips.map(c => (
              <button key={c.key} type="button" onClick={() => update(c.clear(filters))} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm hover:border-burgundy" aria-label={`Remove filter ${c.label}`}>
                {c.label} <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-sm">
              <span className="sr-only">Sort by</span>
              <select value={filters.sort} onChange={e => update({ ...filters, sort: e.target.value as SortKey })} className="field w-auto py-1.5" aria-label="Sort by">
                {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          </div>

          {productsError && (
            <ErrorState>
              Designs could not be loaded. <button type="button" onClick={() => refetchProducts()} className="font-semibold underline">Try again</button>
            </ErrorState>
          )}
          {productsLoading && <ProductGridSkeleton />}
          {!productsLoading && !productsError && results.length === 0 && (
            <EmptyState
              title="No designs match"
              hint={hasActiveFilters(filters) ? 'Try removing a filter.' : 'Check back soon.'}
              action={hasActiveFilters(filters) ? undefined : { label: 'Design your own', to: '/studio' }}
            />
          )}
          {!productsLoading && !productsError && results.length === 0 && hasActiveFilters(filters) && (
            <div className="mt-4 text-center"><button type="button" onClick={clearAll} className="btn-primary">Clear filters</button></div>
          )}

          {results.length > 0 && (
            <>
              {/* Keyed by the result set so a filter change re-runs the staggered reveal. */}
              <ProductGrid key={results.map(r => r.id).join('|')} products={results.slice(0, visible)} priorityCount={4} />
              {visible < results.length && (
                <div className="mt-8 text-center">
                  <button type="button" onClick={() => setVisible(v => v + PAGE_SIZE)} className="btn-secondary">Load more</button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex w-[88vw] max-w-sm flex-col bg-background p-0">
          <SheetHeader className="border-b border-border p-4"><SheetTitle>Filters</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto p-4"><FilterPanel filters={filters} onChange={update} idPrefix="f" /></div>
          <SheetFooter className="border-t border-border p-4">
            <button type="button" onClick={() => setSheetOpen(false)} className="btn-primary w-full">Show {results.length} designs</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </StoreLayout>
  );
}
