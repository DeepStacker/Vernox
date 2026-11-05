import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';
import { StoreLayout } from '@/components/shop/StoreLayout';
import { PageHeader } from '@/components/shop/PageHeader';
import { OrderDetails } from '@/components/shop/OrderDetails';
import { ErrorState, LoadingBlock } from '@/components/shop/StateViews';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useOrderLookup } from '@/lib/data/orderLookup';
import { isOffPathStatus } from '@/lib/orders/fulfilmentStages';
import { useSeo } from '@/lib/seo';

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
    <StoreLayout>
      <div className="container max-w-2xl py-6 sm:py-10">
        <PageHeader crumbs={[{ label: 'Order confirmation' }]} />
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-burgundy/10">
            {awaitingPayment ? <Clock className="h-7 w-7 text-brass" aria-hidden="true" /> : <CheckCircle2 className="h-7 w-7 text-brass" aria-hidden="true" />}
          </span>
          <h1 className="font-display text-3xl sm:text-4xl">
            {isLoading ? 'Finding your order...' : error ? 'We could not load this order' : awaitingPayment ? 'Confirming your payment' : confirmed ? 'Thank you for your order' : 'Order update'}
          </h1>
          {awaitingPayment && <p className="mt-1 text-sm text-muted-foreground">This page updates by itself.</p>}
          {confirmed && <p className="mt-1 text-sm text-muted-foreground">A confirmation is on its way to your email.</p>}
        </div>

        {isLoading && <LoadingBlock className="h-56" />}
        {error && <ErrorState>{error.message} Your order is safe if you just paid. Try again shortly or use <Link to="/track-order" className="font-semibold underline">Track order</Link>.</ErrorState>}
        {order && <OrderDetails order={order} email={email} />}

        <div className="mt-6 flex flex-wrap justify-center gap-3 print:hidden">
          <Link to="/shop" className="btn-primary">Continue shopping</Link>
          <Link to="/track-order" className="btn-secondary">Track another order</Link>
        </div>
      </div>
    </StoreLayout>
  );
}
