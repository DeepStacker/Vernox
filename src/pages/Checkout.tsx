import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { useCart } from '@/lib/cartContext';
import { useCatalog } from '@/lib/catalogContext';
import { toast } from 'sonner';
import { CreditCard, Landmark, QrCode, Smartphone, X, Phone, Tag } from 'lucide-react';
import { calculateCouponDiscount } from '@/lib/couponValidator';
import { trackStoreEvent } from '@/lib/storeAnalytics';

export default function Checkout() {
  const { 
    items, subtotal, clear, 
    appliedCoupon: cartAppliedCoupon, 
    applyCoupon: cartApplyCoupon, 
    removeCoupon: cartRemoveCoupon 
  } = useCart();
  const { addOrder, storeConfig, currentCustomer, coupons } = useCatalog();
  const [placing, setPlacing] = useState(false);
  const navigate = useNavigate();

  // Coupon State
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number; description?: string } | null>(
    () => cartAppliedCoupon || null
  );
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // Track checkout visit
  useEffect(() => {
    trackStoreEvent('checkout');
  }, []);

  // Sync if cartAppliedCoupon was set from the Cart page
  useEffect(() => {
    if (cartAppliedCoupon && !appliedCoupon) {
      setAppliedCoupon(cartAppliedCoupon);
    }
  }, [cartAppliedCoupon]);

  // Real-time recalculation of coupon discount against current cart items
  const discount = useMemo(() => {
    if (!appliedCoupon) return 0;
    const reval = calculateCouponDiscount({
      code: appliedCoupon.code,
      cartSubtotal: subtotal,
      cartItems: items.map(i => ({
        productId: i.productId,
        productSlug: i.productSlug,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
      })),
      currency: storeConfig.currency || '₹',
    }, coupons);
    return reval.isValid ? reval.discountAmount : appliedCoupon.discountAmount;
  }, [appliedCoupon, subtotal, items, coupons, storeConfig.currency]);

  const discountedSubtotal = Math.max(0, subtotal - discount);
  const shipping = subtotal > storeConfig.freeShippingThreshold ? 0 : storeConfig.shippingFee;
  const tax = discountedSubtotal * (storeConfig.taxRate / 100);
  const total = discountedSubtotal + shipping + tax;

  const [form, setForm] = useState({
    email: currentCustomer?.email || '',
    name: currentCustomer?.name || '',
    address: currentCustomer?.address || '',
    city: currentCustomer?.city || '',
    zip: currentCustomer?.zip || '',
    country: currentCustomer?.country || 'United States',
  });

  // Prefill details if current customer loads asynchronously
  useEffect(() => {
    if (currentCustomer) {
      setForm({
        email: currentCustomer.email,
        name: currentCustomer.name,
        address: currentCustomer.address || '',
        city: currentCustomer.city || '',
        zip: currentCustomer.zip || '',
        country: currentCustomer.country || 'United States',
      });
    }
  }, [currentCustomer]);

  // Multiple Payment Methods state
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'upi' | 'razorpay'>('card');
  
  // UPI Inputs
  const [upiId, setUpiId] = useState('');

  // Razorpay script verification / dynamic loading
  useEffect(() => {
    if (typeof (window as any).Razorpay !== 'undefined') return;
    if (document.querySelector('script[src*="checkout.razorpay.com"]')) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const getCurrencyCode = (symbol: string) => {
    switch (symbol) {
      case '₹': return 'INR';
      case '€': return 'EUR';
      case '£': return 'GBP';
      case '¥': return 'JPY';
      case '$': return 'INR';
      default: return 'INR';
    }
  };

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  const triggerRazorpayCheckout = async (preferredMethod?: 'card' | 'upi' | 'netbanking') => {
    if (placing) return;
    const currencyCode = getCurrencyCode(storeConfig.currency);
    setPlacing(true);
    try {
      // 1. Authoritative Server Order Intent Creation with Inventory Reservation & Idempotency Key
      const res = await fetch('/api/checkout-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(item => ({
            productId: item.productId,
            productSlug: item.productSlug,
            productName: item.productName,
            sizeLabel: item.sizeLabel,
            widthMm: item.widthMm,
            heightMm: item.heightMm,
            finish: item.finish,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            shapeId: item.shapeId,
            customDesignRef: item.customDesignRef
          })),
          currency: currencyCode,
          taxRate: storeConfig.taxRate,
          freeShippingThreshold: storeConfig.freeShippingThreshold,
          shippingFee: storeConfig.shippingFee,
          couponCode: appliedCoupon?.code || undefined,
          idempotencyKey,
          customer: {
            email: form.email.trim().toLowerCase(),
            name: form.name.trim(),
            address: form.address,
            city: form.city,
            zip: form.zip,
            country: form.country,
          }
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to create checkout intent' }));
        throw new Error(errData.error || 'Server rejected checkout intent');
      }

      const orderData = await res.json();
      
      // Development mode mock checkout simulation when gateway credentials reject in dev
      if (orderData.isDevFallback) {
        toast.info('Development Gateway: Simulating instant order confirmation…');
        const mockPaymentId = `pay_dev_${Date.now()}`;
        const mockSignature = `sig_dev_${Date.now()}`;
        const verifyRes = await fetch('/api/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpay_payment_id: mockPaymentId,
            razorpay_order_id: orderData.order_id,
            razorpay_signature: mockSignature,
            orderData: {
              email: form.email,
              shippingName: form.name,
              shippingAddress: form.address,
              shippingCity: form.city,
              shippingZip: form.zip,
              shippingCountry: form.country,
            }
          })
        });

        const verifyData = await verifyRes.json().catch(() => ({}));
        if (verifyRes.ok && verifyData.success) {
          const verifiedId = verifyData.orderId || orderData.order_id;
          addOrder({
            id: verifiedId,
            items,
            total: orderData.pricing?.total || total,
            placedAt: Date.now(),
            email: form.email,
            shippingName: form.name,
            shippingAddress: form.address,
            shippingCity: form.city,
            shippingZip: form.zip,
            shippingCountry: form.country,
            adminNotes: `Dev Mode Mock Order: ${mockPaymentId}`
          });
          clear();
          toast.success("Order confirmed successfully (Development Mode)");
          navigate(`/order-confirmation/${verifiedId}`);
          return;
        }
      }

      // Ensure Razorpay SDK is loaded
      if (typeof (window as any).Razorpay === 'undefined') {
        throw new Error('Payment gateway SDK is loading. Please try again in a moment.');
      }

      const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!razorpayKey) {
        throw new Error('Razorpay Key ID is not configured. Please check VITE_RAZORPAY_KEY_ID in .env');
      }

      const options: any = {
        key: razorpayKey,
        amount: orderData.amount,
        currency: orderData.currency,
        name: storeConfig.storeName,
        description: items.length === 1 ? items[0].productName : `${items.length} Atelier Masterworks`,
        order_id: orderData.order_id,
        handler: async function (response: any) {
          const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = response;
          try {
            // 2. Authoritative Cryptographic HMAC Signature Verification against server order intent
            const verifyRes = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id,
                razorpay_order_id,
                razorpay_signature,
                orderData: {
                  email: form.email,
                  shippingName: form.name,
                  shippingAddress: form.address,
                  shippingCity: form.city,
                  shippingZip: form.zip,
                  shippingCountry: form.country,
                }
              })
            });

            const verifyData = await verifyRes.json().catch(() => ({}));
            if (verifyRes.ok && verifyData.success) {
              const verifiedId = verifyData.orderId || razorpay_order_id;
              addOrder({
                id: verifiedId,
                items,
                total: orderData.pricing?.total || total,
                placedAt: Date.now(),
                email: form.email,
                shippingName: form.name,
                shippingAddress: form.address,
                shippingCity: form.city,
                shippingZip: form.zip,
                shippingCountry: form.country,
                adminNotes: `Verified Razorpay Payment: ${razorpay_payment_id}`
              });
              localStorage.setItem('vernox-customer-email', form.email.trim().toLowerCase());
              trackStoreEvent('purchase', { orderId: verifiedId, orderTotal: orderData.pricing?.total || total });
              clear();
              toast.success('Payment verified & order confirmed!');
              navigate(`/order-confirmation/${verifiedId}`);
            } else {
              toast.error(verifyData.error || 'Payment signature verification failed.');
              setPlacing(false);
            }
          } catch (err: any) {
            toast.error(err.message || 'Signature verification network failure.');
            setPlacing(false);
          }
        },
        prefill: { 
          name: form.name, 
          email: form.email,
          ...(preferredMethod === 'upi' && upiId ? { vpa: upiId } : {})
        },
        theme: { 
          color: typeof window !== 'undefined' 
            ? getComputedStyle(document.documentElement).getPropertyValue('--burgundy').trim() || '#5B262C' 
            : '#5B262C' 
        },
        modal: {
          ondismiss: function () {
            toast.error('Payment window closed.');
            setPlacing(false);
            // Cycle idempotency key so that next intent attempt is fresh
            setIdempotencyKey(crypto.randomUUID());
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        toast.error(response.error?.description || 'Payment failed.');
        setPlacing(false);
        setIdempotencyKey(crypto.randomUUID());
      });
      rzp.open();
    } catch (err: any) {
      toast.error(err.message || 'Checkout initiation error.');
      setPlacing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) { toast.error('Cart is empty'); return; }
    
    // Route all payment options through secure server gateway
    triggerRazorpayCheckout(paymentMethod as any);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      {/* ATELIER CHECKOUT BANNER */}
      <div className="bg-[#1C1615] text-[#E8DFD3] text-[10px] tracking-[0.24em] uppercase py-2.5 px-6 border-b border-white/10 font-sans">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="font-brand tracking-[0.26em]">VERNOX ATELIER</span>
          <span className="hidden sm:inline-block text-white/60">Complimentary Insured Crated Transit</span>
          <span className="text-white/80 font-sans text-[10px]">Secure Checkout</span>
        </div>
      </div>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-14 w-full grid lg:grid-cols-[1.1fr_400px] gap-10 flex-1">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Header & Stepper */}
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
              <Link to="/cart" className="hover:text-burgundy transition">Cart</Link>
              <span>/</span>
              <span className="text-burgundy font-semibold">Secure Checkout</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl text-burgundy leading-tight font-semibold">
              Atelier Commission Checkout
            </h1>
            <p className="text-muted-foreground text-xs mt-1 font-serif-italic">
              Provide recipient specifications for custom packaging, hallmarking, and insured door-to-door delivery.
            </p>
          </div>

          {/* Step Badges */}
          <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-wider font-semibold border-y border-border/70 py-3">
            <div className="flex items-center gap-1.5 text-burgundy">
              <span className="font-mono text-xs font-bold text-burgundy">01.</span>
              <span>Destination</span>
            </div>
            <div className="flex items-center gap-1.5 text-burgundy font-bold">
              <span className="font-mono text-xs font-bold text-gold">02.</span>
              <span>Payment</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground/60">
              <span className="font-mono text-xs font-bold text-muted-foreground/40">03.</span>
              <span>Hallmark</span>
            </div>
          </div>
          
          {/* Contact Information */}
          <div className="bg-card border border-border/70 rounded-lg p-5 noise-overlay shadow-soft space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <h2 className="font-display text-lg text-burgundy font-semibold">1. Recipient & Contact Information</h2>
              <span className="text-[10px] text-muted-foreground font-mono">Instant Confirmation</span>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                Email Address (Receipt & DHL Tracking)
              </label>
              <input required type="email" placeholder="client@architecturalstudio.com" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full bg-background border border-border rounded px-4 py-2.5 text-sm outline-none focus:border-burgundy font-sans transition" />
            </div>
          </div>

          {/* Shipping Destination */}
          <div className="bg-card border border-border/70 rounded-lg p-5 noise-overlay shadow-soft space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <h2 className="font-display text-lg text-burgundy font-semibold">2. Insured Freight Delivery Destination</h2>
              <span className="text-[10px] text-gold uppercase font-semibold font-mono tracking-wider">
                Archival Crate
              </span>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                Recipient Full Name / Studio Attention
              </label>
              <input required placeholder="e.g. Jean Dupont" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full bg-background border border-border rounded px-4 py-2.5 text-sm outline-none focus:border-burgundy transition" />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                Street Address, Suite or Gallery Floor
              </label>
              <input required placeholder="Kloosterstraat 44, Suite 3B" value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full bg-background border border-border rounded px-4 py-2.5 text-sm outline-none focus:border-burgundy transition" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                  City / Locality
                </label>
                <input required placeholder="Antwerp / London / New York" value={form.city}
                  onChange={e => setForm({ ...form, city: e.target.value })}
                  className="w-full bg-background border border-border rounded px-4 py-2.5 text-sm outline-none focus:border-burgundy transition" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                  ZIP / Postal Code
                </label>
                <input required placeholder="2000" value={form.zip}
                  onChange={e => setForm({ ...form, zip: e.target.value })}
                  className="w-full bg-background border border-border rounded px-4 py-2.5 text-sm outline-none focus:border-burgundy transition" />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                Destination Country
              </label>
              <input required placeholder="United States, Belgium, United Kingdom, India..." value={form.country}
                onChange={e => setForm({ ...form, country: e.target.value })}
                className="w-full bg-background border border-border rounded px-4 py-2.5 text-sm outline-none focus:border-burgundy transition" />
            </div>
          </div>

          {/* PAYMENT OPTIONS SELECTOR */}
          <div className="bg-card border border-border/70 rounded-lg p-5 noise-overlay shadow-soft space-y-5">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <h2 className="font-display text-lg text-burgundy font-semibold">3. Payment Method</h2>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-sans">
                Encrypted & Authenticated
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'card', label: 'Credit Card', icon: CreditCard, sub: 'Visa, Amex, MC' },
                { id: 'upi', label: 'UPI / QR', icon: QrCode, sub: 'GPay, PhonePe' },
                { id: 'razorpay', label: 'NetBanking', icon: Smartphone, sub: 'All Indian Banks' }
              ].map(method => {
                const MethodIcon = method.icon;
                const isSelected = paymentMethod === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id as any)}
                    className={`p-3.5 border rounded-lg flex flex-col items-center justify-center gap-1.5 text-xs transition-all font-semibold uppercase tracking-wider ${
                      isSelected 
                        ? 'border-burgundy bg-burgundy/5 text-burgundy ring-2 ring-burgundy/15 shadow-sm' 
                        : 'border-border bg-background hover:border-burgundy/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <MethodIcon className="w-5 h-5" />
                    <span>{method.label}</span>
                    <span className="text-[9px] font-mono normal-case tracking-normal text-muted-foreground/70">{method.sub}</span>
                  </button>
                );
              })}
            </div>

            {/* PAYMENT FORMS PANEL */}
            <div className="bg-background border border-border/70 rounded p-4 space-y-3">
              {paymentMethod === 'card' && (
                <div className="space-y-2.5 animate-fade-in">
                  <div className="text-xs font-semibold text-burgundy uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4" /> Credit & Debit Card
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Visa, MasterCard, RuPay, and American Express accepted. Secure authorization via verified banking rails.
                  </p>
                </div>
              )}

              {paymentMethod === 'upi' && (
                <div className="space-y-3 animate-fade-in">
                  <div className="text-xs font-semibold text-burgundy uppercase tracking-wider flex items-center gap-1.5">
                    <QrCode className="w-4 h-4" /> UPI Virtual Private Address (VPA) / Instant QR
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Enter your Virtual Payment Address (e.g. mobile@upi or name@okhdfcbank) or click Place Order to scan the dynamic secure transaction QR with Google Pay, PhonePe, or Paytm.
                  </p>
                  <input 
                    type="text" 
                    placeholder="username@upi or mobile@okhdfcbank (Optional)" 
                    value={upiId}
                    onChange={e => setUpiId(e.target.value)}
                    className="w-full bg-card border border-border rounded px-3 py-2 text-sm outline-none focus:border-burgundy font-mono" 
                  />
                </div>
              )}

              {paymentMethod === 'razorpay' && (
                <div className="space-y-2 animate-fade-in">
                  <div className="text-xs font-semibold text-burgundy uppercase tracking-wider flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4" /> Unified Razorpay Multi-Rail Gateway
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Direct access to all 58 Indian banks, Corporate NetBanking, EMI, CRED, Apple Pay / International Cards, and digital wallets.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Place Order CTA */}
          <button 
            type="submit"
            disabled={placing}
            className="w-full bg-burgundy hover:bg-burgundy-hover text-cream font-semibold py-4 rounded-[2px] hover:shadow-md active:scale-[0.99] transition text-xs uppercase tracking-[0.2em] font-sans disabled:opacity-60 shadow-sm flex items-center justify-center gap-2 cursor-pointer border border-transparent hover:border-dusty-pink"
          >
            {placing ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-cream border-t-transparent rounded-full animate-spin" />
                Connecting to Secure Gateway…
              </span>
            ) : (
              `Authorize & Place Commission · ${storeConfig.currency}${total.toFixed(2)}`
            )}
          </button>
        </form>

        {/* RIGHT COLUMN: ORDER SUMMARY SIDEBAR WITH THUMBNAILS & GUARANTEES */}
        <aside className="space-y-6 sticky top-24">
          <div className="bg-card border border-border/80 rounded-lg p-5 noise-overlay shadow-luxe space-y-5">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div>
                <h2 className="font-display text-xl text-dark-brown font-semibold">Commission Manifest</h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Antwerp Reserved Items</p>
              </div>
              <span className="text-burgundy text-xs font-mono font-bold">
                ({items.reduce((acc, i) => acc + i.quantity, 0)} works)
              </span>
            </div>

            {/* Item List with high-res thumbnails */}
            <div className="space-y-3.5 max-h-80 overflow-y-auto divide-y divide-border/40 pr-1">
              {items.map((i, idx) => (
                <div key={i.id} className={`flex gap-3 text-xs ${idx > 0 ? 'pt-3.5' : ''}`}>
                  <div className="w-14 h-14 bg-background border border-border/80 rounded-[2px] p-1.5 flex items-center justify-center shrink-0 shadow-xs relative">
                    {i.customDesignThumb ? (
                      <img src={i.customDesignThumb} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <ShapeThumb shapeId={i.shapeId} finish={i.finish} className="w-full h-full" />
                    )}
                    <span className="absolute -top-1 -right-1 bg-burgundy text-cream text-[9px] font-mono px-1 rounded-[1px] font-bold">
                      ×{i.quantity}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-dark-brown truncate">{i.productName}</div>
                    <div className="text-muted-foreground text-[10px] mt-0.5 capitalize">
                      {i.finish} · {i.sizeLabel}
                    </div>
                    <div className="text-[9px] text-gold font-mono font-semibold mt-0.5">Solid 3.0mm Plate</div>
                  </div>

                  <div className="font-semibold font-mono text-dark-brown shrink-0 text-right">
                    {storeConfig.currency}{(i.unitPrice * i.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Estimated Arrival Banner */}
            <div className="bg-muted/40 border border-border/70 rounded p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-dark-brown">
                <span className="font-mono text-gold text-[10px] uppercase tracking-wider">TRANSIT ·</span>
                <span>Estimated Insured Arrival</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                White-glove crated transit via <strong>DHL Express Priority</strong>. Tracking provided immediately upon laser inspection.
              </p>
            </div>

            {/* PROMOTIONAL COUPON BOX */}
            <div className="bg-background border border-border/70 rounded p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-dark-brown flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-oxblood" /> Promotional Voucher
                </span>
                {appliedCoupon && (
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedCoupon(null);
                      cartRemoveCoupon();
                      setCouponInput('');
                      toast.info('Coupon removed');
                    }}
                    className="text-[10px] text-destructive hover:underline font-semibold"
                  >
                    Remove
                  </button>
                )}
              </div>

              {appliedCoupon ? (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded text-xs">
                  <div>
                    <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {appliedCoupon.code}
                    </div>
                    {appliedCoupon.description && (
                      <div className="text-[10px] text-muted-foreground">
                        {appliedCoupon.description}
                      </div>
                    )}
                  </div>
                  <div className="text-emerald-700 dark:text-emerald-400 font-semibold font-mono text-sm">
                    -{storeConfig.currency}{discount.toFixed(2)}
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. WELCOME10, ATELIER50, VERNOXVIP"
                    value={couponInput}
                    onChange={e => setCouponInput(e.target.value.toUpperCase())}
                    className="flex-1 bg-card border border-border rounded px-3 py-1.5 text-xs font-mono uppercase outline-none focus:border-oxblood transition"
                  />
                  <button
                    type="button"
                    disabled={isValidatingCoupon || !couponInput.trim()}
                    onClick={async () => {
                      const cleanCode = couponInput.trim().toUpperCase();
                      if (!cleanCode) return;
                      setIsValidatingCoupon(true);

                      // 1. Authoritative local calculation against all admin and launch coupons
                      const localResult = calculateCouponDiscount({
                        code: cleanCode,
                        cartSubtotal: subtotal,
                        cartItems: items.map(i => ({
                          productId: i.productId,
                          productSlug: i.productSlug,
                          unitPrice: i.unitPrice,
                          quantity: i.quantity,
                        })),
                        customerEmail: form.email.trim() || undefined,
                        currency: storeConfig.currency || '₹',
                      }, coupons);

                      // 2. Query serverless endpoint /api/validate-coupon (passing clientCoupons: coupons)
                      let serverHandled = false;
                      try {
                        const res = await fetch('/api/validate-coupon', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            code: cleanCode,
                            cartSubtotal: subtotal,
                            cartItems: items,
                            customerEmail: form.email.trim() || undefined,
                            currency: storeConfig.currency || '₹',
                            clientCoupons: coupons,
                          })
                        });
                        if (res.ok) {
                          const data = await res.json();
                          if (data.isValid) {
                            const couponObj = {
                              code: data.couponCode,
                              discountAmount: data.discountAmount,
                              description: data.description,
                            };
                            setAppliedCoupon(couponObj);
                            cartApplyCoupon(couponObj);
                            toast.success(`Coupon ${data.couponCode} applied! Saved ${storeConfig.currency}${data.discountAmount.toFixed(2)}`);
                            setCouponInput('');
                            serverHandled = true;
                          } else if (!localResult.isValid) {
                            toast.error(data.error || 'Invalid coupon code');
                            serverHandled = true;
                          }
                        }
                      } catch {
                        // Offline or emulator network error: fall through to localResult
                      } finally {
                        setIsValidatingCoupon(false);
                      }

                      // 3. Fallback to local evaluation if server was unreachable or in offline mode
                      if (!serverHandled) {
                        if (localResult.isValid) {
                          const couponObj = {
                            code: localResult.couponCode || cleanCode,
                            discountAmount: localResult.discountAmount,
                            description: localResult.description,
                          };
                          setAppliedCoupon(couponObj);
                          cartApplyCoupon(couponObj);
                          toast.success(`Coupon ${localResult.couponCode || cleanCode} applied! Saved ${storeConfig.currency}${localResult.discountAmount.toFixed(2)}`);
                          setCouponInput('');
                        } else {
                          toast.error(localResult.error || 'Invalid coupon code');
                        }
                      }
                    }}
                    className="px-3 py-1.5 bg-oxblood text-ivory hover:bg-oxblood-deep font-semibold text-xs rounded transition shadow-2xs disabled:opacity-50"
                  >
                    {isValidatingCoupon ? 'Checking...' : 'Apply'}
                  </button>
                </div>
              )}
            </div>
            
            {/* Totals */}
            <div className="space-y-2 text-xs border-t border-border/70 pt-3">
              <div className="flex justify-between text-muted-foreground">
                <span>Merchandise Subtotal</span>
                <span className="font-semibold text-foreground font-mono">{storeConfig.currency}{subtotal.toFixed(2)}</span>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Promotional Privilege ({appliedCoupon.code})</span>
                  <span className="font-mono">-{storeConfig.currency}{appliedCoupon.discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Insured Freight & Timber Crate</span>
                <span className="font-mono">
                  {shipping === 0 ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold uppercase text-[10px]">Complimentary</span>
                  ) : (
                    `${storeConfig.currency}${shipping.toFixed(2)}`
                  )}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Sales Tax / VAT ({storeConfig.taxRate}%)</span>
                <span className="font-mono">{storeConfig.currency}{tax.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between text-sm font-semibold border-t border-border/70 pt-3 text-dark-brown">
                <div>
                  <span>Total</span>
                  <span className="block text-[9px] text-muted-foreground font-normal">All duties, taxes & crating included</span>
                </div>
                <span className="font-mono text-xl font-bold text-burgundy">{storeConfig.currency}{total.toFixed(2)}</span>
              </div>
            </div>

            {/* Inclusions Box */}
            <div className="pt-3 border-t border-border/60 space-y-2 text-[11px] text-muted-foreground">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-gold text-[10px] font-semibold">01 ·</span>
                <span>Signed Certificate of Authenticity & Studio Hallmark</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-gold text-[10px] font-semibold">02 ·</span>
                <span>Reinforced Timber Crated Transit Included</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-gold text-[10px] font-semibold">03 ·</span>
                <span>Concealed Float Standoffs & 1:1 Mounting Template</span>
              </div>
            </div>

            <Link 
              to="/cart" 
              className="block text-center text-[10px] uppercase tracking-widest text-muted-foreground hover:text-burgundy font-bold pt-2 transition"
            >
              ← Edit quantities in cart
            </Link>
          </div>

          {/* Concierge Assistance */}
          <div className="bg-card border border-border/70 rounded-[2px] p-4 flex items-center gap-3 shadow-2xs">
            <div className="p-2 rounded-[2px] bg-burgundy/10 text-burgundy shrink-0">
              <Phone className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <div className="font-semibold text-dark-brown">Need Checkout Assistance?</div>
              <div className="text-muted-foreground text-[11px] mt-0.5">
                Our studio concierge is available at: <a href="mailto:concierge@vernox.com" className="text-burgundy font-semibold underline">concierge@vernox.com</a>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <SiteFooter />
    </div>
  );
}