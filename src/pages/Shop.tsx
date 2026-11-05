import { useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { StoreLayout } from '@/components/shop/StoreLayout';
import { ProductGrid } from '@/components/shop/ProductGrid';
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

  return (
    <StoreLayout>
      <div className="container py-6 sm:py-10">
        <header className="mb-5">
          <h1 className="font-display text-3xl sm:text-4xl">{heading?.name ?? 'All designs'}</h1>
          {heading?.description && <p className="mt-1 text-muted-foreground">{heading.description}</p>}
        </header>

        <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
          <aside className="hidden lg:block" aria-label="Filters">
            <FilterPanel filters={filters} onChange={update} idPrefix="d" />
          </aside>

          <section aria-label="Results">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setSheetOpen(true)} className="btn-secondary py-2 lg:hidden">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters{chips.length > 0 ? ` (${chips.length})` : ''}
              </button>
              <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                {productsLoading ? 'Loading designs...' : `${results.length} ${results.length === 1 ? 'design' : 'designs'}`}
              </p>
              <label className="ml-auto flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sort by</span>
                <select value={filters.sort} onChange={e => update({ ...filters, sort: e.target.value as SortKey })} className="field w-auto py-1.5">
                  {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
            </div>

            {chips.length > 0 && (
              <ul className="mb-5 flex flex-wrap items-center gap-2" aria-label="Active filters">
                {chips.map(c => (
                  <li key={c.key}>
                    <button type="button" onClick={() => update(c.clear(filters))} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm hover:border-burgundy" aria-label={`Remove filter ${c.label}`}>
                      {c.label} <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" onClick={() => update({ ...filters, q: '', room: '', theme: '', category: '', finishes: [], size: '', price: '', ready: false })} className="min-h-9 px-2 text-sm font-semibold text-burgundy hover:underline">
                    Clear all
                  </button>
                </li>
              </ul>
            )}

            {productsError && (
              <div role="alert" className="rounded-lg border border-destructive/40 p-6 text-center">
                <p className="mb-3">Designs could not be loaded.</p>
                <button type="button" onClick={() => refetchProducts()} className="btn-primary">Try again</button>
              </div>
            )}

            {productsLoading && <div className="h-96 animate-pulse rounded-lg bg-secondary" aria-hidden="true" />}

            {!productsLoading && !productsError && results.length === 0 && (
              <div className="rounded-lg border border-border bg-card p-8 text-center">
                <p className="font-display text-2xl">No designs match these filters</p>
                <p className="mt-1 text-muted-foreground">
                  {hasActiveFilters(filters) ? 'Try removing a filter, or ' : 'Check back soon, or '}design your own in the Studio.
                </p>
                {hasActiveFilters(filters) && (
                  <button type="button" onClick={() => update({ ...filters, q: '', room: '', theme: '', category: '', finishes: [], size: '', price: '', ready: false })} className="btn-primary mt-4">
                    Clear all filters
                  </button>
                )}
              </div>
            )}

            {results.length > 0 && (
              <>
                <ProductGrid products={results.slice(0, visible)} priorityCount={4} className="grid-cols-2 xl:grid-cols-3" />
                {visible < results.length && (
                  <div className="mt-8 text-center">
                    <button type="button" onClick={() => setVisible(v => v + PAGE_SIZE)} className="btn-secondary">
                      Load more ({results.length - visible} left)
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="flex w-[88vw] max-w-sm flex-col bg-background p-0">
          <SheetHeader className="border-b border-border p-4"><SheetTitle>Filters</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto p-4"><FilterPanel filters={filters} onChange={update} idPrefix="m" /></div>
          <SheetFooter className="border-t border-border p-4">
            <button type="button" onClick={() => setSheetOpen(false)} className="btn-primary w-full">Show {results.length} designs</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </StoreLayout>
  );
}
