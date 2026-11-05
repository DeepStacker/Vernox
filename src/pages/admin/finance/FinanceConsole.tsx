/**
 * Finance console (orders.refund / reports.export): payments (prepaid captured, COD collected and
 * pending), refunds with the refund ceiling, GST invoices and credit notes, reconciliation lists
 * and CSV export. Money comes from the server-written fields on each order; every refund goes
 * through CREATE_REFUND, which re-checks the ceiling and is idempotent per attempt.
 */
import { useMemo, useState } from 'react';
import { AdminEmpty, AdminError, AdminLoading, AdminNotice, AdminPageHeader, AdminSection, Segmented, StatTile } from '@/components/admin/AdminUi';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAdminOrders } from '@/lib/data/orders';
import { DEFAULT_STORE_CONFIG, useStoreConfig } from '@/lib/data/settings';
import { collectedPaise, formatInr, paymentState, paymentTotals, reconcile, totalPaise, type PaymentState } from '@/lib/orders/finance';
import type { Order } from '@/types/store';
import { Badge, StatusBadge, type BadgeTone } from '../shared/badges';
import { ExportPanel } from './ExportPanel';
import { OrderFinancePanel } from './OrderFinancePanel';

type View = 'payments' | 'refunds' | 'reconciliation' | 'export';

const STATE_BADGE: Record<PaymentState, { label: string; tone: BadgeTone }> = {
  prepaid_captured: { label: 'Captured', tone: 'good' },
  prepaid_unpaid: { label: 'No payment', tone: 'neutral' },
  cod_collected: { label: 'COD collected', tone: 'good' },
  cod_pending: { label: 'COD pending', tone: 'warn' },
  replacement: { label: 'Replacement', tone: 'neutral' },
};

