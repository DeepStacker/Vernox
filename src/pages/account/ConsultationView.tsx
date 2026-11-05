import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { StoreLayout } from '@/components/shop/StoreLayout';
import { PageHeader } from '@/components/shop/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/shop/StateViews';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCart } from '@/lib/cartContext';
import { finishName, formatSizeCm } from '@/lib/catalog';
import { useCatalog } from '@/lib/catalogContext';
import { closeConsultation, consultationKey, requestRevision, useConsultation } from '@/lib/consultations/consultations';
import { canRequestRevision, catalogueCartLine, creditState, customerStatus } from '@/lib/consultations/consultationModel';
import { useSeo } from '@/lib/seo';
import { trackSpaceEvent } from '@/lib/spaces/analytics';
import { usePhotoUrl } from '@/lib/spaces/usePhotoUrl';
import { formatINR } from '@/lib/storefront/format';
import { FREE_REVISIONS, type ConsultationDoc, type ProposalItem } from '@/types/consultation';

const day = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function Preview({ path, alt }: { path: string | null; alt: string }) {
  const photo = usePhotoUrl(path);
  if (photo.url) return <img src={photo.url} alt={alt} className="aspect-[4/3] w-full rounded-lg border border-border object-cover" />;
  return <div className="grid aspect-[4/3] place-items-center rounded-lg border border-border bg-secondary text-sm text-muted-foreground">{photo.loading ? 'Loading preview' : 'Preview unavailable'}</div>;
}

function CreditPanel({ c }: { c: ConsultationDoc }) {
  const state = creditState(c, Date.now());
  if (state === 'none' || !c.credit) return null;
  return (
    <section className="rounded-lg border border-brass/40 bg-card p-4" aria-label="Your credit">
      <p className="eyebrow">Your credit</p>
      {state === 'available' ? (
        <>
          <p className="mt-1 text-sm">{formatINR(c.credit.amountInr)} off your next order until {day(c.credit.expiresAt)}. It is applied in your cart automatically.</p>
          <p className="mt-2 font-mono text-lg tracking-wider">{c.credit.code}</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{state === 'redeemed' ? 'Your credit has been used on an order.' : 'Your credit has expired.'}</p>
      )}
    </section>
  );
}

