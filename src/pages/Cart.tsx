import { useSeo } from '@/lib/seo';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { useCart } from '@/lib/cartContext';
import { useCatalog } from '@/lib/catalogContext';
import { 
  Trash2, 
  ShoppingBag, 
  ArrowRight, 
  ShieldCheck, 
  Truck, 
  Award, 
  RotateCcw, 
  Plus, 
  Minus, 
  Tag, 
  CheckCircle2, 
  Compass, 
  PhoneCall,
  Lock
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { RecentlyViewed } from '@/components/shop/RecentlyViewed';

import { previewCoupon } from '@/lib/data/couponPreview';

export default function Cart() {
  useSeo({ title: 'Cart', noindex: true });
  const { storeConfig, products } = useCatalog();
  const { items, updateQty, remove, subtotal, clear, appliedCoupon, applyCoupon, removeCoupon } = useCart();
  const navigate = useNavigate();

  // Promotional Code State
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');

  const threshold = storeConfig.freeShippingThreshold || 5000;
  const shipping = subtotal > threshold || subtotal === 0 ? 0 : storeConfig.shippingFee;

  // The server decides the discount; the cart shows the amount from the last validation.
  const discountAmount = appliedCoupon?.discountAmount || 0;

  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const tax = discountedSubtotal * (storeConfig.taxRate / 100);
  const total = discountedSubtotal + shipping + tax;

  const progressPercent = Math.min(100, Math.round((subtotal / threshold) * 100));
  const remainingForFreeShipping = Math.max(0, threshold - subtotal);

  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError('');
    const clean = promoCode.trim().toUpperCase();
    if (!clean) return;

    try {
      const result = await previewCoupon({ code: clean, subtotal, items });
      if (result.isValid) {
        applyCoupon({
          code: result.couponCode || clean,
          discountAmount: result.discountAmount,
          discountType: result.discountType,
          discountValue: result.discountValue,
          description: result.description,
        });
        toast.success(`Coupon ${result.couponCode || clean} applied! Saved ${storeConfig.currency || '₹'}${result.discountAmount.toFixed(2)}`);
        setPromoCode('');
      } else {
        setPromoError(result.error || 'Invalid coupon code.');
        toast.error(result.error || 'The entered promo code is not recognized.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not check the coupon right now.';
      setPromoError(message);
      toast.error(message);
    }
  };

  const handleRemovePromo = () => {
    removeCoupon();
    setPromoCode('');
    setPromoError('');
    toast.info('Promotional discount removed.');
  };

  // Recommended products if cart is empty or to complement cart
  const recommended = products.slice(0, 3);

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-burgundy/80 selection:text-cream">
      <SiteHeader />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
        {/* Breadcrumb & Header */}
        <div className="mb-8 md:mb-12">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-3 font-semibold">
            <Link to="/shop" className="hover:text-burgundy transition">Atelier Catalog</Link>
            <span>/</span>
            <span className="text-foreground">Shopping Cart</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/80 pb-6">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl text-burgundy font-semibold tracking-tight">
                Your Atelier Cart
              </h1>
              <p className="text-muted-foreground text-xs sm:text-sm mt-1.5 font-serif-italic">
                Review your laser-sculpted pieces before secure atelier crating and white-glove dispatch.
              </p>
            </div>
            {items.length > 0 && (
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="px-3 py-1 rounded-full bg-burgundy/10 text-burgundy font-bold">
                  {items.reduce((acc, i) => acc + i.quantity, 0)} Items Selected
                </span>
                <button 
                  onClick={() => {
                    if (window.confirm("Empty entire atelier cart?")) {
                      clear();
                      toast.info("Cart cleared");
                    }
                  }}
                  className="text-muted-foreground hover:text-destructive transition underline underline-offset-4"
                >
                  Clear Cart
                </button>
              </div>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          /* EMPTY CART LUXURY STATE */
          <div className="py-16 md:py-24 text-center max-w-2xl mx-auto px-4">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-burgundy/5 border border-burgundy/20 flex items-center justify-center text-burgundy shadow-soft">
              <ShoppingBag className="w-9 h-9 stroke-[1.5]" />
            </div>
            <h2 className="font-display text-3xl text-burgundy mb-3 font-semibold">Your Bag is Currently Empty</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-8 font-serif-italic">
              No artworks are currently selected. Every Vernox piece is individually crafted to architectural precision and sealed with our studio hallmark.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Link 
                to="/shop" 
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-burgundy hover:bg-burgundy-hover text-cream font-semibold px-8 py-4 rounded-full text-xs uppercase tracking-widest hover:shadow-luxe transition"
              >
                Explore Signature Collections <ArrowRight className="w-4 h-4" />
              </Link>
              <Link 
                to="/customize" 
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-burgundy/40 hover:border-burgundy text-burgundy px-8 py-4 rounded-full text-xs uppercase tracking-widest font-semibold hover:bg-burgundy/5 transition"
              >
                <Compass className="w-4 h-4 text-gold" /> Launch CAD Studio
              </Link>
            </div>

            {/* Curated Recommendations */}
            <div className="border-t border-border/80 pt-12 text-left">
              <h3 className="font-display text-xl text-oxblood-deep mb-6 font-semibold">Recommended Atelier Signatures</h3>
              <div className="grid sm:grid-cols-3 gap-6">
                {recommended.map(product => (
                  <Link 
                    key={product.id} 
                    to={`/product/${product.slug}`} 
                    className="group bg-card border border-border/70 rounded p-4 hover:border-oxblood/40 hover:shadow-soft transition block"
                  >
                    <div className="aspect-square bg-background rounded border border-border/50 mb-3 p-4 flex items-center justify-center overflow-hidden">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                      ) : (
                        <ShapeThumb shapeId={product.shapeId} finish={product.finishes[0]} className="w-full h-full" />
                      )}
                    </div>
                    <div className="font-display text-sm font-semibold text-oxblood-deep group-hover:text-brass transition truncate">
                      {product.name}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                      <span>From {storeConfig.currency}{product.price.toLocaleString()}</span>
                      <span className="text-[10px] uppercase font-semibold text-brass">View Piece →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ACTIVE CART LAYOUT */
          <div className="grid lg:grid-cols-[1fr_400px] gap-10 items-start">
            {/* LEFT COLUMN: Free Shipping Progress + Items List + Guarantees */}
            <div className="space-y-8">
              {/* Dynamic Free Shipping Progress Card */}
              <div className="bg-card border border-border/80 rounded-lg p-5 noise-overlay shadow-soft">
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-burgundy" />
                    {remainingForFreeShipping === 0 ? (
                      <span className="font-semibold text-burgundy">
                        Complimentary Worldwide Insured Delivery Unlocked
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Add <span className="font-bold text-burgundy font-mono">{storeConfig.currency}{remainingForFreeShipping.toFixed(2)}</span> more to qualify for <strong className="text-foreground">Free Insured White-Glove Shipping</strong>.
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs font-bold text-burgundy">{progressPercent}%</span>
                </div>
                <div className="w-full bg-border/60 h-2 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-burgundy via-gold to-burgundy rounded-full"
                    style={{ width: `${progressPercent}%` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground/80 mt-2">
                  <span>Standard Insured Crate</span>
                  <span>Free Insured Threshold: {storeConfig.currency}{threshold.toLocaleString()}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="bg-card border border-border/80 rounded-lg overflow-hidden noise-overlay shadow-soft divide-y divide-border/60">
                <div className="px-6 py-4 bg-muted/30 border-b border-border/70 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  <span>Commission Item</span>
                  <span>Total</span>
                </div>

                {items.map(item => (
                  <div key={item.id} className="p-6 flex flex-col sm:flex-row gap-5 items-start">
                    {/* Item Thumbnail */}
                    <div className="w-24 h-24 sm:w-28 sm:h-28 bg-background border border-border/80 rounded p-2 flex items-center justify-center shrink-0 relative group">
                      {item.customDesignThumb ? (
                        <img src={item.customDesignThumb} alt={item.productName} className="w-full h-full object-contain" />
                      ) : (
                        <ShapeThumb shapeId={item.shapeId} finish={item.finish} className="w-full h-full drop-shadow-sm" />
                      )}
                      {item.customDesignRef && (
                        <span className="absolute top-1.5 left-1.5 bg-gold text-black text-[8px] font-mono font-bold px-1.5 py-0.5 rounded shadow">
                          STUDIO CAD
                        </span>
                      )}
                    </div>

                    {/* Item Info */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link 
                            to={`/product/${item.productSlug}`} 
                            className="font-display text-lg text-burgundy font-semibold hover:text-gold transition leading-snug block"
                          >
                            {item.productName}
                          </Link>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                            <span className="capitalize font-medium text-foreground">{item.finish}</span>
                            <span>·</span>
                            <span>{item.sizeLabel}</span>
                            <span>·</span>
                            <span className="text-gold font-mono font-semibold">Solid 3.0mm Plate</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-base font-bold text-burgundy">
                            {storeConfig.currency}{(item.unitPrice * item.quantity).toFixed(2)}
                          </div>
                          {item.quantity > 1 && (
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {storeConfig.currency}{item.unitPrice.toFixed(2)} each
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Quantity & Removal Controls */}
                      <div className="flex items-center justify-between pt-3">
                        <div className="inline-flex items-center border border-border/80 rounded bg-background shadow-xs overflow-hidden">
                          <button 
                            type="button" 
                            onClick={() => updateQty(item.id, item.quantity - 1)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground active:bg-muted/80 transition"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-4 font-mono font-semibold text-xs text-foreground min-w-8 text-center">
                            {item.quantity}
                          </span>
                          <button 
                            type="button" 
                            onClick={() => updateQty(item.id, item.quantity + 1)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground active:bg-muted/80 transition"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button 
                          onClick={() => {
                            remove(item.id);
                            toast.info(`Removed ${item.productName} from order`);
                          }}
                          className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1.5 p-1.5 rounded hover:bg-muted/60 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Archival Provenance & Inclusions */}
              <div className="bg-card/60 border border-border/70 rounded-sm p-6 space-y-4">
                <div className="text-[10px] uppercase tracking-[0.24em] font-sans text-burgundy font-semibold">
                  Studio Craftsmanship & Inclusions
                </div>
                <div className="grid sm:grid-cols-3 gap-6 text-xs text-muted-foreground font-sans">
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                      Archival Crate Transit
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Custom reinforced timber crating with full transit insurance and interior foam damping.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                      Studio Hallmark
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Each piece bears a physical stamped hallmark and includes a signed Certificate of Authenticity.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                      Concealed Mounting
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      20mm machined float standoffs and a full-scale 1:1 installation template are included.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Order Summary & Checkout Action */}
            <aside className="space-y-6 sticky top-24">
              <div className="bg-card border border-border/80 rounded-lg p-6 noise-overlay shadow-luxe space-y-6">
                <div className="border-b border-border/70 pb-4">
                  <h2 className="font-display text-2xl text-burgundy font-semibold">Order Summary</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Calculated in real-time with insured transit</p>
                </div>

                {/* Promotional Code Form */}
                <form onSubmit={handleApplyPromo} className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Tag className="w-3 h-3 text-gold" />
                    <span>Collector or Trade Voucher</span>
                  </label>
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">{appliedCoupon.code}</span>
                          <span className="text-[10px] text-muted-foreground block">
                            {appliedCoupon.description || `Discount Applied: -${storeConfig.currency}${discountAmount.toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        onClick={handleRemovePromo}
                        className="text-xs text-muted-foreground hover:text-destructive underline"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="e.g. WELCOME10, ATELIER50, VERNOXVIP" 
                        value={promoCode}
                        onChange={e => setPromoCode(e.target.value)}
                        className="flex-1 bg-background border border-border rounded px-3 py-2 text-xs outline-none focus:border-burgundy font-mono uppercase"
                      />
                      <button 
                        type="submit"
                        className="bg-burgundy hover:bg-burgundy-hover text-cream text-xs px-4 py-2 rounded font-semibold uppercase tracking-wider transition"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                  {promoError && (
                    <p className="text-[10px] text-destructive">{promoError}</p>
                  )}
                </form>

                {/* Pricing Line Items */}
                <div className="space-y-3 text-xs border-t border-border/70 pt-4">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Merchandise Subtotal</span>
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {storeConfig.currency}{subtotal.toFixed(2)}
                    </span>
                  </div>

                  {appliedCoupon && discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                      <span>Privilege Discount ({appliedCoupon.code})</span>
                      <span className="font-mono">-{storeConfig.currency}{discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-muted-foreground">
                    <span className="flex items-center gap-1">
                      Insured Freight & Archival Crate
                    </span>
                    <span className="font-mono font-medium text-foreground">
                      {shipping === 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold uppercase tracking-wider text-[10px]">Complimentary</span>
                      ) : (
                        `${storeConfig.currency}${shipping.toFixed(2)}`
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-muted-foreground">
                    <span>Estimated Sales Tax / VAT ({storeConfig.taxRate}%)</span>
                    <span className="font-mono">{storeConfig.currency}{tax.toFixed(2)}</span>
                  </div>

                  <div className="border-t border-border/80 pt-4 flex justify-between items-baseline">
                    <div>
                      <span className="font-display text-lg text-burgundy font-semibold block">Total</span>
                      <span className="text-[10px] text-muted-foreground">Includes insurance, taxes & crating</span>
                    </div>
                    <span className="font-mono text-2xl font-bold text-burgundy">
                      {storeConfig.currency}{total.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Primary CTA */}
                <button 
                  type="button"
                  onClick={() => navigate('/checkout')}
                  className="w-full bg-burgundy hover:bg-burgundy-hover text-cream font-semibold py-4 rounded-[2px] hover:shadow-md active:scale-[0.99] transition text-xs uppercase tracking-[0.22em] font-sans flex items-center justify-center gap-2 shadow-sm cursor-pointer border border-transparent hover:border-dusty-pink"
                >
                  <span>PROCEED TO CHECKOUT</span>
                  <ArrowRight className="w-4 h-4 text-dusty-pink" />
                </button>

                <Link 
                  to="/shop" 
                  className="block text-center text-xs uppercase tracking-widest text-muted-foreground hover:text-burgundy font-semibold transition"
                >
                  ← Return to Atelier Collections
                </Link>

                {/* Studio Assurances Note */}
                <div className="border-t border-border/60 pt-4 text-center">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-sans">
                    Complimentary White-Glove Crated Delivery Worldwide
                  </p>
                </div>
              </div>

              {/* Atelier Concierge Live Help Callout */}
              <div className="bg-muted/40 border border-border/70 rounded-lg p-4 flex items-center gap-3">
                <div className="p-2 rounded-full bg-burgundy/10 text-burgundy shrink-0">
                  <PhoneCall className="w-4 h-4" />
                </div>
                <div className="text-xs">
                  <div className="font-semibold text-burgundy">Atelier Concierge Inquiries</div>
                  <div className="text-muted-foreground text-[11px] mt-0.5">
                    Need custom dimensions or corporate trade advice?{' '}
                    <a href="mailto:concierge@vernoxatelier.com" className="text-burgundy font-semibold hover:underline">
                      concierge@vernoxatelier.com
                    </a>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* Recently Viewed Works */}
        <RecentlyViewed className="mt-16" />
      </main>

      <SiteFooter />
    </div>
  );
}