function OrderRow({ order, selected, onSelect }: { order: Order; selected: boolean; onSelect: () => void }) {
  const state = STATE_BADGE[paymentState(order)];
  return (
    <li>
      <button type="button" onClick={onSelect} aria-pressed={selected}
        className={`min-h-11 w-full rounded-lg border p-3 text-left text-sm ${selected ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono font-semibold">{order.orderNumber ?? order.id}</span>
          <span className="flex items-center gap-2"><Badge tone={state.tone}>{state.label}</Badge><StatusBadge status={order.status} /></span>
        </div>
        <div className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
          <span>{new Date(order.placedAt).toLocaleDateString('en-IN')}</span>
          <span className="font-mono">{formatInr(totalPaise(order))} · collected {formatInr(collectedPaise(order))}{(order.ops?.refundedPaise ?? 0) > 0 ? ` · refunded ${formatInr(order.ops?.refundedPaise ?? 0)}` : ''}</span>
        </div>
      </button>
    </li>
  );
}

function OrderList({ orders, selectedId, onSelect, empty }: { orders: readonly Order[]; selectedId: string | null; onSelect: (id: string) => void; empty: string }) {
  if (orders.length === 0) return <AdminEmpty title={empty} />;
  return <ul className="space-y-2">{orders.map(o => <OrderRow key={o.id} order={o} selected={o.id === selectedId} onSelect={() => onSelect(o.id)} />)}</ul>;
}

export function FinanceConsole() {
  const { permissions } = useAuth();
  const config = useStoreConfig().data ?? DEFAULT_STORE_CONFIG;
  const feed = useAdminOrders(Boolean(permissions?.canManageFinance));
  const [view, setView] = useState<View>('payments');
  const [filter, setFilter] = useState<'all' | PaymentState>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const totals = useMemo(() => paymentTotals(feed.orders), [feed.orders]);
  const recon = useMemo(() => reconcile(feed.orders), [feed.orders]);
  const withRefunds = useMemo(() => feed.orders.filter(o => (o.ops?.refundedPaise ?? 0) > 0 || (o.ops?.refundPendingPaise ?? 0) > 0 || (o.ops?.refunds.length ?? 0) > 0), [feed.orders]);
  const payments = useMemo(() => feed.orders.filter(o => o.ops && (filter === 'all' ? paymentState(o) !== 'prepaid_unpaid' || o.status !== 'Pending_Payment' : paymentState(o) === filter)), [feed.orders, filter]);
  const selected = feed.orders.find(o => o.id === selectedId) ?? null;

  const views: Array<{ id: View; label: string; count?: number }> = [
    { id: 'payments', label: 'Payments' },
    { id: 'refunds', label: 'Refunds', count: withRefunds.length },
    { id: 'reconciliation', label: 'Reconciliation', count: recon.paidWithoutPaymentId.length + recon.flagged.length + recon.refundsPending.length + recon.codNotCollected.length },
    ...(permissions?.canExportReports ? [{ id: 'export' as const, label: 'Export' }] : []),
  ];

  const list = (() => {
    if (view === 'payments') {
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Prepaid captured" value={formatInr(totals.prepaidCapturedPaise)} />
            <StatTile label="COD collected" value={formatInr(totals.codCollectedPaise)} />
            <StatTile label="COD pending" value={formatInr(totals.codPendingPaise)} warn={totals.codPendingPaise > 0} />
            <StatTile label="Refunded" value={formatInr(totals.refundedPaise)} />
          </div>
          <Segmented<"all" | PaymentState> label="Payment filter" value={filter} onChange={setFilter}
            options={[{ id: 'all', label: 'All' }, { id: 'prepaid_captured', label: 'Prepaid' }, { id: 'cod_collected', label: 'COD collected' }, { id: 'cod_pending', label: 'COD pending' }]} />
          <OrderList orders={payments} selectedId={selectedId} onSelect={setSelectedId} empty="No orders match" />
        </div>
      );
    }
    if (view === 'refunds') return <OrderList orders={withRefunds} selectedId={selectedId} onSelect={setSelectedId} empty="No refunds in the loaded orders" />;
    if (view === 'reconciliation') {
      return (
        <div className="space-y-5">
          <AdminSection title="Paid without a payment id" count={recon.paidWithoutPaymentId.length}>
            <OrderList orders={recon.paidWithoutPaymentId} selectedId={selectedId} onSelect={setSelectedId} empty="All prepaid orders have a payment id" />
          </AdminSection>
          <AdminSection title="Flagged payments" count={recon.flagged.length}>
            <OrderList orders={recon.flagged} selectedId={selectedId} onSelect={setSelectedId} empty="No payment discrepancies" />
          </AdminSection>
          <AdminSection title="Refunds waiting for Razorpay" count={recon.refundsPending.length}>
            <OrderList orders={recon.refundsPending} selectedId={selectedId} onSelect={setSelectedId} empty="No refunds are pending" />
          </AdminSection>
          <AdminSection title="Delivered COD, cash not recorded" count={recon.codNotCollected.length}>
            <OrderList orders={recon.codNotCollected} selectedId={selectedId} onSelect={setSelectedId} empty="All delivered COD orders have cash recorded" />
          </AdminSection>
        </div>
      );
    }
    return <ExportPanel sellerState={config.seller?.state} />;
  })();

  return (
    <div className="animate-fade-in space-y-5">
      <AdminPageHeader title="Finance" line="Payments, refunds, GST documents and reconciliation." />
      <Segmented<View> label="Finance views" value={view} onChange={v => { setView(v); setSelectedId(null); }} options={views} />
      {view !== 'export' && <AdminNotice tone="info">Showing the {feed.orders.length} most recent orders loaded{feed.hasMore ? '; load more below to widen the totals' : ''}. Use Export for a full date range.</AdminNotice>}
      {feed.error && <AdminError>Could not load orders: {feed.error.message}</AdminError>}
      {feed.isLoading && <AdminLoading />}
      {!feed.isLoading && (
        <div className={view === 'export' ? '' : 'grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'}>
          <div className="space-y-3">
            {list}
            {view !== 'export' && feed.hasMore && (
              <button type="button" className="btn-secondary" disabled={feed.isFetchingMore} onClick={() => void feed.loadMore()}>{feed.isFetchingMore ? 'Loading…' : 'Load older orders'}</button>
            )}
          </div>
          {view !== 'export' && (
            <aside aria-label="Order finance detail" className="lg:sticky lg:top-0 lg:self-start">
              {selected ? <OrderFinancePanel key={selected.id} order={selected} /> : <AdminEmpty title="Select an order" hint="See its money, refunds, invoice and credit notes." />}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
