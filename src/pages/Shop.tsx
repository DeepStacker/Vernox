import { useParams, Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { ProductCard } from '@/components/shop/ProductCard';
import { RecentlyViewed } from '@/components/shop/RecentlyViewed';
import { ProductCompareModal } from '@/components/shop/ProductCompareModal';
import { useCatalog } from '@/lib/catalogContext';
import { ProductCategory } from '@/lib/catalog';
import { cn } from '@/lib/utils';
import { ChevronDown, Check, Search, SlidersHorizontal, X, Layers } from 'lucide-react';
import { toast } from 'sonner';

export default function Shop() {
  const { products, categories, storeConfig } = useCatalog();
  const { category } = useParams<{ category?: string }>();
  const currencySymbol = (storeConfig?.currency && storeConfig.currency !== '$') ? storeConfig.currency : '₹';
  
  const maxCatalogPrice = useMemo(() => {
    const highest = Math.max(...products.map(p => p.price), 350);
    return Math.ceil(highest / 50) * 50;
  }, [products]);

  // Filtering, Sorting & View States
  const [sort, setSort] = useState<'featured' | 'price-asc' | 'price-desc' | 'bestsellers' | 'new'>('featured');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [maxPrice, setMaxPrice] = useState(maxCatalogPrice);
  const [selectedFinishes, setSelectedFinishes] = useState<string[]>([]);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Comparison State
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  const handleToggleCompare = (product: any) => {
    setCompareIds(prev => {
      if (prev.includes(product.id)) {
        toast.info(`Removed ${product.name} from comparison.`);
        return prev.filter(id => id !== product.id);
      }
      if (prev.length >= 3) {
        toast.info('You can compare up to 3 masterworks simultaneously.');
        return prev;
      }
      toast.success(`Added ${product.name} to comparison tray.`);
      return [...prev, product.id];
    });
  };

  const comparedProducts = useMemo(() => {
    return compareIds.map(id => products.find(p => p.id === id)).filter(Boolean) as any[];
  }, [compareIds, products]);

  const activeCategory = categories.find(c => c.id === (category as ProductCategory));
  
  // Available finishes for filtering
  const availableFinishes = [
    { id: 'gold', label: 'Warm Gold', swatch: 'linear-gradient(135deg, #ECC880, #B48834)' },
    { id: 'brass', label: 'Antique Brass', swatch: 'linear-gradient(135deg, #C5A880, #8A6E46)' },
    { id: 'steel', label: 'Blackened Steel', swatch: 'linear-gradient(135deg, #4A4A4F, #222226)' },
    { id: 'copper', label: 'Aged Copper', swatch: 'linear-gradient(135deg, #D48464, #8F4932)' },
    { id: 'stainless', label: 'Stainless Plate', swatch: 'linear-gradient(135deg, #E2E4E8, #A0A5AE)' },
    { id: 'corten', label: 'Weathered Corten', swatch: 'linear-gradient(135deg, #B55229, #6B2912)' },
  ];

  const handleFinishToggle = (f: string) => {
    setSelectedFinishes(prev => 
      prev.includes(f) ? prev.filter(item => item !== f) : [...prev, f]
    );
  };

  const clearFilters = () => {
    setSearch('');
    setMaxPrice(maxCatalogPrice);
    setSelectedFinishes([]);
  };

  const activeFiltersCount = (search.trim() ? 1 : 0) + 
    (maxPrice < maxCatalogPrice ? 1 : 0) + 
    selectedFinishes.length;

  // Filtered & sorted products list
  const filteredList = useMemo(() => {
    let l = category ? products.filter(p => p.category === category) : products;
    
    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      l = l.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.tagline.toLowerCase().includes(q) || 
        p.description.toLowerCase().includes(q) ||
        (p.alloySpec && p.alloySpec.toLowerCase().includes(q))
      );
    }

    // Price filter
    l = l.filter(p => p.price <= maxPrice);

    // Finishes filter
    if (selectedFinishes.length > 0) {
      l = l.filter(p => p.finishes.some(f => selectedFinishes.includes(f)));
    }

    // Sort options
    const sorted = [...l];
    if (sort === 'price-asc') sorted.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') sorted.sort((a, b) => b.price - a.price);
    else if (sort === 'bestsellers') sorted.sort((a, b) => (b.bestseller ? 1 : 0) - (a.bestseller ? 1 : 0));
    else if (sort === 'new') sorted.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    else if (sort === 'featured') sorted.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

    return sorted;
  }, [category, search, maxPrice, selectedFinishes, sort, products]);

  const getSortLabel = (s: typeof sort) => {
    switch (s) {
      case 'featured': return 'Featured Creations';
      case 'price-asc': return 'Price · Low to High';
      case 'price-desc': return 'Price · High to Low';
      case 'bestsellers': return 'Curator Bestsellers';
      case 'new': return 'New Arrivals';
      default: return 'Featured Creations';
    }
  };

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: products.length };
    products.forEach(p => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, [products]);

  return (
    <div className="min-h-screen flex flex-col bg-cream overflow-x-clip w-full max-w-full relative">
      <SiteHeader />
      
      {/* Editorial Hero Header */}
      <section className="border-b border-[#EBE4D6] bg-gradient-to-b from-[#F5EFE4] to-cream pt-12 pb-10 sm:pt-20 sm:pb-16 w-full max-w-full overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full min-w-0">
          <div className="max-w-3xl">
            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.28em] font-sans text-burgundy font-semibold mb-3">
              {activeCategory ? 'Curated Collection' : 'Permanent Atelier Catalog'}
            </p>
            
            <h1 className="font-editorial text-3xl sm:text-5xl md:text-6xl text-dark-brown tracking-tight leading-[1.05] font-normal mb-3 sm:mb-4 break-words">
              {activeCategory ? activeCategory.name.toUpperCase() : 'WORKS OF ART & SCULPTURES'}
            </h1>
            
            <p className="text-xs sm:text-sm md:text-[15px] text-dark-brown/75 font-sans leading-relaxed max-w-2xl">
              {activeCategory
                ? activeCategory.description
                : 'A curated dialogue of original canvas compositions, heavy bronze castings, tactile mineral reliefs, and precision-cut metal wall sculptures for refined modern interiors.'}
            </p>
          </div>

          {/* Clean Category Tabs / Horizontal Filter Navigation */}
          <div className="mt-8 sm:mt-12 pt-5 sm:pt-6 border-t border-[#EBE4D6] flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 w-full max-w-full overscroll-x-contain touch-pan-x">
            <Link
              to="/shop"
              className={cn(
                'px-3.5 sm:px-4 py-2 rounded-[2px] text-[10px] sm:text-[11px] uppercase tracking-[0.18em] sm:tracking-[0.2em] font-sans transition-all duration-200 shrink-0 whitespace-nowrap cursor-pointer flex items-center gap-1.5 sm:gap-2',
                !category
                  ? 'bg-burgundy text-cream font-semibold shadow-xs'
                  : 'bg-white/80 hover:bg-white text-dark-brown/80 hover:text-dark-brown border border-[#EBE4D6]'
              )}
            >
              <span>All Works</span>
              <span className="text-[10px] font-mono opacity-60 ml-0.5 sm:ml-1">
                ({categoryCounts.all || products.length})
              </span>
            </Link>

            {categories.map(c => {
              const isActive = category === c.id;
              const count = categoryCounts[c.id] || 0;
              return (
                <Link
                  key={c.id}
                  to={`/shop/${c.id}`}
                  className={cn(
                    'px-3.5 sm:px-4 py-2 rounded-[2px] text-[10px] sm:text-[11px] uppercase tracking-[0.18em] sm:tracking-[0.2em] font-sans transition-all duration-200 shrink-0 whitespace-nowrap cursor-pointer flex items-center gap-1.5 sm:gap-2',
                    isActive
                      ? 'bg-burgundy text-cream font-semibold shadow-xs'
                      : 'bg-white/80 hover:bg-white text-dark-brown/80 hover:text-dark-brown border border-[#EBE4D6]'
                  )}
                >
                  <span>{c.name}</span>
                  <span className="text-[10px] font-mono opacity-60 ml-0.5 sm:ml-1">
                    ({count})
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Main Catalog Section */}
      <section className="max-w-7xl mx-auto w-full max-w-full px-4 sm:px-6 py-6 sm:py-8 flex-1 overflow-x-clip min-w-0">
        
        {/* Top Control Bar: Search, Filters Toggle, Items Count, and Sort Dropdown */}
        <div className="bg-white border border-[#EBE4D6] rounded-[2px] p-3 sm:p-4 mb-6 sm:mb-8 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 shadow-xs w-full max-w-full min-w-0">
          
          {/* Top row / Left: Search & Filter Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 w-full md:flex-1 min-w-0">
            {/* Search Input */}
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                placeholder="Search artwork, medium..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-[#EBE4D6] rounded-[2px] pl-8 sm:pl-9 pr-7 sm:pr-8 py-2 text-xs text-dark-brown placeholder:text-dark-brown/40 outline-none focus:border-burgundy focus:bg-white transition-colors truncate min-w-0"
              />
              <Search className="w-3.5 h-3.5 text-dark-brown/50 absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-brown/40 hover:text-dark-brown p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setFilterPanelOpen(prev => !prev)}
              className={cn(
                'inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 rounded-[2px] text-xs uppercase tracking-[0.14em] font-sans font-medium transition-colors border cursor-pointer shrink-0 whitespace-nowrap',
                filterPanelOpen || activeFiltersCount > 0
                  ? 'border-burgundy bg-burgundy/5 text-burgundy'
                  : 'border-[#EBE4D6] bg-[#FAF8F5] text-dark-brown hover:bg-white'
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-gold shrink-0" />
              <span>Refine</span>
              {activeFiltersCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-burgundy text-white text-[9px] font-mono flex items-center justify-center font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Clear All Link if filters active */}
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[10px] uppercase tracking-[0.16em] font-sans font-semibold text-burgundy hover:text-burgundy-hover underline cursor-pointer shrink-0 whitespace-nowrap"
              >
                Reset
              </button>
            )}
          </div>

          {/* Bottom row / Right: Works count & Sort Dropdown */}
          <div className="flex items-center justify-between md:justify-end gap-2 sm:gap-4 w-full md:w-auto pt-2.5 md:pt-0 border-t md:border-t-0 border-[#EBE4D6] min-w-0">
            <span className="text-[11px] sm:text-xs text-dark-brown/60 font-sans shrink-0 whitespace-nowrap">
              Showing <strong className="text-dark-brown font-semibold">{filteredList.length}</strong> works
            </span>

            {/* Sort Dropdown */}
            <div className="relative shrink-0 min-w-0 max-w-[62%] sm:max-w-none">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(prev => !prev)}
                className="bg-[#FAF8F5] hover:bg-white border border-[#EBE4D6] rounded-[2px] px-2.5 sm:px-3.5 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs uppercase tracking-[0.12em] font-sans font-medium text-dark-brown cursor-pointer transition-colors max-w-full min-w-0"
              >
                <span className="text-dark-brown/60 text-[9px] sm:text-[10px] shrink-0">Sort:</span>
                <span className="truncate min-w-0">{getSortLabel(sort)}</span>
                <ChevronDown
                  className={cn(
                    'w-3.5 h-3.5 text-gold transition-transform duration-200 shrink-0',
                    isDropdownOpen && 'rotate-180'
                  )}
                />
              </button>

              {isDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20 cursor-default"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 bg-white border border-[#EBE4D6] rounded-[2px] shadow-lg z-30 w-52 overflow-hidden py-1">
                    {(['featured', 'bestsellers', 'new', 'price-asc', 'price-desc'] as const).map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setSort(option);
                          setIsDropdownOpen(false);
                        }}
                        className={cn(
                          'w-full text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] font-sans transition-colors flex items-center justify-between cursor-pointer',
                          sort === option
                            ? 'bg-burgundy text-white font-semibold'
                            : 'text-dark-brown hover:bg-cream'
                        )}
                      >
                        <span>{getSortLabel(option)}</span>
                        {sort === option && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Refine Panel */}
        {filterPanelOpen && (
          <div className="bg-white border border-[#EBE4D6] rounded-[2px] p-6 mb-8 shadow-xs animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-[#EBE4D6] pb-3 mb-5">
              <h3 className="text-xs uppercase tracking-[0.24em] font-sans font-semibold text-dark-brown flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-gold" />
                <span>Refine by Specification & Price</span>
              </h3>
              <button
                type="button"
                onClick={() => setFilterPanelOpen(false)}
                className="text-xs text-dark-brown/60 hover:text-dark-brown p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Finishes & Materials */}
              <div>
                <label className="text-[10px] uppercase tracking-[0.24em] font-sans font-semibold text-burgundy block mb-3">
                  Material Finish & Patina
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableFinishes.map(f => {
                    const isChecked = selectedFinishes.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleFinishToggle(f.id)}
                        className={cn(
                          'inline-flex items-center gap-2 px-3 py-1.5 rounded-[2px] text-xs font-sans transition-all cursor-pointer border',
                          isChecked
                            ? 'bg-burgundy text-white border-burgundy font-semibold shadow-xs'
                            : 'bg-[#FAF8F5] text-dark-brown border-[#EBE4D6] hover:bg-white'
                        )}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                          style={{ background: f.swatch }}
                        />
                        <span>{f.label}</span>
                        {isChecked && <Check className="w-3 h-3 text-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Price Ceiling */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] uppercase tracking-[0.24em] font-sans font-semibold text-burgundy">
                    Maximum Investment
                  </label>
                  <span className="font-mono text-sm font-semibold text-dark-brown">
                    {currencySymbol}{maxPrice}
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={maxCatalogPrice}
                  step={10}
                  value={maxPrice}
                  onChange={e => setMaxPrice(Number(e.target.value))}
                  className="w-full accent-burgundy cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-dark-brown/50 font-mono mt-1">
                  <span>{currencySymbol}100</span>
                  <span>{currencySymbol}{maxCatalogPrice}</span>
                </div>

                {/* Quick Price Shortcuts */}
                <div className="flex gap-2 mt-3">
                  {[200, 300, maxCatalogPrice].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMaxPrice(val)}
                      className={cn(
                        'px-2.5 py-1 text-[10px] font-sans rounded-[1px] border cursor-pointer transition-colors',
                        maxPrice === val
                          ? 'border-burgundy bg-burgundy/10 text-burgundy font-semibold'
                          : 'border-[#EBE4D6] bg-white text-dark-brown/70 hover:text-dark-brown'
                      )}
                    >
                      {val === maxCatalogPrice ? 'All Prices' : `Under ${currencySymbol}${val}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Product Grid */}
        {filteredList.length === 0 ? (
          <div className="text-center py-20 px-6 bg-white border border-[#EBE4D6] rounded-[2px] max-w-lg mx-auto">
            <Search className="w-8 h-8 text-gold/60 mx-auto mb-3" />
            <h3 className="font-editorial text-2xl text-dark-brown font-normal mb-2">
              No Pieces Match Your Current Selection
            </h3>
            <p className="text-xs text-dark-brown/70 font-sans mb-6 leading-relaxed">
              We couldn't find any artwork matching your active search keywords or filter criteria.
            </p>
            <button 
              type="button"
              onClick={clearFilters}
              className="bg-burgundy hover:bg-burgundy-hover text-cream px-6 py-2.5 rounded-[2px] text-xs uppercase tracking-[0.2em] font-sans font-semibold transition cursor-pointer shadow-xs"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6 lg:gap-8 transition-all duration-300 w-full max-w-full min-w-0">
            {filteredList.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                onToggleCompare={handleToggleCompare}
                isComparing={compareIds.includes(p.id)}
              />
            ))}
          </div>
        )}

        {/* Recently Viewed Architectural Pieces */}
        <RecentlyViewed className="mt-16" />

        {/* Floating Persistent Comparison Bar */}
        {compareIds.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-dark-brown text-cream px-5 py-3 rounded-full shadow-luxe border border-gold/40 flex items-center gap-4 animate-scale-in max-w-[90vw]">
            <span className="text-xs font-sans font-medium flex items-center gap-2 truncate">
              <Layers className="w-4 h-4 text-gold shrink-0" />
              <span>{compareIds.length} piece{compareIds.length > 1 ? 's' : ''} selected</span>
            </span>
            <button
              type="button"
              onClick={() => setCompareModalOpen(true)}
              className="bg-gold hover:bg-gold/90 text-dark-brown text-xs uppercase tracking-wider font-semibold px-4 py-1.5 rounded-full cursor-pointer transition-colors shrink-0"
            >
              Compare Specs
            </button>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="text-cream/60 hover:text-cream cursor-pointer p-1 rounded transition-colors"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Product Comparison Modal */}
        <ProductCompareModal
          open={compareModalOpen}
          onOpenChange={setCompareModalOpen}
          productsToCompare={comparedProducts}
          onRemoveProduct={(id) => setCompareIds(prev => prev.filter(item => item !== id))}
          onClearAll={() => setCompareIds([])}
        />

        {/* Bottom Editorial Atelier Callout */}
        <div className="mt-20 pt-12 border-t border-[#EBE4D6] w-full max-w-full overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            <div className="border-t md:border-t-0 md:border-l border-[#EBE4D6] pt-4 md:pt-0 md:pl-5 space-y-1.5">
              <span className="font-mono text-xs text-gold font-medium block">01</span>
              <h4 className="text-xs uppercase tracking-[0.2em] font-sans font-semibold text-dark-brown">
                Solid Metallurgical Precision
              </h4>
              <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
                Every work is crafted in 3.0mm Belgian alloy plate or cast noble bronze, hand-patinated in our Antwerp workshop.
              </p>
            </div>

            <div className="border-t md:border-t-0 md:border-l border-[#EBE4D6] pt-4 md:pt-0 md:pl-5 space-y-1.5">
              <span className="font-mono text-xs text-gold font-medium block">02</span>
              <h4 className="text-xs uppercase tracking-[0.2em] font-sans font-semibold text-dark-brown">
                Signed & Authenticated
              </h4>
              <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
                Numbered hallmark seal, signed certificate of authenticity, and museum-grade concealed hanging standoffs included.
              </p>
            </div>

            <div className="border-t md:border-t-0 md:border-l border-[#EBE4D6] pt-4 md:pt-0 md:pl-5 space-y-1.5">
              <span className="font-mono text-xs text-gold font-medium block">03</span>
              <h4 className="text-xs uppercase tracking-[0.2em] font-sans font-semibold text-dark-brown">
                Architect & Trade Inquiries
              </h4>
              <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
                Custom scale commissions, 3D CAD models, DXF vector files, and trade partner terms available upon request.
              </p>
            </div>
          </div>
        </div>

      </section>
      
      <SiteFooter />
    </div>
  );
}