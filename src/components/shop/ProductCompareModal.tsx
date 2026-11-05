import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Product } from '@/lib/catalog';
import { useCatalog } from '@/lib/catalogContext';
import { useCart } from '@/lib/cartContext';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { X, Check, ShoppingBag, ArrowRight, Layers, Ruler, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productsToCompare: Product[];
  onRemoveProduct: (productId: string) => void;
  onClearAll: () => void;
}

export function ProductCompareModal({
  open,
  onOpenChange,
  productsToCompare,
  onRemoveProduct,
  onClearAll,
}: Props) {
  const { storeConfig } = useCatalog();
  const { add } = useCart();

  if (productsToCompare.length === 0) {
    return null;
  }

  const handleAddToCart = (product: Product) => {
    const size = product.sizes?.[0];
    add({
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      shapeId: product.shapeId || 'rectangle',
      sizeLabel: size?.label ?? 'Standard',
      widthMm: size?.widthMm ?? 800,
      heightMm: size?.heightMm ?? 800,
      finish: product.finishes[0] || 'brass',
      unitPrice: product.price + (size?.priceDelta ?? 0),
      quantity: 1,
    });
    toast.success(`${product.name} added to your cart.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-cream border border-[#E0D7C6] text-dark-brown p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-[#EBE4D6] pb-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-[0.24em] text-gold font-sans font-semibold">
                Atelier Architectural Comparison
              </span>
              <DialogTitle className="font-editorial text-2xl sm:text-3xl text-dark-brown mt-0.5">
                Compare Masterworks ({productsToCompare.length} Selected)
              </DialogTitle>
            </div>

            {productsToCompare.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs uppercase tracking-wider text-burgundy hover:text-burgundy-hover underline font-sans cursor-pointer"
              >
                Clear Comparison
              </button>
            )}
          </div>
          <DialogDescription className="text-xs text-dark-brown/60 font-sans">
            Evaluate scale, metallurgy, finish options, and mounting specifications side-by-side.
          </DialogDescription>
        </DialogHeader>

        <div className="pt-6 overflow-x-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 min-w-[580px]">
            {productsToCompare.map(p => (
              <div
                key={p.id}
                className="bg-white rounded-md border border-[#E8E1D3] p-5 flex flex-col justify-between shadow-2xs relative"
              >
                <button
                  type="button"
                  onClick={() => onRemoveProduct(p.id)}
                  className="absolute top-3 right-3 p-1 rounded-full bg-cream text-dark-brown/60 hover:text-dark-brown hover:bg-cream/80 transition-colors cursor-pointer"
                  title="Remove from comparison"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <div>
                  {/* Thumbnail */}
                  <div className="aspect-square bg-cream/40 rounded-sm overflow-hidden mb-4 relative flex items-center justify-center">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-28 h-28">
                        <ShapeThumb shapeId={p.shapeId || 'shield'} finish={p.finishes[0] || 'brass'} className="w-full h-full" />
                      </div>
                    )}
                  </div>

                  <span className="text-[9px] uppercase tracking-[0.2em] text-dark-brown/50 font-sans block">
                    {p.category.replace('-', ' ')}
                  </span>
                  <h4 className="font-editorial text-lg text-dark-brown font-medium leading-snug">
                    {p.name}
                  </h4>
                  <div className="font-mono text-sm font-bold text-burgundy mt-1">
                    {storeConfig.currency} {p.price.toLocaleString()}
                  </div>

                  {/* Comparison Metrics */}
                  <div className="mt-5 space-y-3.5 pt-4 border-t border-[#EBE4D6] text-xs font-sans">
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-dark-brown/50 block">
                        Alloy & Plate Thickness
                      </span>
                      <strong className="text-dark-brown">3.0mm Solid Plate</strong>
                      <span className="text-[11px] text-dark-brown/60 block mt-0.5">
                        {p.alloySpec || 'Structural Mild Steel / CZ108 Brass'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-dark-brown/50 block">
                        Standard Sizing
                      </span>
                      <strong className="text-dark-brown">
                        {p.sizes && p.sizes.length > 0 ? `${p.sizes.length} Curated Sizes` : 'Bespoke Scalable'}
                      </strong>
                      <span className="text-[11px] text-dark-brown/60 block mt-0.5">
                        {p.sizes?.[0]?.label || '90 × 50 cm standard'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-dark-brown/50 block">
                        Available Finishes ({p.finishes.length})
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.finishes.map(f => (
                          <span key={f} className="px-2 py-0.5 rounded-2xs bg-cream text-[10px] text-dark-brown capitalize border border-[#E0D7C6]">
                            {f.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-dark-brown/50 block">
                        Wall Floating Clearance
                      </span>
                      <span className="text-dark-brown font-semibold">20mm Standoff Gap</span>
                      <span className="text-[11px] text-dark-brown/60 block mt-0.5">
                        Ambient shadow-profile projection
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-dark-brown/50 block">
                        Transit Crating
                      </span>
                      <span className="text-dark-brown font-semibold">Reinforced Timber Crate</span>
                      <span className="text-[11px] text-dark-brown/60 block mt-0.5">
                        100% Insured DHL Courier
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-6 mt-6 border-t border-[#EBE4D6] space-y-2">
                  <button
                    type="button"
                    onClick={() => handleAddToCart(p)}
                    className="w-full btn-burgundy text-[11px] uppercase tracking-[0.18em] py-2.5 font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-gold" />
                    <span>Add to Cart</span>
                  </button>

                  <Link
                    to={`/product/${p.slug}`}
                    onClick={() => onOpenChange(false)}
                    className="w-full text-center block text-[11px] uppercase tracking-[0.16em] text-dark-brown hover:text-burgundy font-semibold py-1.5 transition-colors"
                  >
                    View Product Details →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
