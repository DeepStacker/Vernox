/**
 * Returns console (permission orders.update_status): customer return requests with reason, details
 * and photos; approve (refund or replacement) or reject with a reason; record the parcel as
 * received. Refunds are issued by finance (separation of duties, API.md); a replacement order is
 * created by the server when the return is received.
 */
import { useMemo, useState } from 'react';
import { AdminEmpty, AdminError, AdminLoading, AdminPageHeader, Segmented } from '@/components/admin/AdminUi';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { AdminTabId } from '@/lib/auth/permissions';
import { useAdminOrdersInStatuses } from '@/lib/data/orders';
import { groupByStage } from '@/lib/orders/productionQueue';
import { RETURN_QUEUES, RETURN_STAGES, type ReturnQueue } from '@/lib/orders/returns';
import { ReturnCard } from './ReturnCard';

export function ReturnsConsole({ onNavigate }: { onNavigate?: (tab: AdminTabId) => void }) {
  const { permissions } = useAuth();
  const feed = useAdminOrdersInStatuses(Boolean(permissions?.canUpdateOrders), RETURN_STAGES);
  const [queue, setQueue] = useState<ReturnQueue>('requested');

  const groups = useMemo(() => groupByStage(feed.orders, RETURN_STAGES), [feed.orders]);
  const inQueue = (id: ReturnQueue) => RETURN_QUEUES.find(q => q.id === id)?.statuses.flatMap(s => groups[s as (typeof RETURN_STAGES)[number]]) ?? [];
  const orders = inQueue(queue);

  return (
    <div className="animate-fade-in space-y-5">
      <AdminPageHeader title="Returns" line="Review return requests, approve or reject them, and record parcels as they arrive." />
      <Segmented<ReturnQueue> label="Return queues" value={queue} onChange={setQueue}
        options={RETURN_QUEUES.map(q => ({ id: q.id, label: q.label, count: feed.isLoading ? undefined : inQueue(q.id).length }))} />
      {feed.error && <AdminError>Could not load orders: {feed.error.message}</AdminError>}
      {feed.isLoading && <AdminLoading />}
      {!feed.isLoading && orders.length === 0 && <AdminEmpty title="Nothing here" hint="Return requests appear when a customer raises one on a delivered order." />}
      <div className="grid gap-4 lg:grid-cols-2">
        {orders.map(order => <ReturnCard key={order.id} order={order} onNavigate={onNavigate} />)}
      </div>
      {feed.hasMore && (
        <button type="button" onClick={() => void feed.loadMore()} disabled={feed.isFetchingMore} className="btn-secondary">
          {feed.isFetchingMore ? 'Loading…' : 'Load more orders'}
        </button>
      )}
    </div>
  );
}
