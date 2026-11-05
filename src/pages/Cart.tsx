import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { StoreLayout } from '@/components/shop/StoreLayout';
import { PageHeader } from '@/components/shop/PageHeader';
import { EmptyState } from '@/components/shop/StateViews';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { useCart } from '@/lib/cartContext';
import { useCatalog } from '@/lib/catalogContext';
import { finishName } from '@/lib/catalog';
import { previewCoupon } from '@/lib/data/couponPreview';
import { useSeo } from '@/lib/seo';
import { formatINR, formatINRExact } from '@/lib/storefront/format';
import { reviewStatsByProduct, sortProducts } from '@/lib/storefront/listing';

export default function Cart() {
  useSeo({ title: 'Your cart', noindex: true });
  const { storeConfig, products, reviews } = useCatalog();
  const { items, updateQty, remove, subtotal, appliedCoupon, applyCoupon, removeCoupon } = useCart();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [checking, setChecking] = useState(false);

  const threshold = storeConfig.freeShippingThreshold;
  // Same rule as the server: free shipping is judged on the merchandise subtotal before discount.
  const shipping = subtotal >= threshold ? 0 : storeConfig.shippingFee;
  const discount = appliedCoupon?.discountAmount ?? 0;
  const remaining = Math.max(0, threshold - subtotal);
  const progress = Math.min(100, Math.round((subtotal / threshold) * 100));
  const hasCustom = items.some(i => i.customDesignRef || i.productId === 'custom-bespoke');

  const bestsellers = useMemo(() => sortProducts(products, 'popular', reviewStatsByProduct(reviews)).slice(0, 4), [products, reviews]);

  const applyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    setCouponError('');
    setChecking(true);
    try {
      const result = await previewCoupon({ code: clean, items });
      if (result.isValid) {
        applyCoupon({
          code: result.couponCode || clean,
          discountAmount: result.discountAmount,
          discountType: result.discountType,
          discountValue: result.discountValue,
          description: result.description,
        });
        toast.success(`Coupon ${result.couponCode || clean} applied. You save ${formatINRExact(result.discountAmount)}`);
        setCode('');
      } else {
        setCouponError(result.error || 'This coupon code is not valid.');
      }
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : 'Could not check the coupon right now.');
    } finally {
      setChecking(false);
    }
  };

  if (items.length === 0) {
    return (
      <StoreLayout>
        <div className="container py-6 sm:py-10">
          <PageHeader title="Your cart" crumbs={[{ label: 'Cart' }]} />
          <EmptyState title="Your cart is empty" action={{ label: 'Shop designs', to: '/shop' }} />
          {bestsellers.length > 0 && <div className="mt-10"><h2 className="section-title mb-4">Bestsellers</h2><ProductGrid products={bestsellers} /></div>}
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="container py-6 sm:py-10">
        <PageHeader title={`Your cart (${items.reduce((n, i) => n + i.quantity, 0)})`} crumbs={[{ label: 'Cart' }]} />

        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <section aria-label="Cart items" className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm">
                {remaining > 0
                  ? <>Add <strong>{formatINR(remaining)}</strong> more for free shipping.</>
                  : <strong className="text-emerald-800">You have free shipping.</strong>}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to free shipping">
                <div className="h-full bg-brass" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {items.map(item => (
                <li key={item.id} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center wall-tile rounded p-3">
                    {item.customDesignThumb
                      ? <img src={item.customDesignThumb} alt={`${item.productName} preview`} className="h-full w-full object-contain" />
                      : <ShapeThumb shapeId={item.shapeId} finish={item.finish} name={item.productName} className="h-full w-full" />}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link to={`/product/${item.productSlug}`} className="font-medium hover:text-burgundy">{item.productName}</Link>
                    <p className="text-sm text-muted-foreground">{item.sizeLabel} · {finishName(item.finish)}</p>
                    <p className="text-sm text-muted-foreground">{formatINR(item.unitPrice)} each, excl. GST</p>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center rounded-md border border-border" role="group" aria-label={`Quantity of ${item.productName}`}>
                        <button type="button" aria-label="Decrease quantity" onClick={() => updateQty(item.id, item.quantity - 1)} disabled={item.quantity <= 1} className="flex h-10 w-10 items-center justify-center disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                        <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{item.quantity}</span>
                        <button type="button" aria-label="Increase quantity" onClick={() => updateQty(item.id, item.quantity + 1)} className="flex h-10 w-10 items-center justify-center"><Plus className="h-4 w-4" /></button>
                      </div>
                      <p className="font-semibold">{formatINR(item.unitPrice * item.quantity)}</p>
                      <button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.productName}`} className="flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <aside aria-label="Order summary" className="h-fit space-y-4 rounded-lg border border-border bg-card p-4 lg:sticky lg:top-40">
            <h2 className="font-display text-2xl">Order summary</h2>

            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-md bg-secondary p-3 text-sm">
                <span><strong>{appliedCoupon.code}</strong> applied</span>
                <button type="button" onClick={() => { removeCoupon(); toast.info('Coupon removed.'); }} className="font-semibold text-burgundy hover:underline">Remove</button>
              </div>
            ) : (
              <form onSubmit={applyCode} className="space-y-1">
                <label htmlFor="coupon" className="text-sm font-semibold">Have a coupon?</label>
                <div className="flex gap-2">
                  <input id="coupon" value={code} onChange={e => setCode(e.target.value)} placeholder="Enter code" className="field uppercase" autoComplete="off" />
                  <button type="submit" disabled={checking} className="btn-secondary">{checking ? 'Checking' : 'Apply'}</button>
                </div>
                {couponError && <p role="alert" className="text-sm text-destructive">{couponError}</p>}
              </form>
            )}

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(subtotal)}</dd></div>
              {discount > 0 && <div className="flex justify-between text-emerald-800"><dt>Discount</dt><dd>-{formatINRExact(discount)}</dd></div>}
              <div className="flex justify-between"><dt>Shipping</dt><dd>{shipping === 0 ? 'Free' : formatINR(shipping)}</dd></div>
              <div className="flex justify-between text-muted-foreground"><dt>GST</dt><dd>Calculated at checkout</dd></div>
            </dl>

            <button type="button" onClick={() => navigate('/checkout')} className="btn-primary w-full">Proceed to checkout</button>

            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Truck className="h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
              {hasCustom ? 'Custom Studio pieces are prepaid.' : 'Cash on delivery available.'}
            </p>
          </aside>
        </div>
      </div>
    </StoreLayout>
  );
}
