import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { finishLabels, Product } from '@/lib/catalog';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { WallTiltPreview } from '@/components/experience/WallTiltPreview';
import { WallPreview } from '@/components/experience/WallPreview';
import { InlineStudio } from '@/components/experience/InlineStudio';
import { ProductCard } from '@/components/shop/ProductCard';
import { RecentlyViewed } from '@/components/shop/RecentlyViewed';
import { useCart } from '@/lib/cartContext';
import { useCatalog } from '@/lib/catalogContext';
import { trackStoreEvent } from '@/lib/storeAnalytics';
import { 
  Check, 
  Compass, 
  ChevronDown, 
  ShoppingBag, 
  ArrowLeft, 
  Ruler, 
  Heart, 
  Eye, 
  Maximize2,
  ShieldCheck,
  Truck,
  Sparkles,
  Share2,
  Camera,
  Box,
  Award,
  Layers,
  Star,
  X,
  ZoomIn,
  RotateCcw,
  CheckCircle2,
  HelpCircle,
  FileCheck2,
  Tag
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { useSeo, productJsonLd } from '@/lib/seo';
type ViewMode = 'photo' | 'lifestyle' | 'preview' | 'wall';

interface FinishDescription {
  story: string;
  sheen: string;
}

const FINISH_DESCRIPTIONS: Record<string, FinishDescription> = {
  gold: { story: 'Hand-burnished 24K gold leaf with warm reflective brilliance', sheen: 'Satin Luster' },
  brass: { story: 'Solid CZ108 brass with deep hand-rubbed patina and wax protection', sheen: 'Brushed Satin' },
  copper: { story: 'Hand-flamed rose copper with nuanced natural fire-gradient tones', sheen: 'Living Patina' },
  steel: { story: 'High-tensile raw steel with rich blackened satin oil seal', sheen: 'Industrial Matte' },
  corten: { story: 'Self-protecting architectural weathering steel with warm umber tone', sheen: 'Natural Texture' },
  stainless: { story: 'Marine-grade 316 stainless alloy with micro-directional brushwork', sheen: 'Precision Bright' },
};

export default function ProductDetail() {
  const { getProductBySlug, products, reviews, wishlist, toggleWishlist, storeConfig } = useCatalog();
  const { slug } = useParams<{ slug: string }>();
  const product = slug ? getProductBySlug(slug) : undefined;
  useSeo(product ? { title: product.name, description: product.tagline || product.description, canonicalPath: `/product/${product.slug}`, image: product.imageUrl, ogType: 'product', jsonLd: productJsonLd(product) } : { title: 'Product', noindex: true });
  
  const isWishlisted = product ? wishlist.includes(product.id) : false;
  const navigate = useNavigate();
  const { add } = useCart();

  // State
  const [finish, setFinish] = useState(product?.finishes[0] ?? 'brass');
  const [sizeIdx, setSizeIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>(() => product?.imageUrl ? 'photo' : 'preview');
  const [studioOpen, setStudioOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [activeAccordion, setActiveAccordion] = useState<string | null>('specs');
  const [showStickyBar, setShowStickyBar] = useState(false);

  const buyBoxRef = useRef<HTMLDivElement>(null);

  // When product changes, reset defaults
  useEffect(() => {
    if (product) {
      setFinish(product.finishes[0] || 'brass');
      setSizeIdx(0);
      setQty(1);
      setViewMode(product.imageUrl ? 'photo' : 'preview');
      window.scrollTo(0, 0);
      trackStoreEvent('view', { path: `/product/${product.slug}` });
    }
  }, [product?.id]);

  // Observer for sticky bottom bar on mobile
  useEffect(() => {
    const handleScroll = () => {
      if (buyBoxRef.current) {
        const rect = buyBoxRef.current.getBoundingClientRect();
        // Show sticky bar once user scrolls past the buy box
        setShowStickyBar(rect.bottom < 0);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Published customer reviews for this product (none yet means an empty state, never placeholders)
  const productReviews = useMemo(
    () => (product ? reviews.filter(r => r.productId === product.id) : []),
    [product, reviews],
  );
  const averageRating = productReviews.length
    ? productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length
    : 0;

  // Related products from the atelier
  const relatedProducts = useMemo(() => {
    if (!product) return [];
    return products
      .filter(p => p.id !== product.id && p.category === product.category)
      .slice(0, 4);
  }, [product, products]);

  // Alternate fallback related products if none in same category
  const finalRelatedProducts = relatedProducts.length > 0 
    ? relatedProducts 
    : products.filter(p => p.id !== product?.id).slice(0, 4);

  // Lifestyle image determination
  const lifestyleImage = useMemo(() => {
    if (!product) return '/images/hero-art-lounge.jpg';
    if (product.lifestyleImage) return product.lifestyleImage;
    if (product.category === 'wall-art') return '/images/hero-art-lounge.jpg';
    if (product.category === 'sculptures') return '/images/hero-penthouse-brass.jpg';
    if (product.category === 'office') return '/images/office-decor.jpg';
    return '/images/statement-piece.jpg';
  }, [product]);

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col bg-cream">
        <SiteHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-24 px-6 text-center">
          <p className="font-editorial text-3xl sm:text-4xl text-dark-brown">Artwork Not Found</p>
          <p className="text-xs text-dark-brown/70 font-sans max-w-sm">The requested atelier edition may have moved or been decommissioned.</p>
          <Link to="/shop" className="mt-4 inline-flex items-center gap-2 bg-burgundy text-cream text-xs uppercase tracking-[0.2em] font-sans font-semibold px-7 py-3.5 rounded-[2px] hover:bg-burgundy-hover transition-colors shadow-sm">
            Return to Collection
          </Link>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const size = product.sizes[sizeIdx] || product.sizes[0] || { label: 'Standard', widthMm: 800, heightMm: 800, priceDelta: 0 };
  const unitPrice = product.price + size.priceDelta;
  const currencySymbol = (storeConfig.currency && storeConfig.currency !== '$') ? storeConfig.currency : '₹';
  const finishDetail = FINISH_DESCRIPTIONS[finish] || { story: 'Masterfully hand-finished to order in our Antwerp workshop.', sheen: 'Custom Patina' };

  const handleAdd = () => {
    add({
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      shapeId: product.shapeId || 'circle',
      sizeLabel: size.label,
      widthMm: size.widthMm,
      heightMm: size.heightMm,
      finish,
      unitPrice,
      quantity: qty,
    });
    trackStoreEvent('cart');
    toast.success(`${product.name} reserved in your bag`, {
      description: `Bespoke ${finishLabels[finish]?.name || finish} edition added. Handcrafted in our studio.`
    });
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setIsCopied(true);
      toast.success("Artwork link copied to clipboard");
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  const formattedCategory = product.category
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="min-h-screen flex flex-col bg-cream text-dark-brown selection:bg-burgundy selection:text-cream">
      <SiteHeader />
      
      {/* Editorial Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="border-b border-[#EBE4D6] bg-[#FAF8F5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[11px] font-sans text-dark-brown/70">
            <Link to="/shop" className="hover:text-burgundy transition-colors font-medium">
              Collection
            </Link>
            <span className="text-dark-brown/30">/</span>
            <Link to={`/shop/${product.category}`} className="hover:text-burgundy transition-colors font-medium">
              {formattedCategory}
            </Link>
            <span className="text-dark-brown/30">/</span>
            <span className="text-dark-brown font-semibold truncate max-w-[160px] sm:max-w-none">
              {product.name}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] font-sans font-medium text-dark-brown/70 hover:text-burgundy transition cursor-pointer"
              title="Share this artwork"
            >
              <Share2 className="w-3 h-3 text-burgundy" />
              <span className="hidden sm:inline">{isCopied ? 'Link Copied' : 'Share'}</span>
            </button>
            <span className="text-dark-brown/20 hidden sm:inline">|</span>
            <button 
              type="button"
              onClick={() => navigate(-1)} 
              className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-sans font-semibold text-burgundy hover:text-burgundy-hover transition cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Back</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Product Showcase Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-16 w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-start">
          
          {/* ========================================================
              LEFT COLUMN: Interactive Gallery & Presentation Stage
             ======================================================== */}
          <div className="lg:col-span-7 space-y-4 min-w-0 w-full lg:sticky lg:top-24">
            
            {/* Main Stage Display Area */}
            <div className="bg-white border border-[#EBE4D6] rounded-[2px] overflow-hidden shadow-xs relative group">
              <AnimatePresence mode="wait">
                <motion.div
                  key={viewMode}
                  initial={{ opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full"
                >
                  {/* Mode 1: Studio Photograph */}
                  {viewMode === 'photo' && product.imageUrl && (
                    <div className="relative aspect-[4/3] sm:aspect-[16/11] bg-[#FAF8F5] overflow-hidden cursor-zoom-in" onClick={() => setLightboxOpen(true)}>
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                      />

                      {/* Top Badges */}
                      <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
                        {(product.bestseller || product.isNew) && (
                          <span className="text-[9px] uppercase tracking-[0.24em] font-sans font-medium px-2.5 py-1 bg-burgundy text-cream rounded-[1px] shadow-xs">
                            {product.isNew ? 'New Release' : 'Atelier Curated'}
                          </span>
                        )}
                        <span className="text-[9px] uppercase tracking-[0.2em] font-sans font-medium px-2 py-1 bg-white/90 backdrop-blur-xs text-dark-brown rounded-[1px] border border-[#EBE4D6] shadow-2xs">
                          {product.sizes?.[0]?.label || 'Standard Edition'}
                        </span>
                      </div>

                      {/* Click to Zoom Pill */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxOpen(true);
                        }}
                        className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] bg-white/90 hover:bg-white text-dark-brown text-[11px] font-sans font-medium backdrop-blur-sm border border-[#EBE4D6] shadow-2xs transition cursor-pointer group-hover:border-gold/60"
                      >
                        <ZoomIn className="w-3.5 h-3.5 text-burgundy" />
                        <span>Inspect Texture</span>
                      </button>
                    </div>
                  )}

                  {/* Mode 2: In-Situ Lifestyle / Architectural View */}
                  {viewMode === 'lifestyle' && (
                    <div className="relative aspect-[4/3] sm:aspect-[16/11] bg-[#FAF8F5] overflow-hidden cursor-zoom-in" onClick={() => setLightboxOpen(true)}>
                      <img
                        src={lifestyleImage}
                        alt={`${product.name} architectural interior styling`}
                        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                      />
                      <div className="absolute bottom-4 left-4 bg-black/75 backdrop-blur-sm px-3.5 py-1.5 rounded-[2px] text-cream text-[10px] font-mono tracking-widest border border-white/15">
                        Architectural Installation Reference
                      </div>
                    </div>
                  )}

                  {/* Mode 3: 3D Tilt Vector Simulation */}
                  {viewMode === 'preview' && (
                    <div className="p-4 sm:p-6 bg-[#FAF8F5] min-h-[460px] flex flex-col items-center justify-center relative">
                      <WallTiltPreview shapeId={product.shapeId || 'circle'} finish={finish} />
                      <div className="absolute top-4 left-4 text-[10px] font-mono uppercase tracking-wider text-dark-brown/60 bg-white/80 backdrop-blur-xs px-2.5 py-1 rounded-[1px] border border-[#EBE4D6]">
                        Move cursor to test light reflectivity
                      </div>
                    </div>
                  )}

                  {/* Mode 4: Room Scale Visualizer */}
                  {viewMode === 'wall' && (
                    <div className="p-3 sm:p-6 bg-[#FAF8F5] min-h-[460px] w-full block relative">
                      <WallPreview
                        product={product}
                        shapeId={product.shapeId || 'circle'}
                        finish={finish}
                        widthMm={size.widthMm}
                        heightMm={size.heightMm}
                      />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Interactive Viewport Tabs Strip */}
            <div className="grid grid-cols-4 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setViewMode('photo')}
                className={cn(
                  'py-2.5 px-2 rounded-[2px] border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1',
                  viewMode === 'photo'
                    ? 'border-burgundy bg-white text-burgundy font-semibold shadow-xs ring-1 ring-burgundy/20'
                    : 'border-[#EBE4D6] bg-white/70 hover:bg-white text-dark-brown/70 hover:text-dark-brown'
                )}
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="text-[10px] font-sans uppercase tracking-[0.12em]">Studio</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('lifestyle')}
                className={cn(
                  'py-2.5 px-2 rounded-[2px] border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1',
                  viewMode === 'lifestyle'
                    ? 'border-burgundy bg-white text-burgundy font-semibold shadow-xs ring-1 ring-burgundy/20'
                    : 'border-[#EBE4D6] bg-white/70 hover:bg-white text-dark-brown/70 hover:text-dark-brown'
                )}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="text-[10px] font-sans uppercase tracking-[0.12em]">In-Situ</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('wall')}
                className={cn(
                  'py-2.5 px-2 rounded-[2px] border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1',
                  viewMode === 'wall'
                    ? 'border-burgundy bg-white text-burgundy font-semibold shadow-xs ring-1 ring-burgundy/20'
                    : 'border-[#EBE4D6] bg-white/70 hover:bg-white text-dark-brown/70 hover:text-dark-brown'
                )}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="text-[10px] font-sans uppercase tracking-[0.12em]">Room Scale</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={cn(
                  'py-2.5 px-2 rounded-[2px] border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1',
                  viewMode === 'preview'
                    ? 'border-burgundy bg-white text-burgundy font-semibold shadow-xs ring-1 ring-burgundy/20'
                    : 'border-[#EBE4D6] bg-white/70 hover:bg-white text-dark-brown/70 hover:text-dark-brown'
                )}
              >
                <Compass className="w-3.5 h-3.5" />
                <span className="text-[10px] font-sans uppercase tracking-[0.12em]">3D Tilt</span>
              </button>
            </div>

            {/* Subtle Atelier Provenance Banner */}
            <div className="bg-[#FAF8F5] border border-[#EBE4D6] p-3 rounded-[2px] flex flex-col sm:flex-row sm:items-center justify-between text-xs text-dark-brown/75 font-sans gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-gold shrink-0" />
                <span className="font-medium text-dark-brown">{product.alloySpec || '3.0mm Solid Belgian Architectural Alloy'}</span>
              </div>
              <span className="text-[11px] text-dark-brown/60 sm:text-right">
                Signed Atelier Deed & Mounting Kit Included
              </span>
            </div>

          </div>

          {/* ========================================================
              RIGHT COLUMN: Configuration, Commerce & Architecture
             ======================================================== */}
          <div ref={buyBoxRef} className="lg:col-span-5 space-y-7 min-w-0 w-full">
            
            {/* Header & Badges */}
            <div className="space-y-2 border-b border-[#EBE4D6] pb-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.28em] font-sans text-burgundy font-semibold">
                  {product.tagline || `Vernox Atelier · ${formattedCategory}`}
                </span>
                
                {/* Review summary: real published reviews only */}
                {productReviews.length > 0 ? (
                  <div className="flex items-center gap-1.5 text-xs text-dark-brown/70">
                    <div className="flex text-gold">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-3 h-3 text-gold ${i < Math.round(averageRating) ? 'fill-gold' : ''}`} />
                      ))}
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-dark-brown">{averageRating.toFixed(1)}</span>
                    <span className="text-[11px] text-dark-brown/50">· {productReviews.length} {productReviews.length === 1 ? 'review' : 'reviews'}</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-dark-brown/50">No reviews yet</span>
                )}
              </div>

              <h1 className="font-editorial text-3xl sm:text-4xl lg:text-[42px] text-dark-brown font-normal tracking-tight leading-[1.12]">
                {product.name}
              </h1>

              {/* Price Display */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-editorial text-3xl sm:text-4xl text-dark-brown font-normal">
                    {currencySymbol}{unitPrice.toLocaleString()}
                  </span>
                  <span className="text-xs text-dark-brown/55 font-sans">
                    Includes 18% GST & Insured Transit
                  </span>
                </div>

                {/* Stock Scarcity Status */}
                <div className="inline-flex items-center gap-1.5 text-[11px] font-sans text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-[2px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  <span>In Stock · Ready to Dispatch</span>
                </div>
              </div>
            </div>

            {/* Curated Editorial Description */}
            <div className="space-y-2">
              <p className="text-xs sm:text-[13px] text-dark-brown/85 font-sans leading-relaxed">
                {product.description}
              </p>
            </div>

            {/* Finish / Patina Selector */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.24em] font-sans text-dark-brown">
                  Patina & Alloy Finish
                </label>
                <span className="text-xs font-sans text-burgundy font-semibold">
                  {finishLabels[finish]?.name || finish}
                </span>
              </div>

              {/* Swatch Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {product.finishes.map(f => {
                  const isSelected = finish === f;
                  const label = finishLabels[f]?.name ?? f;
                  const swatch = finishLabels[f]?.swatch ?? '#4A4A4F';

                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFinish(f)}
                      title={label}
                      className={cn(
                        'group/swatch relative p-2 rounded-[2px] transition-all cursor-pointer flex items-center gap-2 border text-left',
                        isSelected
                          ? 'border-burgundy bg-white ring-1 ring-burgundy shadow-xs'
                          : 'border-[#EBE4D6] bg-white/70 hover:bg-white text-dark-brown/70 hover:text-dark-brown'
                      )}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-black/15 shadow-2xs shrink-0"
                        style={{ background: swatch }}
                      />
                      <div className="truncate min-w-0">
                        <span className="block text-[11px] font-sans font-medium text-dark-brown truncate">{label}</span>
                      </div>
                      {isSelected && <Check className="w-3 h-3 text-burgundy ml-auto shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Finish Alchemy Note */}
              <p className="text-[11px] text-dark-brown/65 font-sans italic bg-[#FAF8F5] p-2.5 rounded-[2px] border border-[#EBE4D6]">
                <strong className="font-semibold text-dark-brown not-italic font-sans mr-1">{finishDetail.sheen}:</strong>
                {finishDetail.story}
              </p>
            </div>

            {/* Scale & Dimensions Selector */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.24em] font-sans text-dark-brown">
                  Scale & Dimensions
                </label>
                <span className="text-[10px] uppercase tracking-wider text-dark-brown/50 font-sans">
                  ±0.05mm laser tolerance
                </span>
              </div>

              <div className="space-y-2">
                {product.sizes.map((s, i) => {
                  const isSelected = sizeIdx === i;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setSizeIdx(i)}
                      className={cn(
                        'w-full flex justify-between items-center px-4 py-3 rounded-[2px] border text-xs text-left transition-all cursor-pointer',
                        isSelected
                          ? 'border-burgundy bg-white ring-1 ring-burgundy shadow-xs'
                          : 'border-[#EBE4D6] bg-white/70 hover:bg-white text-dark-brown/80 hover:text-dark-brown'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Ruler className={cn('w-4 h-4', isSelected ? 'text-burgundy' : 'text-gold')} />
                        <div>
                          <span className={cn('font-sans block text-xs', isSelected ? 'font-semibold text-dark-brown' : 'text-dark-brown/80')}>
                            {s.label}
                          </span>
                          <span className="text-[10px] text-dark-brown/50 font-mono">
                            {s.widthMm}mm × {s.heightMm}mm ({Math.round(s.widthMm / 10)} × {Math.round(s.heightMm / 10)} cm)
                          </span>
                        </div>
                      </div>
                      <span className={cn('font-mono text-xs font-semibold', isSelected ? 'text-burgundy' : 'text-dark-brown/60')}>
                        {s.priceDelta > 0 ? `+${currencySymbol}${s.priceDelta}` : 'Standard Edition'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Need Custom Dimensions CTA */}
              <div className="flex items-center justify-between text-xs text-dark-brown/70 pt-1">
                <span>Looking for bespoke millimeter sizing?</span>
                <button
                  type="button"
                  onClick={() => setStudioOpen(true)}
                  className="text-burgundy font-semibold hover:underline cursor-pointer"
                >
                  Configure in CAD Studio →
                </button>
              </div>
            </div>

            {/* Quantity & Action Buttons */}
            <div className="space-y-3 pt-3 border-t border-[#EBE4D6]">
              <div className="flex items-center gap-4">
                <label className="text-[11px] font-semibold uppercase tracking-[0.24em] font-sans text-dark-brown">
                  Quantity
                </label>
                <div className="inline-flex items-center border border-[#EBE4D6] rounded-[2px] bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="px-3.5 py-1.5 hover:bg-cream transition font-semibold text-xs text-dark-brown cursor-pointer"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="px-3.5 py-1.5 min-w-8 text-center font-mono text-xs font-semibold text-dark-brown">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty(q => q + 1)}
                    className="px-3.5 py-1.5 hover:bg-cream transition font-semibold text-xs text-dark-brown cursor-pointer"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Main Action Buttons: Acquire + Wishlist + CAD */}
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleAdd}
                  className="flex-1 inline-flex items-center justify-center gap-2.5 bg-burgundy hover:bg-burgundy-hover text-cream font-semibold text-xs uppercase tracking-[0.2em] font-sans px-7 py-4 rounded-[2px] transition-all shadow-sm hover:shadow-md cursor-pointer border border-transparent hover:border-dusty-pink group"
                >
                  <ShoppingBag className="w-4 h-4 text-dusty-pink transition-transform group-hover:scale-110" />
                  <span>Acquire Edition · {currencySymbol}{(unitPrice * qty).toLocaleString()}</span>
                </button>

                {product.customizable && (
                  <button
                    type="button"
                    onClick={() => setStudioOpen(true)}
                    className="inline-flex items-center justify-center gap-1.5 border border-[#EBE4D6] hover:border-burgundy bg-white text-dark-brown font-semibold text-xs font-sans px-4 py-4 rounded-[2px] hover:bg-cream transition cursor-pointer shadow-2xs"
                    title="Open Bespoke CAD Studio"
                  >
                    <Compass className="w-4 h-4 text-burgundy" />
                    <span className="hidden sm:inline">CAD Studio</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    toggleWishlist(product.id);
                    toast.success(isWishlisted ? "Removed from private folio" : "Saved to private folio");
                  }}
                  className={cn(
                    'inline-flex items-center justify-center p-4 rounded-[2px] border transition-all cursor-pointer shadow-2xs',
                    isWishlisted 
                      ? 'border-burgundy bg-burgundy/10 text-burgundy' 
                      : 'border-[#EBE4D6] bg-white text-dark-brown/70 hover:border-burgundy/50 hover:text-dark-brown'
                  )}
                  title={isWishlisted ? "Remove from Saved" : "Save to Private Folio"}
                  aria-label="Wishlist"
                >
                  <Heart className={cn('w-4 h-4', isWishlisted && 'fill-burgundy text-burgundy')} />
                </button>
              </div>
            </div>

            {/* 4-Card Luxury Assurance Grid */}
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <div className="p-3 bg-white border border-[#EBE4D6] rounded-[2px] space-y-1">
                <div className="flex items-center gap-1.5 text-burgundy font-semibold text-[11px] font-sans">
                  <Award className="w-3.5 h-3.5 text-gold" />
                  <span>Signed Deed</span>
                </div>
                <p className="text-[10px] text-dark-brown/70 font-sans leading-snug">
                  Numbered hallmark deed signed by the atelier artisan.
                </p>
              </div>

              <div className="p-3 bg-white border border-[#EBE4D6] rounded-[2px] space-y-1">
                <div className="flex items-center gap-1.5 text-burgundy font-semibold text-[11px] font-sans">
                  <Box className="w-3.5 h-3.5 text-gold" />
                  <span>Museum Standoffs</span>
                </div>
                <p className="text-[10px] text-dark-brown/70 font-sans leading-snug">
                  Concealed 20mm relief cylinders & 1:1 drill template included.
                </p>
              </div>

              <div className="p-3 bg-white border border-[#EBE4D6] rounded-[2px] space-y-1">
                <div className="flex items-center gap-1.5 text-burgundy font-semibold text-[11px] font-sans">
                  <Truck className="w-3.5 h-3.5 text-gold" />
                  <span>Timber Crating</span>
                </div>
                <p className="text-[10px] text-dark-brown/70 font-sans leading-snug">
                  Reinforced zero-deflection crate with transit insurance.
                </p>
              </div>

              <div className="p-3 bg-white border border-[#EBE4D6] rounded-[2px] space-y-1">
                <div className="flex items-center gap-1.5 text-burgundy font-semibold text-[11px] font-sans">
                  <ShieldCheck className="w-3.5 h-3.5 text-gold" />
                  <span>14-Day Viewing</span>
                </div>
                <p className="text-[10px] text-dark-brown/70 font-sans leading-snug">
                  Private in-situ return privilege for full client confidence.
                </p>
              </div>
            </div>

            {/* Curated Technical & Architectural Accordions */}
            <div className="pt-2 border-t border-[#EBE4D6] space-y-2">
              {/* Accordion 1: Specs */}
              <div className="border border-[#EBE4D6] rounded-[2px] bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setActiveAccordion(activeAccordion === 'specs' ? null : 'specs')}
                  className="w-full px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] font-sans text-dark-brown cursor-pointer flex items-center justify-between text-left hover:bg-[#FAF8F5] transition"
                >
                  <span className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-burgundy" />
                    <span>Materials & Technical Specs</span>
                  </span>
                  <ChevronDown className={cn('w-3.5 h-3.5 text-dark-brown/50 transition-transform duration-200', activeAccordion === 'specs' && 'rotate-180')} />
                </button>
                {activeAccordion === 'specs' && (
                  <div className="px-4 pb-4 pt-1 text-xs text-dark-brown/80 leading-relaxed space-y-2 border-t border-[#F2ECE1] font-sans bg-[#FAF8F5]/50">
                    <p>• <strong>Alloy Grade:</strong> {product.alloySpec || '3.0mm solid architectural plate'}</p>
                    <p>• <strong>Dimensions:</strong> {size.widthMm}mm width × {size.heightMm}mm height (±0.05mm laser tolerance)</p>
                    <p>• <strong>Surface Finish:</strong> Hand-dressed with archival microcrystalline wax patina seal</p>
                    <p>• <strong>Weight Estimate:</strong> Approx. 4.2 kg (Standard Edition) to 9.8 kg (Grand Statement)</p>
                  </div>
                )}
              </div>

              {/* Accordion 2: Mounting */}
              <div className="border border-[#EBE4D6] rounded-[2px] bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setActiveAccordion(activeAccordion === 'mounting' ? null : 'mounting')}
                  className="w-full px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] font-sans text-dark-brown cursor-pointer flex items-center justify-between text-left hover:bg-[#FAF8F5] transition"
                >
                  <span className="flex items-center gap-2">
                    <Ruler className="w-3.5 h-3.5 text-burgundy" />
                    <span>Mounting & Surface Compatibility</span>
                  </span>
                  <ChevronDown className={cn('w-3.5 h-3.5 text-dark-brown/50 transition-transform duration-200', activeAccordion === 'mounting' && 'rotate-180')} />
                </button>
                {activeAccordion === 'mounting' && (
                  <div className="px-4 pb-4 pt-1 text-xs text-dark-brown/80 leading-relaxed space-y-2 border-t border-[#F2ECE1] font-sans bg-[#FAF8F5]/50">
                    <p>• <strong>Drop-Shadow Relief:</strong> Concealed 20mm standoff cylinders suspend artwork cleanly off the wall.</p>
                    <p>• <strong>Included Hardware:</strong> 1:1 paper drill template, Fischer nylon anchors, and stainless steel fasteners.</p>
                    <p>• <strong>Compatible Surfaces:</strong> Drywall, lime-wash plaster, exposed brick, stone veneer, and timber paneling.</p>
                  </div>
                )}
              </div>

              {/* Accordion 3: Trade & Architecture */}
              <div className="border border-[#EBE4D6] rounded-[2px] bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setActiveAccordion(activeAccordion === 'trade' ? null : 'trade')}
                  className="w-full px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] font-sans text-dark-brown cursor-pointer flex items-center justify-between text-left hover:bg-[#FAF8F5] transition"
                >
                  <span className="flex items-center gap-2">
                    <Compass className="w-3.5 h-3.5 text-burgundy" />
                    <span>Architectural Trade Program</span>
                  </span>
                  <ChevronDown className={cn('w-3.5 h-3.5 text-dark-brown/50 transition-transform duration-200', activeAccordion === 'trade' && 'rotate-180')} />
                </button>
                {activeAccordion === 'trade' && (
                  <div className="px-4 pb-4 pt-1 text-xs text-dark-brown/80 leading-relaxed space-y-2.5 border-t border-[#F2ECE1] font-sans bg-[#FAF8F5]/50">
                    <p>
                      Interior architects and specifiers receive 3D CAD models (.step / .dwg), volume tier commissions, and dedicated material samples.
                    </p>
                    <Link to="/trade" className="inline-flex items-center gap-1.5 text-burgundy font-semibold hover:underline">
                      Apply for Vernox Trade Privileges →
                    </Link>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* ========================================================
          DEEP CRAFTSMANSHIP STORY: "THE ATELIER METHOD"
         ======================================================== */}
      <section className="bg-white border-y border-[#EBE4D6] py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-[10px] uppercase tracking-[0.28em] font-sans text-burgundy font-semibold">
              The Antwerp Atelier Method
            </span>
            <h2 className="font-editorial text-3xl sm:text-4xl text-dark-brown font-normal mt-1.5">
              From Raw Metal Sheet to Your Wall
            </h2>
            <p className="text-xs sm:text-sm text-dark-brown/70 font-sans mt-2 leading-relaxed">
              Every edition is executed in single-piece continuity. No plastic components, no shortcuts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-3.5 text-center sm:text-left">
              <div className="w-12 h-12 rounded-[2px] bg-[#FAF8F5] border border-[#EBE4D6] flex items-center justify-center text-burgundy font-editorial text-xl mx-auto sm:mx-0">
                01
              </div>
              <h3 className="font-editorial text-xl text-dark-brown">Micron-Precision Fibre Laser</h3>
              <p className="text-xs text-dark-brown/75 font-sans leading-relaxed">
                Sheets of 3.0mm Belgian steel and CZ108 brass are sliced with micron accuracy, producing immaculate bevel edges that require zero distortion.
              </p>
            </div>

            <div className="space-y-3.5 text-center sm:text-left">
              <div className="w-12 h-12 rounded-[2px] bg-[#FAF8F5] border border-[#EBE4D6] flex items-center justify-center text-burgundy font-editorial text-xl mx-auto sm:mx-0">
                02
              </div>
              <h3 className="font-editorial text-xl text-dark-brown">Artisanal Patination & Flamed Hues</h3>
              <p className="text-xs text-dark-brown/75 font-sans leading-relaxed">
                Hand-rubbed chemical patinas, mineral oxides, and torch treatments coax deep amber, oxblood, and antique gold tones directly from the raw metal.
              </p>
            </div>

            <div className="space-y-3.5 text-center sm:text-left">
              <div className="w-12 h-12 rounded-[2px] bg-[#FAF8F5] border border-[#EBE4D6] flex items-center justify-center text-burgundy font-editorial text-xl mx-auto sm:mx-0">
                03
              </div>
              <h3 className="font-editorial text-xl text-dark-brown">Archival Microcrystalline Wax</h3>
              <p className="text-xs text-dark-brown/75 font-sans leading-relaxed">
                Multiple coats of museum-grade wax are buffed by hand to seal the finish, locking in its luminous depth while protecting against humidity and dust.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          ARCHITECTURAL FOLIO: PATRON & SPECIFIER INSTALLATIONS
         ======================================================== */}
      <section className="bg-[#FAF8F5] py-16 sm:py-20 border-b border-[#EBE4D6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <span className="text-[10px] uppercase tracking-[0.28em] font-sans text-burgundy font-semibold">
                Customer reviews
              </span>
              <h2 className="font-editorial text-2xl sm:text-3xl text-dark-brown font-normal mt-1">
                What customers say
              </h2>
            </div>
          </div>

          {productReviews.length === 0 && (
            <p className="text-sm text-dark-brown/60 font-sans">No reviews yet. Reviews appear here once customers publish them.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {productReviews.slice(0, 6).map((fb) => (
              <div 
                key={fb.id} 
                className="bg-white border border-[#EBE4D6] rounded-[2px] p-6 space-y-4 shadow-2xs flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex text-gold">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-3 h-3 text-gold ${i < fb.rating ? 'fill-gold' : ''}`} />
                    ))}
                  </div>
                  <p className="font-editorial text-sm sm:text-base text-dark-brown/85 italic leading-relaxed">
                    "{fb.comment}"
                  </p>
                  {fb.conciergeResponse && (
                    <div className="mt-2 p-2.5 rounded bg-cream/70 border border-[#EBE4D6] text-[11px] text-dark-brown/80 italic">
                      <span className="font-sans font-semibold text-burgundy not-italic block text-[10px] uppercase tracking-wider mb-0.5">
                        Atelier Concierge:
                      </span>
                      "{fb.conciergeResponse}"
                    </div>
                  )}
                </div>
                <div className="pt-3 border-t border-[#F0EAE0]">
                  <h4 className="font-editorial text-sm font-medium text-dark-brown">{fb.customerName}</h4>
                  <p className="text-[10px] uppercase tracking-wider text-burgundy font-sans font-medium mt-0.5">
                    {fb.customerRole}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================
          COMPLEMENTARY WORKS FROM THE ATELIER
         ======================================================== */}
      {finalRelatedProducts.length > 0 && (
        <section className="bg-cream py-16 sm:py-20 border-b border-[#EBE4D6]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <span className="text-[10px] uppercase tracking-[0.28em] font-sans text-burgundy font-semibold">
                  Curated Pairings
                </span>
                <h2 className="font-editorial text-2xl sm:text-3xl text-dark-brown font-normal mt-1">
                  Complementary Masterworks
                </h2>
              </div>
              <Link
                to="/shop"
                className="text-xs uppercase tracking-[0.2em] font-sans font-semibold text-burgundy hover:opacity-80 transition"
              >
                View Complete Folio →
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
              {finalRelatedProducts.map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recently Viewed Works Tray */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 my-12">
        <RecentlyViewed currentProductId={product.id} />
      </div>

      {/* ========================================================
          FULLSCREEN LIGHTBOX MODAL FOR ARTWORK TEXTURE INSPECTION
         ======================================================== */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-8"
            onClick={() => setLightboxOpen(false)}
          >
            {/* Top Bar */}
            <div className="absolute top-4 inset-x-4 sm:inset-x-8 flex items-center justify-between text-cream z-10" onClick={e => e.stopPropagation()}>
              <div>
                <h3 className="font-editorial text-lg text-cream">{product.name}</h3>
                <span className="text-xs text-white/60 font-sans font-normal">{product.alloySpec || '3.0mm Solid Architectural Alloy'}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLightboxZoom(!lightboxZoom)}
                  className="px-3 py-1.5 rounded-[2px] bg-white/10 hover:bg-white/20 text-cream text-xs font-sans transition flex items-center gap-1.5 cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>{lightboxZoom ? 'Reset Zoom' : '2× Zoom'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-cream flex items-center justify-center transition cursor-pointer"
                  aria-label="Close Lightbox"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Lightbox Image Stage */}
            <div 
              className="max-w-5xl max-h-[82vh] overflow-auto flex items-center justify-center"
              onClick={e => e.stopPropagation()}
            >
              <img
                src={viewMode === 'lifestyle' ? lifestyleImage : (product.imageUrl || '/images/hero-art-lounge.jpg')}
                alt={product.name}
                className={cn(
                  'max-h-[80vh] w-auto object-contain transition-transform duration-300 rounded-[2px]',
                  lightboxZoom ? 'scale-150 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
                )}
                onClick={() => setLightboxZoom(!lightboxZoom)}
              />
            </div>
            
            <p className="absolute bottom-4 text-xs text-white/50 font-sans pointer-events-none">
              Click image to toggle 2× magnification · Press Esc or click outside to dismiss
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MOBILE STICKY BUY BAR (SLIDES UP ON SCROLL)
         ======================================================== */}
      <AnimatePresence>
        {showStickyBar && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="md:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-[#EBE4D6] p-3 px-4 z-40 shadow-lg flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {product.imageUrl && (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-11 h-11 object-cover rounded-[2px] border border-[#EBE4D6] shrink-0"
                />
              )}
              <div className="truncate">
                <p className="font-editorial text-xs font-semibold text-dark-brown truncate leading-tight">
                  {product.name}
                </p>
                <p className="font-mono text-xs font-bold text-burgundy mt-0.5">
                  {currencySymbol}{(unitPrice * qty).toLocaleString()}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAdd}
              className="bg-burgundy hover:bg-burgundy-hover text-cream text-[10px] uppercase tracking-[0.18em] font-sans font-semibold px-5 py-2.5 rounded-[2px] transition shrink-0 flex items-center gap-1.5 shadow-sm"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-dusty-pink" />
              <span>Acquire</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CAD Studio Modal */}
      <InlineStudio
        open={studioOpen}
        onOpenChange={setStudioOpen}
        initialShapeId={product.shapeId || 'circle'}
        initialWidthMm={size.widthMm}
        initialHeightMm={size.heightMm}
        initialFinish={finish}
        productName={product.name}
      />

      <SiteFooter />
    </div>
  );
}
