import { useSeo } from '@/lib/seo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Phone, Tag, ShieldCheck, Truck } from 'lucide-react';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { PageHeader } from '@/components/shop/PageHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { CodOtpStep, type CodOtpState } from '@/components/shop/CodOtpStep';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { useCart } from '@/lib/cartContext';
import { useCatalog } from '@/lib/catalogContext';
import { useAuth } from '@/lib/auth/AuthProvider';
import { trackStoreEvent } from '@/lib/storeAnalytics';
import { previewCoupon } from '@/lib/data/couponPreview';
import {
  CheckoutError, cartHasCustomItem, createCheckoutIntent, openRazorpay, verifyPayment,
  type CheckoutCustomer, type CheckoutIntent, type PaymentMethod,
} from '@/lib/checkout/checkoutApi';
import { formatDeliveryDate } from '@/lib/shipping/deliveryEstimate';
import { useDeliveryEstimate } from '@/lib/shipping/useDeliveryEstimate';
import { usePincodeAutofill } from '@/lib/shipping/usePincodeAutofill';
import { CUSTOM_PRODUCT_ID } from '@/types/products';
import { isCreditCode } from '@/lib/consultations/consultationModel';
import { useAutoApplyConsultationCredit } from '@/lib/consultations/useCreditAutoApply';
import { trackSpaceEvent } from '@/lib/spaces/analytics';
import {
  INDIAN_STATES_AND_UTS, normalizeIndianMobile, validateAddress, type AddressErrors, type AddressForm,
} from '@/lib/checkout/validation';

const inputClass =
  'w-full bg-background border border-border rounded px-4 py-2.5 text-sm outline-none focus:border-burgundy transition';
const labelClass = 'text-sm font-medium text-foreground block mb-1';

type Phase = 'details' | 'creating' | 'ready' | 'paying' | 'verifying';

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive mt-1" role="alert">{message}</p> : null;
}

