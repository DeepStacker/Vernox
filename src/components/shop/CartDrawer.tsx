import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '@/lib/cartContext';
import { useCatalog } from '@/lib/catalogContext';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { X, Plus, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export function CartDrawer() {
  const { items, updateQty, remove, subtotal, isDrawerOpen, setDrawerOpen, appliedCoupon } = useCart();
  const { storeConfig } = useCatalog();
  const navigate = useNavigate();

  const threshold = storeConfig.freeShippingThreshold || 5000;
  const shipping = subtotal >= threshold || subtotal === 0 ? 0 : storeConfig.shippingFee;
  const discount = appliedCoupon ? appliedCoupon.discountAmount : 0;
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = discountedSubtotal * (storeConfig.gstRatePercent / 100);
  const total = discountedSubtotal + shipping + tax;

  const handleCheckoutClick = () => {
    setDrawerOpen(false);
    navigate('/checkout');
  };

  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          {/* BACKDROP OVERLAY */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 bg-[#0E0B0A]/60 backdrop-blur-sm z-[9998] cursor-pointer"
          />

          {/* ATELIER SLIDE-OUT DRAWER */}
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 260 }}
            className="fixed right-0 top-0 bottom-0 w-[70vw] min-w-[260px] max-w-[360px] sm:w-[460px] sm:max-w-none bg-[#FAF8F5] text-[#332522] border-l border-[#E5DDD0] shadow-[-16px_0_40px_rgba(28,20,18,0.18)] z-[9999] flex flex-col noise-overlay"
          >
            {/* ATELIER HEADER */}
            <div className="px-5 sm:px-8 py-5 sm:py-6 border-b border-[#E8E1D5] flex items-center justify-between bg-[#FAF8F5]/95 backdrop-blur-md shrink-0">
              <div>
                <div className="flex items-baseline gap-2">
                  <h2 className="font-brand text-xs sm:text-sm tracking-[0.28em] text-[#332522] uppercase font-medium">
                    The Bag
                  </h2>
                  <span className="font-mono text-[10px] text-burgundy tracking-normal">
                    [{totalCount.toString().padStart(2, '0')}]
                  </span>
                </div>
                <p className="font-serif-italic text-[11px] text-[#7A6A65] mt-0.5 tracking-wide">
                  Antwerp Studio Archive
                </p>
              </div>

              <button 
                onClick={() => setDrawerOpen(false)}
                className="group flex items-center gap-1.5 text-[#7A6A65] hover:text-[#332522] transition-colors py-1 pl-2 -mr-1"
                aria-label="Close cart drawer"
              >
                <span className="text-[9px] uppercase tracking-[0.2em] font-sans font-medium hidden sm:inline opacity-70 group-hover:opacity-100">
                  Close
                </span>
                <X className="w-4 h-4 stroke-[1.5] group-hover:rotate-90 transition-transform duration-300" />
              </button>
            </div>

            {/* CURATORIAL NOTICE */}
            {items.length > 0 && (
              <div className="px-5 sm:px-8 py-2 bg-[#F3ECE0]/70 border-b border-[#E8E1D5] flex items-center justify-between text-[8.5px] sm:text-[9.5px] uppercase tracking-[0.22em] text-[#7A6A65] font-sans shrink-0">
                <span className="truncate">Laser-Sculpted to Order</span>
                <span className="font-mono text-[8.5px] text-[#9A877E] shrink-0">Crated Transit</span>
              </div>
            )}

            {/* DRAWER BODY */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-4 sm:py-6 divide-y divide-[#EDE5D8]">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 space-y-5">
                  <div className="w-12 h-12 rounded-full border border-[#D5C9B8] flex items-center justify-center text-[#7A6A65]">
                    <span className="font-brand text-xs tracking-widest text-[#7A6A65]">VX</span>
                  </div>
                  <div className="space-y-1.5 max-w-[240px]">
                    <p className="font-brand text-xs sm:text-sm tracking-[0.24em] uppercase text-[#332522] font-medium">
                      Collection Empty
                    </p>
                    <p className="font-serif-italic text-xs text-[#7A6A65] leading-relaxed">
                      "Every piece is an individual study in metallurgy, geometry, and ambient light."
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setDrawerOpen(false);
                      navigate('/shop');
                    }}
                    className="border border-[#332522] text-[#332522] hover:bg-[#332522] hover:text-[#FAF8F5] text-[9.5px] uppercase tracking-[0.24em] px-6 py-2.5 transition-all duration-300 font-sans font-medium mt-2"
                  >
                    Discover Works
                  </button>
                </div>
              ) : (
                items.map((item, idx) => (
                  <div key={item.id} className={`py-4 sm:py-5 ${idx === 0 ? 'pt-0' : ''}`}>
                    <div className="flex gap-3.5 sm:gap-4 items-start">
                      {/* Framed Mat Artwork Thumbnail */}
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#EFE9DF] border border-[#DDD3C3] p-1.5 shrink-0 flex items-center justify-center relative overflow-hidden shadow-xs">
                        {item.customDesignThumb ? (
                          <img src={item.customDesignThumb} alt={item.productName} className="w-full h-full object-contain" />
                        ) : (
                          <ShapeThumb shapeId={item.shapeId} finish={item.finish} className="w-full h-full" />
                        )}
                        {item.customDesignRef && (
                          <span className="absolute top-1 left-1 bg-[#332522] text-[#FAF8F5] text-[6.5px] font-mono px-1 py-0.5 tracking-wider uppercase">
                            CAD
                          </span>
                        )}
                      </div>

                      {/* Item Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1.5">
                          <Link 
                            to={`/product/${item.productSlug}`} 
                            onClick={() => setDrawerOpen(false)}
                            className="font-serif text-sm sm:text-base text-[#2E2421] hover:text-burgundy transition font-normal leading-snug line-clamp-2"
                          >
                            {item.productName}
                          </Link>
                          <span className="font-mono text-xs sm:text-sm font-medium text-[#2E2421] shrink-0">
                            {storeConfig.currency}{(item.unitPrice * item.quantity).toFixed(2)}
                          </span>
                        </div>

                        <p className="text-[10px] text-[#7A6A65] tracking-wide mt-1 uppercase font-sans truncate">
                          {item.finish} <span className="opacity-40">/</span> {item.sizeLabel}
                        </p>

                        {/* Quiet Stepper & Remove */}
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#EFE8DC]/80">
                          <div className="flex items-center gap-1.5 text-xs text-[#332522]">
                            <button 
                              type="button" 
                              onClick={() => updateQty(item.id, item.quantity - 1)}
                              className="w-5 h-5 flex items-center justify-center text-[#7A6A65] hover:text-[#332522] hover:bg-[#EFE9DF] transition-colors rounded-xs"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-2.5 h-2.5 stroke-[1.5]" />
                            </button>
                            <span className="font-mono text-[11px] text-[#332522] min-w-[14px] text-center">
                              {item.quantity}
                            </span>
                            <button 
                              type="button" 
                              onClick={() => updateQty(item.id, item.quantity + 1)}
                              className="w-5 h-5 flex items-center justify-center text-[#7A6A65] hover:text-[#332522] hover:bg-[#EFE9DF] transition-colors rounded-xs"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-2.5 h-2.5 stroke-[1.5]" />
                            </button>
                          </div>

                          <button 
                            onClick={() => {
                              remove(item.id);
                              toast.info(`Removed ${item.productName}`);
                            }}
                            className="text-[9.5px] uppercase tracking-[0.2em] font-sans text-[#968680] hover:text-burgundy transition-colors underline-offset-4 hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ATELIER FOOTER */}
            {items.length > 0 && (
              <div className="p-5 sm:p-7 border-t border-[#E8E1D5] bg-[#FAF8F5] space-y-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] shrink-0">
                {/* Summary */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-[#7A6A65] text-[11px] font-sans">
                    <span>Subtotal</span>
                    <span className="font-mono text-[#332522]">{storeConfig.currency}{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#7A6A65] text-[11px] font-sans">
                    <span>Insured Crate Transit</span>
                    <span className="text-[#332522] text-[10px] uppercase tracking-wider font-medium">
                      {shipping === 0 ? 'Complimentary' : `${storeConfig.currency}${shipping.toFixed(2)}`}
                    </span>
                  </div>
                  {appliedCoupon && discount > 0 && (
                    <div className="flex justify-between text-emerald-700 text-[11px] font-sans font-medium">
                      <span>Privilege Discount ({appliedCoupon.code})</span>
                      <span className="font-mono">-{storeConfig.currency}{discount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex items-baseline justify-between pt-3 border-t border-[#E8E1D5]">
                    <div className="flex flex-col">
                      <span className="font-brand text-[10px] tracking-[0.22em] uppercase text-[#332522]">Total</span>
                      <span className="font-serif-italic text-[10.5px] text-[#7A6A65]">Including tax & custom crating</span>
                    </div>
                    <span className="font-mono text-base sm:text-lg font-medium text-[#332522]">
                      {storeConfig.currency}{total.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Primary Checkout Action */}
                <div className="space-y-2.5 pt-1">
                  <button 
                    type="button"
                    onClick={handleCheckoutClick}
                    className="w-full bg-[#332522] hover:bg-[#1E1513] text-[#FAF8F5] py-3.5 sm:py-4 px-4 transition-all duration-300 text-[10.5px] sm:text-[11px] uppercase tracking-[0.26em] font-sans font-medium flex items-center justify-between group shadow-sm active:scale-[0.99] cursor-pointer"
                  >
                    <span>Proceed to Checkout</span>
                    <span className="font-mono text-[11px] font-normal text-[#D5C9B8] group-hover:translate-x-0.5 transition-transform">
                      →
                    </span>
                  </button>

                  <Link 
                    to="/cart" 
                    onClick={() => setDrawerOpen(false)}
                    className="block text-center text-[9.5px] uppercase tracking-[0.22em] text-[#7A6A65] hover:text-[#332522] transition-colors py-1"
                  >
                    View Full Atelier Bag
                  </Link>
                </div>

                {/* Studio Dispatch Seal */}
                <div className="pt-1 text-center">
                  <p className="text-[8.5px] sm:text-[9px] uppercase tracking-[0.24em] text-[#9E9089] font-sans">
                    Antwerp Studio · Insured Crate Transit
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
