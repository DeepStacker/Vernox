import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { StoreLayout } from '@/components/shop/StoreLayout';
import { PageHeader } from '@/components/shop/PageHeader';
import { OrderDetails } from '@/components/shop/OrderDetails';
import { useAuth } from '@/lib/auth/AuthProvider';
import { lookupOrder } from '@/lib/data/orderLookup';
import { fetchPublicOrderStatus } from '@/lib/data/orders';
import { useSeo } from '@/lib/seo';
import { safeSession } from '@/lib/safeStorage';
import type { PublicOrderSummary } from '@/types/store';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000;
const RL_KEY = 'vnx_track_rl';

const getRateLimitState = () => safeSession.getJson(RL_KEY, { count: 0, lockedUntil: 0 });

function recordFailedAttempt(): void {
  const nextCount = getRateLimitState().count + 1;
  safeSession.setJson(RL_KEY, { count: nextCount, lockedUntil: nextCount >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_WINDOW_MS : 0 });
}

export default function TrackOrder() {
  useSeo({ title: 'Track your order', noindex: true });
  const { user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  // Only the order reference may come from the URL; an email in a link would leak into history and logs.
  const [orderInput, setOrderInput] = useState(searchParams.get('id') || '');
  const [emailInput, setEmailInput] = useState(profile?.email || '');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<{ order: PublicOrderSummary; email: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const id = orderInput.trim();
    const email = emailInput.trim().toLowerCase();
    if (!id || !email) {
      toast.error('Enter your order number and email.');
      return;
    }
    // Client-side throttle; the server enforces its own limits as well.
    const { lockedUntil } = getRateLimitState();
    if (lockedUntil > Date.now()) {
      toast.error(`Too many attempts. Please wait ${Math.ceil((lockedUntil - Date.now()) / 1000)}s.`);
      return;
    }
    setSearching(true);
    try {
      const order = user ? await lookupOrder(id, email, user.uid) : await fetchPublicOrderStatus(id, email);
      safeSession.remove(RL_KEY);
      setFound({ order, email });
    } catch (err) {
      recordFailedAttempt();
      setFound(null);
      // Same wording for "no such order" and "wrong email" so order numbers cannot be enumerated.
      toast.error(err instanceof Error && !/match|found|verify/i.test(err.message) ? err.message : 'We could not find an order with those details.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <StoreLayout>
      <div className="container max-w-2xl py-6 sm:py-10">
        <PageHeader title="Track order" crumbs={[{ label: 'Track order' }]} />
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6">
          <label className="block text-sm font-medium">Order number
            <input required value={orderInput} onChange={e => setOrderInput(e.target.value)} className="field mt-1 font-normal" autoComplete="off" />
          </label>
          <label className="block text-sm font-medium">Email used at checkout
            <input required type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} className="field mt-1 font-normal" autoComplete="email" />
          </label>
          <button type="submit" disabled={searching} className="btn-primary w-full">
            <Search className="h-4 w-4" aria-hidden="true" /> {searching ? 'Checking...' : 'Track order'}
          </button>
        </form>

        {found && <div className="mt-6"><OrderDetails order={found.order} email={found.email} /></div>}
      </div>
    </StoreLayout>
  );
}
