import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Heart, Minus, Plus } from 'lucide-react';
import { StoreLayout } from '@/components/shop/StoreLayout';
import { PageHeader } from '@/components/shop/PageHeader';
import { Reveal } from '@/components/shop/Reveal';
import { ProductGridSkeleton } from '@/components/shop/StateViews';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { flyToCart } from '@/lib/storefront/motion';
import { ProductGallery } from '@/components/shop/ProductGallery';
import { PriceTag } from '@/components/shop/PriceTag';
import { ProductFaq, ProductReviews, SpecsTable } from '@/components/shop/ProductInfo';
import { ReviewForm } from '@/components/shop/ReviewForm';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { RecentlyViewed } from '@/components/shop/RecentlyViewed';
import { StarRating } from '@/components/shop/StarRating';
import { finishLabels, finishName, formatSizeCm, formatSizeInches, getCategory, unitPrice } from '@/lib/catalog';
import { useCart } from '@/lib/cartContext';
import { useCatalog } from '@/lib/catalogContext';
import { productJsonLd, useSeo } from '@/lib/seo';
import { formatINR } from '@/lib/storefront/format';
import { trackStoreEvent } from '@/lib/storeAnalytics';
import { cn } from '@/lib/utils';
import { DeliveryEstimate } from '@/components/shop/DeliveryEstimate';
import NotFound from '@/pages/NotFound';

