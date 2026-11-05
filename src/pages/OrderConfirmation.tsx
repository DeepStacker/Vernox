import { useSeo } from '@/lib/seo';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, CheckCircle2, Clock, Printer } from 'lucide-react';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { OrderProgress } from '@/components/shop/OrderProgress';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useOrderLookup } from '@/lib/data/orderLookup';
import { ORDER_STATUS_LABELS } from '@/lib/orders/orderStateMachine';
import { isOffPathStatus } from '@/lib/orders/fulfilmentStages';

export default function OrderConfirmation() {
  useSeo({ title: 'Order confirmation', noindex: true });
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') ?? undefined;
  const { user } = useAuth();
  const { data: order, isLoading, error } = useOrderLookup(orderId, email, user?.uid);

  const awaitingPayment = order?.status === 'Pending_Payment';
  const confirmed = order && !awaitingPayment && !isOffPathStatus(order.status);

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-oxblood/80 selection:text-ivory">
      <SiteHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 md:py-20 w-full flex-1 space-y-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center space-y-4">
          <div className="w-14 h-14 rounded-[2px] bg-oxblood/10 border border-oxblood/20 mx-auto flex items-center justify-center">
            {awaitingPayment ? <Clock className="w-7 h-7 text-brass" /> : error ? <AlertCircle className="w-7 h-7 text-destructive" /> : <CheckCircle2 className="w-7 h-7 text-brass" />}
          </div>

          <div className="space-y-1">
            <h1 className="font-display text-3xl sm:text-5xl text-oxblood-deep font-semibold">
              {isLoading ? 'Looking up your order…' : error ? 'We could not load this order' : awaitingPayment ? 'Confirming your payment' : confirmed ? 'Thank you for your order' : 'Order update'}
            </h1>
            {error && (
              <p className="text-muted-foreground text-xs sm:text-sm max-w-lg mx-auto leading-relaxed">
                {error.message} If you just paid, your order is safe; try again in a minute or use{' '}
                <Link to="/track-order" className="underline text-oxblood">Track order</Link>.
              </p>
            )}
            {awaitingPayment && (
              <p className="text-muted-foreground text-xs sm:text-sm max-w-lg mx-auto leading-relaxed">
                We are waiting for your bank to confirm the payment. This page updates automatically.
              </p>
            )}
            {confirmed && (
              <p className="text-muted-foreground text-xs sm:text-sm max-w-lg mx-auto leading-relaxed">
                A confirmation has been sent to your email. We will update the status here as your piece moves through production.
              </p>
            )}
          </div>

          {order && (
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-[2px] bg-card border border-border/80 text-xs font-mono">
              <span className="text-muted-foreground">Order:</span>
              <span className="font-bold text-oxblood">{order.orderNumber || order.orderId}</span>
              <span className="text-muted-foreground">· {ORDER_STATUS_LABELS[order.status]}</span>
            </div>
          )}
        </motion.div>

        {confirmed && (
          <div className="bg-card border border-border/80 rounded-[2px] p-6 sm:p-8 shadow-soft space-y-6">
            <h2 className="font-display text-lg text-oxblood-deep font-semibold border-b border-border/60 pb-3">Progress</h2>
            <OrderProgress status={order.status} />
          </div>
        )}

        {order && (
          <div className="bg-card border border-border/80 rounded-lg p-6 sm:p-8 shadow-luxe space-y-6 print:border-none print:shadow-none">
            <div className="flex items-center justify-between border-b border-border/70 pb-4">
              <span className="font-brand text-xl font-bold tracking-[0.2em] text-oxblood-deep uppercase">VERNOX</span>
              <button onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-oxblood font-semibold border border-border px-3 py-1.5 rounded transition print:hidden">
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
            </div>

            {order.items && order.items.length > 0 && (
              <div className="divide-y divide-border/50">
                {order.items.map((item, idx) => (
                  <div key={`${item.productId ?? item.name}-${idx}`} className="py-4 flex gap-4 items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-display text-base font-semibold text-oxblood-deep">{item.name}</div>
                      <div className="text-xs text-muted-foreground">Qty: {item.quantity}</div>
                    </div>
                    {typeof item.lineTotal === 'number' && (
                      <div className="font-mono font-bold text-foreground text-xs">₹{item.lineTotal.toFixed(2)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-6 pt-4 border-t border-border/70 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Delivering to</div>
                <div className="text-muted-foreground leading-relaxed">
                  {[order.shippingCity, order.shippingState].filter(Boolean).join(', ') || 'Address on file'}
                </div>
                {order.tracking?.number && (
                  <div className="mt-2 text-muted-foreground">
                    Tracking: <span className="font-mono text-foreground">{order.tracking.carrier ? `${order.tracking.carrier} ` : ''}{order.tracking.number}</span>
                  </div>
                )}
              </div>
              {typeof order.total === 'number' && (
                <div className="sm:text-right text-sm font-bold text-oxblood">
                  <span className="text-xs text-muted-foreground font-normal mr-3">Total</span>
                  <span className="font-mono text-base">₹{order.total.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 print:hidden">
          <Link to="/shop" className="w-full sm:w-auto border border-oxblood/40 hover:border-oxblood text-oxblood text-xs uppercase tracking-widest font-semibold px-8 py-3.5 rounded-[2px] hover:bg-oxblood/5 transition text-center">
            Continue shopping
          </Link>
          <Link to="/track-order" className="w-full sm:w-auto bg-gradient-oxblood hover:bg-oxblood-deep text-primary-foreground text-xs uppercase tracking-widest font-semibold px-8 py-3.5 rounded-[2px] hover:shadow-luxe transition text-center flex items-center justify-center gap-2">
            Track this order <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
