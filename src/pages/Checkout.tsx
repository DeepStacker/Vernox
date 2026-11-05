import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Phone, Tag, ShieldCheck } from 'lucide-react';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { useCart } from '@/lib/cartContext';
import { useCatalog } from '@/lib/catalogContext';
import { useAuth } from '@/lib/auth/AuthProvider';
import { trackStoreEvent } from '@/lib/storeAnalytics';
import { previewCoupon } from '@/lib/data/couponPreview';
import {
  CheckoutError, createCheckoutIntent, openRazorpay, verifyPayment,
  type CheckoutCustomer, type CheckoutIntent,
} from '@/lib/checkout/checkoutApi';
import {
  INDIAN_STATES_AND_UTS, normalizeIndianMobile, validateAddress, type AddressErrors, type AddressForm,
} from '@/lib/checkout/validation';

const inputClass =
  'w-full bg-background border border-border rounded px-4 py-2.5 text-sm outline-none focus:border-burgundy transition';
const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1';

type Phase = 'details' | 'creating' | 'ready' | 'paying' | 'verifying';

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-[11px] text-destructive mt-1" role="alert">{message}</p> : null;
}

export default function Checkout() {
  const {
    items, subtotal, clear,
    appliedCoupon: cartCoupon, applyCoupon: cartApplyCoupon, removeCoupon: cartRemoveCoupon,
  } = useCart();
  const { storeConfig } = useCatalog();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const currency = storeConfig.currency;

  const [form, setForm] = useState<AddressForm>({
    name: '', email: '', phone: '', address: '', city: '', state: '', pincode: '', country: 'India',
  });
  const [errors, setErrors] = useState<AddressErrors>({});
  const prefilled = useRef(false);

  // Prefill once from the signed-in customer's profile; never overwrite what they have typed.
  useEffect(() => {
    if (!profile || prefilled.current) return;
    prefilled.current = true;
    setForm(prev => ({
      name: prev.name || profile.name || '',
      email: prev.email || profile.email || '',
      phone: prev.phone || profile.phone || '',
      address: prev.address || profile.address || '',
      city: prev.city || profile.city || '',
      state: prev.state || profile.state || '',
      pincode: prev.pincode || profile.pincode || '',
      country: 'India',
    }));
  }, [profile]);

  useEffect(() => { trackStoreEvent('checkout'); }, []);

  // Coupon (validated by the server; the discount shown after "Continue" is the server's)
  const [couponInput, setCouponInput] = useState('');
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const couponCode = cartCoupon?.code;

  const applyCouponCode = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCheckingCoupon(true);
    try {
      const result = await previewCoupon({ code, subtotal, items, email: form.email.trim() });
      if (result.isValid && result.couponCode) {
        cartApplyCoupon({
          code: result.couponCode,
          discountAmount: result.discountAmount,
          description: result.description,
          discountType: result.discountType,
          discountValue: result.discountValue,
        });
        setCouponInput('');
        toast.success(`Coupon ${result.couponCode} will be applied to your order.`);
      } else {
        toast.error(result.error || 'This coupon cannot be applied.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not check the coupon right now.');
    } finally {
      setCheckingCoupon(false);
    }
  };

  // One checkout attempt = one idempotency key + one server order. Any change to what is being
  // bought or where it ships invalidates the attempt and starts a new one.
  const [phase, setPhase] = useState<Phase>('details');
  const [intent, setIntent] = useState<CheckoutIntent | null>(null);
  const [intentFingerprint, setIntentFingerprint] = useState('');
  const idempotencyKey = useRef(crypto.randomUUID());

  const customer: CheckoutCustomer = useMemo(() => ({
    email: form.email.trim().toLowerCase(),
    name: form.name.trim(),
    phone: normalizeIndianMobile(form.phone) ?? form.phone.trim(),
    address: form.address.trim(),
    city: form.city.trim(),
    state: form.state,
    pincode: form.pincode.trim(),
    country: 'India',
  }), [form]);

  const fingerprint = useMemo(
    () => JSON.stringify({ customer, couponCode, items: items.map(i => [i.productId, i.sizeLabel, i.finish, i.quantity, i.customDesignRef]) }),
    [customer, couponCode, items],
  );
  const intentIsCurrent = intent !== null && fingerprint === intentFingerprint;

  useEffect(() => {
    if (intent && !intentIsCurrent && phase === 'ready') {
      setIntent(null);
      setPhase('details');
      idempotencyKey.current = crypto.randomUUID();
    }
  }, [intent, intentIsCurrent, phase]);

  const activeIntent = intentIsCurrent ? intent : null;
  const pricing = activeIntent?.pricing ?? null;

  const describeError = (err: unknown): string => {
    if (err instanceof CheckoutError) {
      switch (err.code) {
        case 'INSUFFICIENT_STOCK': return `Some items are no longer available in the requested quantity. ${err.message}`;
        case 'INVALID_ITEM': return `An item in your cart is no longer available. ${err.message}`;
        case 'INVALID_COUPON': return `Coupon problem: ${err.message}`;
        default: return err.message;
      }
    }
    return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) { toast.error('Your cart is empty.'); return; }
    const found = validateAddress(form);
    setErrors(found);
    if (Object.keys(found).length > 0) { toast.error('Please correct the highlighted fields.'); return; }

    setPhase('creating');
    try {
      const created = await createCheckoutIntent({ items, couponCode, idempotencyKey: idempotencyKey.current, customer });
      setIntent(created);
      setIntentFingerprint(fingerprint);
      setPhase('ready');
      toast.success('Order total confirmed. Review it and pay to place your order.');
    } catch (err) {
      setPhase('details');
      toast.error(describeError(err));
      if (err instanceof CheckoutError && err.code === 'INVALID_COUPON') cartRemoveCoupon();
    }
  };

  const handlePay = async () => {
    if (!intent || !intentIsCurrent) return;
    setPhase('paying');
    try {
      const outcome = await openRazorpay(intent, {
        storeName: storeConfig.storeName,
        description: items.length === 1 ? items[0].productName : `${items.length} items`,
        customer,
        themeColor: '#5B262C',
        onPaymentFailed: message => toast.error(`${message} You can try again in the payment window.`),
      });
      if (outcome.kind === 'dismissed') {
        setPhase('ready');
        toast.info('Payment window closed. Your order is saved as pending; press Pay to try again.');
        return;
      }
      setPhase('verifying');
      const verified = await verifyPayment(outcome.payment);
      trackStoreEvent('purchase', { orderId: verified.orderId, orderTotal: intent.pricing.total });
      clear();
      toast.success('Payment received. Your order is confirmed.');
      navigate(`/order-confirmation/${verified.orderId}?email=${encodeURIComponent(customer.email)}`);
    } catch (err) {
      // Money may have moved: say so explicitly rather than implying nothing happened.
      setPhase('ready');
      toast.error(`${describeError(err)} If you were charged, contact support with order ${intent.orderNumber}.`);
    }
  };

  const busy = phase === 'creating' || phase === 'paying' || phase === 'verifying';
  const set = (key: keyof AddressForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));
  const money = (n: number) => `${currency}${n.toFixed(2)}`;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-14 w-full grid lg:grid-cols-[1.1fr_400px] gap-10 flex-1">
        <form onSubmit={handleContinue} className="space-y-8" noValidate>
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
              <Link to="/cart" className="hover:text-burgundy transition">Cart</Link>
              <span>/</span>
              <span className="text-burgundy font-semibold">Secure Checkout</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl text-burgundy leading-tight font-semibold">Checkout</h1>
            <p className="text-muted-foreground text-xs mt-1">
              Delivery within India. Your final total is confirmed by our server before you pay.
            </p>
          </div>

          <div className="bg-card border border-border/70 rounded-lg p-5 shadow-soft space-y-4">
            <h2 className="font-display text-lg text-burgundy font-semibold border-b border-border/60 pb-2">Contact and delivery</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="co-name">Full name</label>
                <input id="co-name" autoComplete="name" value={form.name} onChange={set('name')} className={inputClass} />
                <FieldError message={errors.name} />
              </div>
              <div>
                <label className={labelClass} htmlFor="co-phone">Mobile number</label>
                <input id="co-phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile number"
                  value={form.phone} onChange={set('phone')} className={inputClass} />
                <FieldError message={errors.phone} />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="co-email">Email (order updates and tracking)</label>
              <input id="co-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} className={inputClass} />
              <FieldError message={errors.email} />
            </div>

            <div>
              <label className={labelClass} htmlFor="co-address">Address (house, street, area)</label>
              <input id="co-address" autoComplete="street-address" value={form.address} onChange={set('address')} className={inputClass} />
              <FieldError message={errors.address} />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="co-city">City</label>
                <input id="co-city" autoComplete="address-level2" value={form.city} onChange={set('city')} className={inputClass} />
                <FieldError message={errors.city} />
              </div>
              <div>
                <label className={labelClass} htmlFor="co-state">State / UT</label>
                <select id="co-state" autoComplete="address-level1" value={form.state} onChange={set('state')} className={inputClass}>
                  <option value="">Select state</option>
                  {INDIAN_STATES_AND_UTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <FieldError message={errors.state} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="co-pincode">Pincode</label>
                <input id="co-pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={form.pincode} onChange={set('pincode')} className={inputClass} />
                <FieldError message={errors.pincode} />
              </div>
              <div>
                <label className={labelClass} htmlFor="co-country">Country</label>
                <input id="co-country" value="India" readOnly className={`${inputClass} bg-muted/40`} />
              </div>
            </div>
          </div>

          {!activeIntent ? (
            <button
              type="submit"
              disabled={busy || items.length === 0}
              className="w-full bg-burgundy hover:bg-burgundy-hover text-cream font-semibold py-4 rounded-[2px] transition text-xs uppercase tracking-[0.2em] disabled:opacity-60 shadow-sm"
            >
              {phase === 'creating' ? 'Confirming your total…' : 'Continue to payment'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePay}
              disabled={busy}
              className="w-full bg-burgundy hover:bg-burgundy-hover text-cream font-semibold py-4 rounded-[2px] transition text-xs uppercase tracking-[0.2em] disabled:opacity-60 shadow-sm flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {phase === 'paying' ? 'Waiting for payment…' : phase === 'verifying' ? 'Confirming your payment…' : `Pay ${money(activeIntent.pricing.total)} securely`}
            </button>
          )}
          {activeIntent && (
            <p className="text-[11px] text-muted-foreground -mt-4">
              Order {activeIntent.orderNumber} is reserved and awaiting payment. Editing your details or cart will create a new order total.
            </p>
          )}
        </form>

        <aside className="space-y-6 lg:sticky lg:top-24 self-start">
          <div className="bg-card border border-border/80 rounded-lg p-5 shadow-luxe space-y-5">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <h2 className="font-display text-xl text-dark-brown font-semibold">Order summary</h2>
              <span className="text-burgundy text-xs font-mono font-bold">({items.reduce((a, i) => a + i.quantity, 0)} items)</span>
            </div>

            <div className="space-y-3.5 max-h-80 overflow-y-auto divide-y divide-border/40 pr-1">
              {items.map((i, idx) => (
                <div key={i.id} className={`flex gap-3 text-xs ${idx > 0 ? 'pt-3.5' : ''}`}>
                  <div className="w-14 h-14 bg-background border border-border/80 rounded-[2px] p-1.5 flex items-center justify-center shrink-0 relative">
                    {i.customDesignThumb ? (
                      <img src={i.customDesignThumb} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <ShapeThumb shapeId={i.shapeId} finish={i.finish} className="w-full h-full" />
                    )}
                    <span className="absolute -top-1 -right-1 bg-burgundy text-cream text-[9px] font-mono px-1 rounded-[1px] font-bold">×{i.quantity}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-dark-brown truncate">{i.productName}</div>
                    <div className="text-muted-foreground text-[10px] mt-0.5 capitalize">{i.finish} · {i.sizeLabel}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-background border border-border/70 rounded p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-dark-brown flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-oxblood" /> Coupon
                </span>
                {couponCode && (
                  <button type="button" onClick={() => { cartRemoveCoupon(); toast.info('Coupon removed.'); }}
                    className="text-[10px] text-destructive hover:underline font-semibold">
                    Remove
                  </button>
                )}
              </div>
              {couponCode ? (
                <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-xs">{couponCode}</div>
              ) : (
                <div className="flex gap-2">
                  <input type="text" placeholder="Coupon code" value={couponInput}
                    onChange={e => setCouponInput(e.target.value.toUpperCase())}
                    className="flex-1 bg-card border border-border rounded px-3 py-1.5 text-xs font-mono uppercase outline-none focus:border-oxblood transition" />
                  <button type="button" disabled={checkingCoupon || !couponInput.trim()} onClick={applyCouponCode}
                    className="px-3 py-1.5 bg-oxblood text-ivory hover:bg-oxblood-deep font-semibold text-xs rounded transition disabled:opacity-50">
                    {checkingCoupon ? 'Checking…' : 'Apply'}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 text-xs border-t border-border/70 pt-3">
              {pricing ? (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span><span className="font-mono text-foreground">{money(pricing.subtotal)}</span>
                  </div>
                  {pricing.discount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-semibold">
                      <span>Discount{couponCode ? ` (${couponCode})` : ''}</span><span className="font-mono">-{money(pricing.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Shipping</span><span className="font-mono">{pricing.shipping === 0 ? 'Free' : money(pricing.shipping)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>GST</span><span className="font-mono">{money(pricing.tax)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold border-t border-border/70 pt-3 text-dark-brown">
                    <span>Total payable</span>
                    <span className="font-mono text-xl font-bold text-burgundy">{money(pricing.total)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Items subtotal (estimate)</span><span className="font-mono text-foreground">{money(subtotal)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Shipping, GST and discounts are calculated by our server when you continue. That total is the amount you pay.
                  </p>
                </>
              )}
            </div>

            <Link to="/cart" className="block text-center text-[10px] uppercase tracking-widest text-muted-foreground hover:text-burgundy font-bold pt-2 transition">
              ← Edit quantities in cart
            </Link>
          </div>

          <div className="bg-card border border-border/70 rounded-[2px] p-4 flex items-center gap-3">
            <div className="p-2 rounded-[2px] bg-burgundy/10 text-burgundy shrink-0"><Phone className="w-4 h-4" /></div>
            <div className="text-xs">
              <div className="font-semibold text-dark-brown">Need help with checkout?</div>
              <div className="text-muted-foreground text-[11px] mt-0.5">
                Write to <a href="mailto:concierge@vernoxatelier.com" className="text-burgundy font-semibold underline">concierge@vernoxatelier.com</a>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <SiteFooter />
    </div>
  );
}