function ItemCard({ item, c, price }: { item: ProposalItem; c: ConsultationDoc; price: number | null }) {
  const { products } = useCatalog();
  const { add } = useCart();
  const [busy, setBusy] = useState(false);

  const addToCart = async () => {
    setBusy(true);
    try {
      if (item.kind === 'catalogue') {
        const line = catalogueCartLine(item, products);
        if (!line) return toast.error('This piece is not available right now. Ask your designer for an alternative.');
        add(line);
      } else {
        // The studio (geometry, pricing) loads only when a custom design is added.
        const { toCartLine, parseStudioDocument } = await import('@/lib/studio/api');
        add(toCartLine(parseStudioDocument(JSON.parse(item.designRef!))));
      }
      trackSpaceEvent('proposal_item_added_to_cart', { consultationId: c.id, kind: item.kind });
    } catch {
      toast.error('Could not add this piece. Please contact your designer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="space-y-3">
      <Preview path={item.previewPath} alt={`${item.productName} on your wall`} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl">{item.productName}</p>
          <p className="text-sm text-muted-foreground">
            {formatSizeCm(item)} · {finishName(item.finish)}{price !== null ? ` · ${formatINR(price)}` : ''}
          </p>
          {item.note && <p className="mt-1 text-sm">{item.note}</p>}
        </div>
        <button type="button" onClick={addToCart} disabled={busy} className="btn-primary px-4 py-2">Add to cart</button>
      </div>
    </li>
  );
}

/** `/account/consultations/:id`: the customer's consultation, and the proposal once it is sent. */
export default function ConsultationView() {
  const { id } = useParams();
  useSeo({ title: 'Design consultation', noindex: true });
  const { user, loading } = useAuth();
  const { products } = useCatalog();
  const qc = useQueryClient();
  const { data: c, isLoading, error } = useConsultation(id, !!user);
  const [revising, setRevising] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
  const viewed = useRef(false);

  useEffect(() => {
    if (!c?.proposal || viewed.current) return;
    viewed.current = true;
    trackSpaceEvent('proposal_viewed', { consultationId: c.id, version: c.proposal.version, items: c.proposal.items.length });
  }, [c]);

  // Prices of custom designs come from the studio's shared pricing function; the server re-prices at checkout.
  useEffect(() => {
    const customs = c?.proposal?.items.filter(i => i.kind === 'custom') ?? [];
    if (customs.length === 0) return;
    let cancelled = false;
    import('@/lib/studio/api').then(({ toCartLine, parseStudioDocument }) => {
      const next: Record<string, number> = {};
      for (const item of customs) {
        try { next[item.id] = toCartLine(parseStudioDocument(JSON.parse(item.designRef!))).unitPrice; } catch { /* shown without a price */ }
      }
      if (!cancelled) setCustomPrices(next);
    });
    return () => { cancelled = true; };
  }, [c?.proposal]);

  if (loading || isLoading) return <StoreLayout><div className="container py-10"><LoadingBlock /></div></StoreLayout>;
  const crumbs = [{ label: 'Account', to: '/account' }, { label: 'My Space', to: '/account/spaces' }, { label: 'Consultation' }];
  if (!user) return <StoreLayout><div className="container py-10"><EmptyState title="Sign in to see your consultation" action={{ label: 'Sign in', to: '/account' }} /></div></StoreLayout>;
  const notYours = (error as { code?: string } | null)?.code === 'permission-denied';
  if (error && !notYours) return <StoreLayout><div className="container py-10"><ErrorState>We could not load this consultation.</ErrorState></div></StoreLayout>;
  if (!c) return <StoreLayout><div className="container py-10"><EmptyState title="Consultation not found" action={{ label: 'My Space', to: '/account/spaces' }} /></div></StoreLayout>;

  const refresh = () => qc.invalidateQueries({ queryKey: consultationKey(c.id) });
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); toast.success(done); await refresh(); return true; }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.'); return false; }
    finally { setBusy(false); }
  };

  const proposal = c.proposal;
  const priceOf = (item: ProposalItem): number | null => {
    if (item.kind === 'custom') return customPrices[item.id] ?? null;
    return catalogueCartLine(item, products)?.unitPrice ?? null;
  };

  return (
    <StoreLayout>
      <div className="container max-w-4xl space-y-8 py-6 sm:py-10">
        <PageHeader title="Design consultation" line={c.spaceName} crumbs={crumbs} actions={<span className="badge-pill">{customerStatus(c)}</span>} />

        {(c.status === 'new' || c.status === 'in_progress') && (
          <section className="rounded-lg border border-border bg-card p-5">
            <p className="font-display text-xl">{c.revisionsUsed > 0 ? 'Your designer is revising the proposal.' : 'Your designer is looking at your walls.'}</p>
            <p className="mt-1 text-sm text-muted-foreground">You will get an email when it is ready, by {day(c.dueAt)}.</p>
            {c.revisionNote && <p className="mt-3 text-sm"><span className="text-muted-foreground">Your request: </span>{c.revisionNote}</p>}
          </section>
        )}

        {proposal && (
          <section className="space-y-8" aria-label="Proposal">
            {proposal.note && <p className="rounded-lg border border-border bg-card p-4 text-sm">{proposal.note}</p>}
            {c.walls.filter(w => proposal.items.some(i => i.wallId === w.id)).map(wall => (
              <div key={wall.id} className="space-y-4">
                <h2 className="font-display text-2xl">{wall.name} <span className="text-base font-sans text-muted-foreground">{wall.widthCm} × {wall.heightCm} cm</span></h2>
                <ul className="grid gap-6 sm:grid-cols-2">
                  {proposal.items.filter(i => i.wallId === wall.id).map(item => <ItemCard key={item.id} item={item} c={c} price={priceOf(item)} />)}
                </ul>
              </div>
            ))}
            {c.status === 'proposed' && (
              <div className="flex flex-wrap gap-3 border-t border-border pt-5">
                <button type="button" disabled={busy} onClick={() => run(() => closeConsultation(c.id, 'accepted'), 'Thank you. Add the pieces you like to your cart.')} className="btn-primary">I like this proposal</button>
                {canRequestRevision(c) && <button type="button" disabled={busy} onClick={() => setRevising(true)} className="btn-secondary">Ask for a revision</button>}
                <button type="button" disabled={busy} onClick={() => run(() => closeConsultation(c.id, 'declined'), 'Consultation closed.')} className="btn-secondary">Not for me</button>
              </div>
            )}
            {c.status === 'proposed' && !canRequestRevision(c) && c.revisionsUsed >= FREE_REVISIONS && (
              <p className="text-sm text-muted-foreground">Your free revision has been used. Contact us if you would like more changes.</p>
            )}
          </section>
        )}

        <CreditPanel c={c} />
        <Link to="/account/spaces" className="inline-block text-sm text-burgundy underline underline-offset-4">Back to My Space</Link>
      </div>

      <Dialog open={revising} onOpenChange={open => !open && !busy && setRevising(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Ask for a revision</DialogTitle>
            <DialogDescription>You have one free revision. Tell your designer what to change.</DialogDescription>
          </DialogHeader>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} maxLength={1000} className="field" aria-label="What should change" />
          <button
            type="button"
            disabled={busy || message.trim().length < 3}
            onClick={async () => { if (await run(() => requestRevision(c.id, message.trim()), 'Sent to your designer.')) { setRevising(false); setMessage(''); } }}
            className="btn-primary"
          >
            Send
          </button>
        </DialogContent>
      </Dialog>
    </StoreLayout>
  );
}