export default function Checkout() {
  useSeo({ title: 'Checkout', noindex: true });
  const {
    items, subtotal, clear,
    appliedCoupon: cartCoupon, applyCoupon: cartApplyCoupon, removeCoupon: cartRemoveCoupon,
  } = useCart();
  const { storeConfig } = useCatalog();
  const { profile } = useAuth();
  useAutoApplyConsultationCredit();
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
      const result = await previewCoupon({ code, items, email: form.email.trim() });
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
  // Delivery check for the entered PIN code; COD needs a COD-serviceable PIN and a catalogue-only cart.
  const deliveryProductId = cartHasCustomItem(items) ? CUSTOM_PRODUCT_ID : undefined;
  const delivery = useDeliveryEstimate(form.pincode, deliveryProductId);
  // Typing the PIN fills an empty city/state (never overwrites typed values).
  usePincodeAutofill(form.pincode, form, patch => setForm(prev => ({ ...prev, ...patch })), deliveryProductId);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('prepaid');
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const codBlockedReason: string | null =
    storeConfig.codEnabled === false ? 'Cash on delivery is not available right now.'
      : cartHasCustomItem(items) ? 'Custom studio designs are prepaid only.'
        : !delivery.isValidPincode ? 'Enter your PIN code to check cash on delivery.'
          : delivery.estimate && !delivery.estimate.codAvailable ? 'Cash on delivery is not available for this PIN code.'
            : null;
  useEffect(() => {
    if (codBlockedReason && paymentMethod === 'cod' && !delivery.isLoading) setPaymentMethod('prepaid');
  }, [codBlockedReason, paymentMethod, delivery.isLoading]);
  const codFee = storeConfig.codFee ?? 0;
  // SMS confirmation of the mobile number for COD; `required` stays true until the step says otherwise.
  const [codOtp, setCodOtp] = useState<CodOtpState>({ required: true, token: null });
  const [codOtpEpoch, setCodOtpEpoch] = useState(0);
  const codPhone = normalizeIndianMobile(form.phone);
  const awaitingCodOtp = paymentMethod === 'cod' && codOtp.required && !codOtp.token;

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
    () => JSON.stringify({ customer, couponCode, paymentMethod, items: items.map(i => [i.productId, i.sizeLabel, i.finish, i.quantity, i.customDesignRef]) }),
    [customer, couponCode, paymentMethod, items],
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
        case 'COD_NOT_AVAILABLE':
        case 'COD_OTP_REQUIRED':
        case 'COD_OTP_INVALID': return err.message;
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
    if (delivery.estimate && !delivery.estimate.serviceable) {
      setErrors(prev => ({ ...prev, pincode: 'We do not deliver to this PIN code yet.' }));
      toast.error('We do not deliver to this PIN code yet.');
      return;
    }

    setPhase('creating');
    try {
      const created = await createCheckoutIntent({ items, couponCode, idempotencyKey: idempotencyKey.current, customer, paymentMethod, codVerificationToken: codOtp.token ?? undefined, whatsappOptIn });
      if (created.paymentMethod === 'cod') {
        // Confirmed at creation: there is no payment step.
        trackStoreEvent('purchase', { orderId: created.orderId, orderTotal: created.pricing.total });
        clear();
        toast.success('Order placed. Pay in cash when it is delivered.');
        navigate(`/order-confirmation/${created.orderId}?email=${encodeURIComponent(customer.email)}`);
        return;
      }
      setIntent(created);
      setIntentFingerprint(fingerprint);
      setPhase('ready');
      toast.success('Order total confirmed. Review it and pay to place your order.');
    } catch (err) {
      setPhase('details');
      toast.error(describeError(err));
      if (err instanceof CheckoutError && err.code === 'INVALID_COUPON') cartRemoveCoupon();
      if (err instanceof CheckoutError && err.code === 'COD_NOT_AVAILABLE') setPaymentMethod('prepaid');
      if (err instanceof CheckoutError && (err.code === 'COD_OTP_REQUIRED' || err.code === 'COD_OTP_INVALID')) {
        // The code was used up or expired: ask for a fresh one.
        setCodOtp({ required: true, token: null });
        setCodOtpEpoch(n => n + 1);
      }
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
      if (isCreditCode(couponCode)) trackSpaceEvent('consultation_credit_redeemed', { orderId: verified.orderId });
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
            <PageHeader title="Checkout" crumbs={[{ label: 'Cart', to: '/cart' }, { label: 'Checkout' }]} />
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
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={whatsappOptIn} onChange={e => setWhatsappOptIn(e.target.checked)} className="h-5 w-5 accent-burgundy" />
              Send me order updates on WhatsApp (reply STOP any time)
            </label>

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
                <label className={labelClass} htmlFor="co-pincode">Pincode</label>
                <input id="co-pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={form.pincode} onChange={set('pincode')} className={inputClass} />
                <FieldError message={errors.pincode} />
                <p className="text-xs mt-1 text-muted-foreground flex items-center gap-1" aria-live="polite">
                  {delivery.isLoading && 'Checking delivery…'}
                  {!delivery.isLoading && delivery.estimate?.serviceable && delivery.estimate.estimatedDeliveryDate && (
                    <><Truck className="w-3 h-3" aria-hidden /> Estimated delivery by {formatDeliveryDate(delivery.estimate.estimatedDeliveryDate)}</>
                  )}
                  {!delivery.isLoading && delivery.estimate && !delivery.estimate.serviceable && (
                    <span className="text-destructive">We do not deliver to this PIN code yet.</span>
                  )}
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor="co-country">Country</label>
                <input id="co-country" value="India" readOnly className={`${inputClass} bg-muted/40`} />
              </div>
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
          </div>

          <fieldset className="bg-card border border-border/70 rounded-lg p-5 shadow-soft space-y-3" disabled={busy || activeIntent !== null}>
            <legend className="font-display text-lg text-burgundy font-semibold px-1">Payment</legend>
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input type="radio" name="payment-method" value="prepaid" checked={paymentMethod === 'prepaid'}
                onChange={() => setPaymentMethod('prepaid')} className="mt-1 accent-burgundy" />
              <span>
                <span className="font-semibold text-dark-brown">Pay online</span>
                <span className="block text-xs text-muted-foreground">UPI, cards, net banking or wallets via Razorpay.</span>
              </span>
            </label>
            <label className={`flex items-start gap-3 text-sm ${codBlockedReason ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input type="radio" name="payment-method" value="cod" checked={paymentMethod === 'cod'}
                disabled={codBlockedReason !== null} onChange={() => setPaymentMethod('cod')} className="mt-1 accent-burgundy" />
              <span>
                <span className="font-semibold text-dark-brown">
                  Cash on delivery{codFee > 0 ? ` (+ ${money(codFee)} fee + GST)` : ''}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {codBlockedReason ?? 'Pay in cash when your order arrives.'}
                </span>
              </span>
            </label>
            {paymentMethod === 'cod' && !codBlockedReason && (
              <CodOtpStep key={codOtpEpoch} phone={codPhone} onChange={setCodOtp} />
            )}
          </fieldset>

          {!activeIntent ? (
            <button
              type="submit"
              disabled={busy || items.length === 0 || awaitingCodOtp}
              className="btn-primary w-full py-4"
            >
              {phase === 'creating'
                ? (paymentMethod === 'cod' ? 'Placing your order…' : 'Confirming your total…')
                : (paymentMethod === 'cod' ? 'Place order (cash on delivery)' : 'Continue to payment')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePay}
              disabled={busy}
              className="btn-primary w-full py-4"
            >
              <ShieldCheck className="w-4 h-4" />
              {phase === 'paying' ? 'Waiting for payment…' : phase === 'verifying' ? 'Confirming your payment…' : `Pay ${money(activeIntent.pricing.total)} securely`}
            </button>
          )}
          {activeIntent && (
            <p className="text-xs text-muted-foreground -mt-4">
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
                    <span className="absolute -top-1 -right-1 bg-burgundy text-cream text-xs font-mono px-1 rounded-[1px] font-bold">×{i.quantity}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-dark-brown truncate">{i.productName}</div>
                    <div className="text-muted-foreground text-xs mt-0.5 capitalize">{i.finish} · {i.sizeLabel}</div>
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
                    className="text-xs text-destructive hover:underline font-semibold">
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
                  {(pricing.codFee ?? 0) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Cash on delivery fee</span><span className="font-mono">{money(pricing.codFee ?? 0)}</span>
                    </div>
                  )}
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
                  <p className="text-xs text-muted-foreground">
                    Shipping, GST{paymentMethod === 'cod' ? ', the cash on delivery fee' : ''} and discounts are calculated by our server when you continue. That total is the amount you pay.
                  </p>
                </>
              )}
            </div>

            <Link to="/cart" className="block text-center text-xs text-muted-foreground hover:text-burgundy font-bold pt-2 transition">
              ← Edit quantities in cart
            </Link>
          </div>

          <div className="bg-card border border-border/70 rounded-[2px] p-4 flex items-center gap-3">
            <div className="p-2 rounded-[2px] bg-burgundy/10 text-burgundy shrink-0"><Phone className="w-4 h-4" /></div>
            <div className="text-xs">
              <div className="font-semibold text-dark-brown">Need help with checkout?</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                <Link to="/contact" className="text-burgundy font-semibold underline">Contact us</Link>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <SiteFooter />
    </div>
  );
}
