import { useSeo } from '@/lib/seo';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { useAuth } from '@/lib/auth/AuthProvider';
import { fetchPublicOrderStatus } from '@/lib/data/orders';
import { lookupOrder } from '@/lib/data/orderLookup';
import { OrderProgress } from '@/components/shop/OrderProgress';
import { ORDER_STATUS_LABELS } from '@/lib/orders/orderStateMachine';
import { isOffPathStatus } from '@/lib/orders/fulfilmentStages';
import { safeSession } from '@/lib/safeStorage';
import type { PublicOrderSummary } from '@/types/store';
import { 
  Package, 
  Search, 
  Truck, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  MapPin, 
  AlertCircle,
  ExternalLink,
  Layers,
  PhoneCall
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function getRateLimitState(): { count: number; lockedUntil: number } {
  return safeSession.getJson('vnx_track_rl', { count: 0, lockedUntil: 0 });
}

function recordFailedAttempt(): void {
  const nextCount = getRateLimitState().count + 1;
  const lockedUntil = nextCount >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_WINDOW_MS : 0;
  safeSession.setJson('vnx_track_rl', { count: nextCount, lockedUntil });
}

function resetRateLimit(): void {
  safeSession.remove('vnx_track_rl');
}

export default function TrackOrder() {
  useSeo({ title: 'Track your order', noindex: true });
  const { user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Only accept order reference ID from URL; never accept or encourage email in query params
  const initialOrderId = searchParams.get('id') || '';

  const [orderInput, setOrderInput] = useState(initialOrderId);
  const [emailInput, setEmailInput] = useState(profile?.email || '');
  const [isSearching, setIsSearching] = useState(false);
  const [matchedOrder, setMatchedOrder] = useState<PublicOrderSummary | null>(null);

  const handleTrackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = orderInput.trim();
    const cleanEmail = emailInput.trim().toLowerCase();

    if (!cleanId) {
      toast.error('Please enter your order reference.');
      return;
    }
    if (!cleanEmail) {
      toast.error('Please enter the email address associated with this order.');
      return;
    }

    // Client-side throttle; the server enforces its own limits as well.
    const { lockedUntil } = getRateLimitState();
    if (lockedUntil > Date.now()) {
      const remainingSecs = Math.ceil((lockedUntil - Date.now()) / 1000);
      toast.error(`Verification temporarily paused due to repeated attempts. Please wait ${remainingSecs}s or contact support.`);
      return;
    }

    setIsSearching(true);
    try {
      const found = user ? await lookupOrder(cleanId, cleanEmail, user.uid) : await fetchPublicOrderStatus(cleanId, cleanEmail);
      resetRateLimit();
      setMatchedOrder(found);
      toast.success('Order located.');
    } catch (err) {
      recordFailedAttempt();
      setMatchedOrder(null);
      // Same wording for "no such order" and "wrong email" so order IDs cannot be enumerated.
      toast.error(err instanceof Error && !/match|found|verify/i.test(err.message)
        ? err.message
        : 'Unable to verify order details with the provided information. Please check your order reference and email address.');
    } finally {
      setIsSearching(false);
    }
  };

  const isOffPath = matchedOrder ? isOffPathStatus(matchedOrder.status) : false;

  return (
    <div className="min-h-screen flex flex-col bg-cream text-dark-brown selection:bg-burgundy selection:text-cream">
      <SiteHeader />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-20">
        {/* Header Breadcrumb & Title */}
        <div className="text-center max-w-2xl mx-auto space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-burgundy/10 text-burgundy text-[10px] uppercase tracking-[0.24em] font-sans font-semibold">
            <Package className="w-3.5 h-3.5 text-gold" />
            <span>Order Verification</span>
          </div>
          <h1 className="font-editorial text-3xl sm:text-5xl text-dark-brown font-normal tracking-wide">
            Track Your Order
          </h1>
          <p className="text-xs sm:text-sm text-dark-brown/70 font-sans leading-relaxed">
            Enter your order reference and billing email address to check the current production and delivery status.
          </p>
        </div>

        {/* Secure Search Form */}
        <div className="bg-white border border-[#E8E1D3] rounded-md p-6 sm:p-8 shadow-xs max-w-2xl mx-auto mb-12">
          <form onSubmit={handleTrackSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="order-id-input" className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                Order Reference Number *
              </label>
              <input
                id="order-id-input"
                type="text"
                required
                placeholder="e.g. order_179... or assigned order number"
                value={orderInput}
                onChange={e => setOrderInput(e.target.value)}
                className="w-full px-4 py-3 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-mono focus:outline-none focus:border-burgundy focus:ring-1 focus:ring-burgundy transition-all"
              />
              <p className="text-[10px] text-dark-brown/50 font-sans">
                Found in your receipt or confirmation email.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email-auth-input" className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                Customer Email Address *
              </label>
              <input
                id="email-auth-input"
                type="email"
                required
                placeholder="The email address used at checkout"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                className="w-full px-4 py-3 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:outline-none focus:border-burgundy focus:ring-1 focus:ring-burgundy transition-all"
              />
              <p className="text-[10px] text-dark-brown/50 font-sans">
                For customer privacy, order tracking details require email verification.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSearching}
                className="w-full btn-burgundy text-xs uppercase tracking-[0.2em] py-3.5 px-6 font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:shadow-md transition-all"
              >
                {isSearching ? (
                  <span>Verifying Credentials…</span>
                ) : (
                  <>
                    <Search className="w-4 h-4 text-gold" />
                    <span>Track Order Status</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Live Order Details & Milestone View */}
        <AnimatePresence>
          {matchedOrder && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Order Status Ribbon */}
              <div className="bg-white border border-[#E8E1D3] rounded-md p-6 sm:p-8 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EBE4D6] pb-6 mb-8">
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.24em] text-gold font-sans font-semibold">
                      Verified Order
                    </span>
                    <h2 className="font-editorial text-2xl sm:text-3xl text-dark-brown mt-1">
                      Order: {matchedOrder.orderNumber || matchedOrder.orderId}
                    </h2>
                    {matchedOrder.placedAt && (
                      <p className="text-xs text-dark-brown/60 font-sans mt-0.5">
                        Placed on {new Date(matchedOrder.placedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    )}
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-burgundy/10 text-burgundy text-xs font-semibold uppercase tracking-[0.18em]">
                      <span className="w-2 h-2 rounded-full bg-gold" />
                      {ORDER_STATUS_LABELS[matchedOrder.status]}
                    </span>
                    {matchedOrder.tracking?.estimatedDelivery && (
                      <p className="text-xs text-dark-brown/70 font-sans mt-2">
                        Estimated Delivery: <strong className="text-dark-brown">{matchedOrder.tracking.estimatedDelivery}</strong>
                      </p>
                    )}
                  </div>
                </div>

                {isOffPath && matchedOrder ? (
                  <div className="bg-red-50 border border-red-200 rounded-sm p-4 text-xs text-red-800 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                    <div>
                      <p className="font-semibold">Order status: {ORDER_STATUS_LABELS[matchedOrder.status]}</p>
                      <p className="text-[11px] mt-0.5 text-red-700">Please contact concierge@vernoxatelier.com if you have questions about this order.</p>
                    </div>
                  </div>
                ) : (
                  /* 5-Stage Visual Timeline */
                  <div className="mb-8">
                    <h3 className="text-xs uppercase tracking-[0.22em] text-dark-brown/80 font-sans font-semibold mb-6">
                      Fulfillment Progress
                    </h3>
                    <OrderProgress status={matchedOrder.status} />
                  </div>
                )}

                {/* Courier / Shipping Dispatch Details - Shown ONLY when real carrier/tracking data exists */}
                {matchedOrder.tracking?.number && (
                  <div className="bg-cream/50 rounded-sm border border-[#E0D7C6] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-sans">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center">
                        <Truck className="w-4 h-4 text-gold" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-dark-brown/60 block">
                          Carrier
                        </span>
                        <span className="font-semibold text-dark-brown">{matchedOrder.tracking?.carrier || 'Courier'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-dark-brown/60 block">
                          Tracking Reference
                        </span>
                        <span className="font-mono font-bold text-burgundy">{matchedOrder.tracking?.number}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Items in this Order */}
              <div className="bg-white border border-[#E8E1D3] rounded-md p-6 sm:p-8 shadow-xs">
                <h3 className="text-xs uppercase tracking-[0.22em] text-dark-brown/80 font-sans font-semibold mb-6 border-b border-[#EBE4D6] pb-3">
                  Ordered Items ({matchedOrder.items?.length ?? 0})
                </h3>

                <div className="divide-y divide-[#EBE4D6]">
                  {(matchedOrder.items || []).map((item, idx) => (
                    <div key={`${item.productId ?? item.name}-${idx}`} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-cream rounded-xs border border-[#E0D7C6] flex items-center justify-center shrink-0">
                          <Layers className="w-6 h-6 text-burgundy" />
                        </div>
                        <div>
                          <h4 className="font-editorial text-lg text-dark-brown font-medium leading-snug">{item.name}</h4>
                          <div className="text-[11px] text-dark-brown/60 font-sans mt-0.5">Qty: {item.quantity}</div>
                        </div>
                      </div>
                      {typeof item.lineTotal === 'number' && (
                        <div className="text-right font-mono text-xs font-semibold text-dark-brown">₹{item.lineTotal.toLocaleString('en-IN')}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Masked destination protecting privacy */}
                {matchedOrder.shippingCity && (
                  <div className="mt-8 pt-6 border-t border-[#EBE4D6] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs font-sans text-dark-brown/70">
                    <div className="flex items-start gap-2.5">
                      <MapPin className="w-4 h-4 text-burgundy shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-dark-brown block">Destination</span>
                        <span>{[matchedOrder.shippingCity, matchedOrder.shippingState].filter(Boolean).join(', ')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-dark-brown/80 font-sans">
                      <ShieldCheck className="w-4 h-4 text-gold" />
                      <span>Insured Transit</span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Customer Reassurance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 pt-12 border-t border-[#E8E1D3]">
          <div className="p-6 bg-white border border-[#E8E1D3] rounded-md space-y-2.5 text-center">
            <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy mx-auto flex items-center justify-center">
              <Truck className="w-5 h-5 text-gold" />
            </div>
            <h4 className="font-editorial text-lg text-dark-brown">Shipping & Packaging</h4>
            <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
              Carefully crated to protect finished surfaces during freight transit.
            </p>
          </div>

          <div className="p-6 bg-white border border-[#E8E1D3] rounded-md space-y-2.5 text-center">
            <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy mx-auto flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-gold" />
            </div>
            <h4 className="font-editorial text-lg text-dark-brown">Inspection Period</h4>
            <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
              Standard catalog pieces include an inspection return window. See our returns policy for details.
            </p>
          </div>

          <div className="p-6 bg-white border border-[#E8E1D3] rounded-md space-y-2.5 text-center">
            <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy mx-auto flex items-center justify-center">
              <PhoneCall className="w-5 h-5 text-gold" />
            </div>
            <h4 className="font-editorial text-lg text-dark-brown">Support & Inquiries</h4>
            <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
              Questions regarding delivery timing or specifications? Contact our team at concierge@vernoxatelier.com.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