export default function ProductDetail() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { add, setDrawerOpen } = useCart();
  const { products, productsLoading, reviews, isInWishlist, toggleWishlist, storeConfig } = useCatalog();
  const product = products.find(p => p.slug === slug);

  const [sizeIndex, setSizeIndex] = useState(0);
  const [finish, setFinish] = useState('');
  const [quantity, setQuantity] = useState(1);

  // Reset the selection when navigating between products (related items keep this component mounted).
  useEffect(() => {
    // `?size=<label>&finish=<id>` preselects a configuration (the wall-preview QR code uses it); invalid values are ignored.
    const query = new URLSearchParams(window.location.search);
    const wantedSize = query.get('size')?.trim().toLowerCase();
    const sizeFromUrl = product && wantedSize ? product.sizes.findIndex(x => x.label.toLowerCase() === wantedSize) : -1;
    const wantedFinish = query.get('finish') ?? '';
    setSizeIndex(sizeFromUrl >= 0 ? sizeFromUrl : 0);
    setFinish((product?.finishes as string[] | undefined)?.includes(wantedFinish) ? wantedFinish : product?.finishes[0] ?? '');
    setQuantity(1);
    if (product) {
      window.scrollTo(0, 0);
      trackStoreEvent('view', { path: `/product/${product.slug}` });
    }
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on product identity only

  const productReviews = useMemo(() => (product ? reviews.filter(r => r.productId === product.id) : []), [product, reviews]);
  const related = useMemo(
    () => (product ? products.filter(p => p.id !== product.id && (p.category === product.category || p.themes?.some(t => product.themes?.includes(t)))).slice(0, 4) : []),
    [product, products],
  );

  useSeo({
    title: product ? `${product.name} | Laser-cut metal wall art` : 'Product',
    description: product ? `${product.tagline}. ${product.description}`.slice(0, 300) : undefined,
    canonicalPath: product ? `/product/${product.slug}` : undefined,
    ogType: 'product',
    image: product?.imageUrl,
    jsonLd: product ? productJsonLd({ ...product, price: unitPrice(product, product.sizes[0]) }) : undefined,
  });

  // Keep the address in sync with the chosen configuration so a shared link reopens it (replaceState: no history entries).
  useEffect(() => {
    if (!product) return;
    const url = new URL(window.location.href);
    const sizeLabel = product.sizes[sizeIndex]?.label;
    if (sizeLabel) url.searchParams.set('size', sizeLabel);
    if (finish) url.searchParams.set('finish', finish);
    window.history.replaceState(window.history.state, '', url);
  }, [product, sizeIndex, finish]);

  if (productsLoading) return <ProductSkeleton />;
  if (!product) return <NotFound />;

  const size = product.sizes[sizeIndex] ?? { label: 'Standard', widthMm: 0, heightMm: 0, priceDelta: 0 };
  const activeFinish = finish || product.finishes[0] || 'brass';
  const price = unitPrice(product, size);
  const gstRate = storeConfig.gstRatePercent;
  const inclusive = Math.round(price * (1 + gstRate / 100));
  const outOfStock = product.trackInventory !== false && product.stock <= 0;
  const lowStock = !outOfStock && product.trackInventory !== false && product.stock <= 5;
  const wished = isInWishlist(product.id);
  const category = getCategory(product.category);
  const rated = productReviews.filter(r => r.rating > 0);
  const average = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 0;

  const addToCart = (openDrawer: boolean, source?: Element | null) => {
    flyToCart(source ?? null);
    add({
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      shapeId: product.shapeId,
      sizeLabel: size.label,
      widthMm: size.widthMm,
      heightMm: size.heightMm,
      finish: activeFinish,
      unitPrice: price,
      quantity,
    });
    trackStoreEvent('cart');
    // add() opens the mini cart; "Buy now" skips it and goes straight to checkout.
    if (!openDrawer) setDrawerOpen(false);
  };

  const buyNow = () => {
    addToCart(false);
    navigate('/checkout');
  };

  const widest = Math.max(...product.sizes.map(x => x.widthMm), 1);
  // The plate scales with the chosen size (never below 70%) so size changes visibly morph the piece.
  const plateScale = 0.7 + 0.3 * ((size.widthMm || widest) / widest);

  return (
    <StoreLayout mainClassName="pb-24 lg:pb-0">
      <div className="container py-4 sm:py-8">
        <PageHeader crumbs={[{ label: 'Shop', to: '/shop' }, ...(category ? [{ label: category.name, to: `/shop?category=${category.id}` }] : []), { label: product.name }]} />

        <div className="grid gap-8 lg:grid-cols-2">
          <ProductGallery
            product={product}
            finish={activeFinish}
            size={size}
            plateScale={plateScale}
            onChooseSize={chosen => setSizeIndex(Math.max(0, product.sizes.findIndex(s => s.label === chosen.label)))}
            onFinishChange={setFinish}
          />

          <div className="space-y-5">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl">{product.name}</h1>
              <p className="mt-1 text-muted-foreground">{product.tagline}</p>
              {rated.length > 0 && <div className="mt-2"><StarRating average={average} count={rated.length} /></div>}
            </div>

            <div className="space-y-1">
              <PriceTag product={product} size={size} large />
              <p className="text-sm text-muted-foreground">+ {gstRate}% GST · {formatINR(inclusive)} incl. GST</p>
              <DeliveryEstimate productId={product.id} className="pt-2" />
            </div>

            <p className="text-sm text-muted-foreground">
              Free shipping above {formatINR(storeConfig.freeShippingThreshold)} · Ships in about {product.leadTimeDays ?? 7} working days
            </p>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Size: {formatSizeCm(size)} ({formatSizeInches(size)})</legend>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    aria-pressed={i === sizeIndex}
                    onClick={() => setSizeIndex(i)}
                    className={cn('min-h-11 rounded-md border px-3 py-1.5 text-left text-sm', i === sizeIndex ? 'border-burgundy bg-burgundy/5 ring-1 ring-burgundy' : 'border-border bg-card')}
                  >
                    <span className="block font-medium">{formatSizeCm(s)}</span>
                    <span className="block text-xs text-muted-foreground">{formatSizeInches(s)} · {formatINR(unitPrice(product, s))}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Finish: {finishName(activeFinish)}</legend>
              <div className="flex flex-wrap gap-3">
                {product.finishes.map(id => (
                  <button
                    key={id}
                    type="button"
                    aria-label={finishName(id)}
                    aria-pressed={id === activeFinish}
                    title={finishName(id)}
                    onClick={() => setFinish(id)}
                    className={cn('h-11 w-11 rounded-full border', id === activeFinish ? 'ring-2 ring-ring ring-offset-2' : 'border-border')}
                    style={{ background: finishLabels[id]?.swatch }}
                  />
                ))}
              </div>
              
            </fieldset>

            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-md border border-border bg-card" role="group" aria-label="Quantity">
                <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(q => Math.max(1, q - 1))} className="flex h-11 w-11 items-center justify-center"><Minus className="h-4 w-4" /></button>
                <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{quantity}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => setQuantity(q => Math.min(10, q + 1))} className="flex h-11 w-11 items-center justify-center"><Plus className="h-4 w-4" /></button>
              </div>
              <button type="button" onClick={() => toggleWishlist(product.id)} aria-pressed={wished} aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'} className="btn-secondary px-3">
                <Heart className={cn('h-5 w-5', wished && 'fill-burgundy text-burgundy')} aria-hidden="true" />
              </button>
            </div>
            {lowStock && <p className="text-sm font-medium text-burgundy">Only {product.stock} left in stock</p>}

            <div className="hidden gap-3 lg:flex">
              <button type="button" disabled={outOfStock} onClick={(e: MouseEvent<HTMLButtonElement>) => addToCart(true, e.currentTarget)} className="btn-secondary flex-1">{outOfStock ? 'Out of stock' : 'Add to cart'}</button>
              <button type="button" disabled={outOfStock} onClick={buyNow} className="btn-primary flex-1">Buy now</button>
            </div>

            <Link to="/studio" className="inline-block text-sm font-semibold text-burgundy underline-offset-4 hover:underline">Want a different size or your own artwork? Open the Studio</Link>
          </div>
        </div>

        <Reveal className="mt-10 max-w-3xl">
          <Accordion type="single" collapsible defaultValue="about">
            <AccordionItem value="about">
              <AccordionTrigger className="font-display text-xl">About this design</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{product.description}</AccordionContent>
            </AccordionItem>
            <AccordionItem value="specs">
              <AccordionTrigger className="font-display text-xl">Specifications</AccordionTrigger>
              <AccordionContent><SpecsTable product={product} size={size} finish={activeFinish} /></AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq">
              <AccordionTrigger className="font-display text-xl">Questions</AccordionTrigger>
              <AccordionContent><ProductFaq product={product} /></AccordionContent>
            </AccordionItem>
          </Accordion>
        </Reveal>

        <section className="mt-12" aria-labelledby="reviews-heading">
          <h2 id="reviews-heading" className="section-title mb-3">Reviews</h2>
          <ProductReviews reviews={productReviews} />
          <div className="mt-4"><ReviewForm productId={product.id} /></div>
        </section>

        {related.length > 0 && (
          <section className="mt-12" aria-labelledby="related-heading">
            <h2 id="related-heading" className="section-title mb-4">You may also like</h2>
            <ProductGrid products={related} />
          </section>
        )}
      </div>

      <RecentlyViewed currentProductId={product.id} />

      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{formatINR(price)}</p>
          <p className="text-xs text-muted-foreground">+ GST</p>
        </div>
        <button type="button" disabled={outOfStock} onClick={(e: MouseEvent<HTMLButtonElement>) => addToCart(true, e.currentTarget)} className="btn-secondary ml-auto px-4">Add</button>
        <button type="button" disabled={outOfStock} onClick={buyNow} className="btn-primary px-4">Buy now</button>
      </div>
    </StoreLayout>
  );
}

/** Matches the final layout (gallery left, buy box right) so nothing shifts when the product arrives. */
function ProductSkeleton() {
  return (
    <StoreLayout>
      <div className="container py-4 sm:py-8" role="status" aria-label="Loading design">
        <div className="skeleton mb-6 h-4 w-48" />
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-3"><div className="skeleton aspect-square" /><div className="flex gap-2"><div className="skeleton h-10 w-20" /><div className="skeleton h-10 w-20" /><div className="skeleton h-10 w-20" /></div></div>
          <div className="space-y-5">
            <div className="skeleton h-10 w-3/4" /><div className="skeleton h-5 w-1/2" /><div className="skeleton h-8 w-40" />
            <div className="skeleton h-12 w-full" /><div className="skeleton h-12 w-2/3" />
            <div className="flex gap-3"><div className="skeleton h-11 flex-1" /><div className="skeleton h-11 flex-1" /></div>
          </div>
        </div>
        <div className="mt-12"><ProductGridSkeleton count={4} /></div>
      </div>
    </StoreLayout>
  );
}
