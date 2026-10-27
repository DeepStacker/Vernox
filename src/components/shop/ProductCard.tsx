import { Link } from 'react-router-dom';
import { Product } from '@/lib/catalog';
import { useCart } from '@/lib/cartContext';
import { ShoppingBag, Heart, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { useCatalog } from '@/lib/catalogContext';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  compact?: boolean;
  onToggleCompare?: (product: Product) => void;
  isComparing?: boolean;
}

export function ProductCard({ product, compact, onToggleCompare, isComparing }: ProductCardProps) {
  const { add } = useCart();
  const { wishlist, toggleWishlist, storeConfig } = useCatalog();

  const isWishlisted = wishlist.includes(product.id);
  const defaultSize = product.sizes?.[0] || { label: 'Standard', widthMm: 800, heightMm: 800, priceDelta: 0 };
  const price = product.price;
  const currencySymbol = (storeConfig?.currency && storeConfig.currency !== '$') ? storeConfig.currency : '₹';

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    add({
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      shapeId: product.shapeId || 'rectangle',
      sizeLabel: defaultSize.label,
      widthMm: defaultSize.widthMm,
      heightMm: defaultSize.heightMm,
      finish: product.finishes?.[0] || 'gold',
      unitPrice: price,
      quantity: 1,
    });

    toast.success(`${product.name} added to your cart`, {
      description: 'Handcrafted piece reserved in your bag.',
    });
  };

  const formattedCategory = product.category
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="group relative flex flex-col bg-white border border-[#EBE4D6] rounded-[2px] transition-all duration-300 hover:border-gold/50 hover:shadow-xs min-w-0 w-full overflow-hidden">
      {/* Product Image Area */}
      <div className="relative aspect-[4/5] bg-[#FAF8F5] overflow-hidden">
        <Link to={`/product/${product.slug}`} className="block w-full h-full">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            loading="lazy"
          />
        </Link>

        {/* Compare Button (Top-Right beside wishlist) */}
        {onToggleCompare && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleCompare(product);
            }}
            className={cn(
              "absolute z-10 rounded-full border transition-all duration-200 cursor-pointer shadow-xs flex items-center justify-center",
              compact
                ? "top-1.5 right-8 w-6 h-6"
                : "top-2 right-10 sm:top-3.5 sm:right-13 w-7 h-7 sm:w-8 sm:h-8",
              isComparing
                ? "bg-burgundy text-cream border-burgundy shadow-sm"
                : "bg-white/90 backdrop-blur-xs border-[#EBE4D6] text-dark-brown/70 hover:text-burgundy hover:border-burgundy/30"
            )}
            title={isComparing ? "Remove from comparison" : "Compare this piece"}
            aria-label="Compare"
          >
            <Layers className={cn(compact ? "w-3 h-3" : "w-3.5 h-3.5")} />
          </button>
        )}

        {/* Wishlist Button (Top-Right) */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist(product.id);
          }}
          className={cn(
            "absolute z-10 rounded-full bg-white/90 backdrop-blur-xs border border-[#EBE4D6] flex items-center justify-center text-dark-brown hover:text-burgundy hover:border-burgundy/30 transition-all duration-200 cursor-pointer shadow-xs",
            compact
              ? "top-1.5 right-1.5 w-6 h-6"
              : "top-2 right-2 sm:top-3.5 sm:right-3.5 w-7 h-7 sm:w-8 sm:h-8"
          )}
          title={isWishlisted ? "Remove from Wishlist" : "Save to Wishlist"}
          aria-label="Wishlist"
        >
          <Heart
            className={cn(
              "transition-colors duration-200",
              compact ? "w-3 h-3" : "w-3.5 h-3.5",
              isWishlisted ? 'fill-burgundy text-burgundy' : 'text-dark-brown'
            )}
          />
        </button>

        {/* Subtle Badge (Top-Left) if Bestseller or New */}
        {(product.bestseller || product.isNew) && (
          <div className={cn("absolute z-10", compact ? "top-1.5 left-1.5" : "top-2 left-2 sm:top-3.5 sm:left-3.5")}>
            <span className={cn(
              "uppercase tracking-[0.2em] font-sans font-medium rounded-[1px] bg-burgundy text-cream border border-dusty-pink/40 shadow-xs",
              compact ? "text-[6.5px] px-1 py-0.2" : "text-[7.5px] sm:text-[8px] px-1.5 py-0.5 sm:px-2"
            )}>
              {product.isNew ? 'New' : 'Curated'}
            </span>
          </div>
        )}

        {/* Desktop Only: Slide-Up Add to Cart Button on Mouse Hover (Pure CSS, never sticks on mobile) */}
        <div className="hidden md:block absolute bottom-0 inset-x-0 p-2 sm:p-3 transition-all duration-300 ease-out z-20 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 pointer-events-none group-hover:pointer-events-auto">
          <button
            type="button"
            onClick={handleQuickAdd}
            className="w-full py-2 sm:py-2.5 px-2 sm:px-4 rounded-[2px] bg-burgundy hover:bg-burgundy-hover text-cream text-[9px] sm:text-[10px] uppercase tracking-[0.2em] font-sans font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm border border-transparent hover:border-dusty-pink"
          >
            <ShoppingBag className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-dusty-pink" />
            <span>Add to Cart</span>
          </button>
        </div>
      </div>

      {/* Product Details Area */}
      <div className={cn(
        "flex flex-col flex-1 justify-between bg-white",
        compact ? "p-2 sm:p-2.5" : "p-2.5 sm:p-4 md:p-5"
      )}>
        <div>
          {/* Category */}
          <div className={cn(
            "uppercase tracking-[0.22em] text-burgundy font-sans font-medium mb-1 truncate",
            compact ? "text-[7.5px]" : "text-[8px] sm:text-[9px]"
          )}>
            {formattedCategory}
          </div>

          {/* Product Name */}
          <Link
            to={`/product/${product.slug}`}
            className={cn(
              "font-editorial text-dark-brown hover:text-burgundy transition-colors leading-snug line-clamp-1 block font-normal",
              compact ? "text-xs sm:text-sm" : "text-sm sm:text-base md:text-lg"
            )}
          >
            {product.name}
          </Link>
        </div>

        {/* Price & Quick Actions */}
        <div className={cn(
          "border-t border-[#F2ECE1] flex items-center justify-between",
          compact ? "mt-1.5 pt-1.5" : "mt-2 sm:mt-3 pt-2 sm:pt-3"
        )}>
          <span className={cn(
            "font-sans font-medium text-dark-brown",
            compact ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm"
          )}>
            {currencySymbol}{price.toLocaleString()}
          </span>

          <div className="flex items-center gap-2">
            {/* Mobile quick-add button (Clean footer placement, never blocks artwork) */}
            <button
              type="button"
              onClick={handleQuickAdd}
              className="md:hidden flex items-center justify-center w-6 h-6 rounded-[2px] bg-[#FAF8F5] text-burgundy hover:bg-burgundy hover:text-white border border-[#EBE4D6] transition-colors cursor-pointer"
              title="Add to Cart"
              aria-label="Add to Cart"
            >
              <ShoppingBag className="w-3 h-3" />
            </button>

            <Link
              to={`/product/${product.slug}`}
              className={cn(
                "uppercase tracking-[0.18em] text-burgundy hover:text-dusty-pink transition-colors font-sans font-medium",
                compact ? "text-[8px]" : "text-[9px] sm:text-[10px]"
              )}
            >
              Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}