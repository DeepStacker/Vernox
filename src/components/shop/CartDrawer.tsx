import { Link, useNavigate } from 'react-router-dom';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCart } from '@/lib/cartContext';
import { finishName } from '@/lib/catalog';
import { formatINR } from '@/lib/storefront/format';

/** Mini cart shown after "Add to cart". Totals that depend on tax and shipping are on the cart and checkout pages. */
export function CartDrawer() {
  const { items, subtotal, count, isDrawerOpen, setDrawerOpen } = useCart();
  const navigate = useNavigate();
  const go = (to: string) => { setDrawerOpen(false); navigate(to); };

  return (
    <Sheet open={isDrawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent side="right" className="flex w-[92vw] max-w-md flex-col bg-background p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="font-display text-2xl">Your cart ({count})</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-muted-foreground">Your cart is empty.</p>
            <Link to="/shop" onClick={() => setDrawerOpen(false)} className="btn-primary">Browse designs</Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-border overflow-y-auto px-4">
              {items.map(item => (
                <li key={item.id} className="flex gap-3 py-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-[#EFE8DD] p-2">
                    {item.customDesignThumb
                      ? <img src={item.customDesignThumb} alt="" className="h-full w-full object-contain" />
                      : <ShapeThumb shapeId={item.shapeId} finish={item.finish} className="h-full w-full" />}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <Link to={`/product/${item.productSlug}`} onClick={() => setDrawerOpen(false)} className="block truncate font-medium hover:text-burgundy">{item.productName}</Link>
                    <p className="text-xs text-muted-foreground">{item.sizeLabel} · {finishName(item.finish)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Qty {item.quantity} × {formatINR(item.unitPrice)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="space-y-3 border-t border-border p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Subtotal (excl. GST)</span>
                <span className="text-lg font-semibold">{formatINR(subtotal)}</span>
              </div>
              <button type="button" onClick={() => go('/checkout')} className="btn-primary w-full">Checkout</button>
              <button type="button" onClick={() => go('/cart')} className="btn-secondary w-full">View cart</button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
