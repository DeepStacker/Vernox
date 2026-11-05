/**
 * Shipping console (permission orders.tracking): Packed orders waiting for a courier, parcels in
 * transit, and returns to sender. Booking, label and status actions call the staff order actions
 * in /api/admin (API.md); the server issues the GST invoice at booking and enforces the state
 * machine. Labels and manifests are fetched per order (the API has no bulk endpoint).
 */
import { useMemo, useState } from 'react';
import { AdminEmpty, AdminError, AdminLoading, AdminNotice, AdminPageHeader, Segmented } from '@/components/admin/AdminUi';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { AdminTabId } from '@/lib/auth/permissions';
import { DEFAULT_STORE_CONFIG, useStoreConfig } from '@/lib/data/settings';
import { useAdminOrdersInStatuses } from '@/lib/data/orders';
import { groupByStage } from '@/lib/orders/productionQueue';
import { SHIPPING_QUEUES, SHIPPING_STAGES, type ShippingQueue } from '@/lib/orders/shipping';
import { describeSellerFields, missingSellerFields } from '../settings/settingsForm';
import { ShipmentCard } from './ShipmentCard';

export function ShippingConsole({ onNavigate }: { onNavigate?: (tab: AdminTabId) => void }) {
  const { permissions } = useAuth();
  const config = useStoreConfig().data ?? DEFAULT_STORE_CONFIG;
  const feed = useAdminOrdersInStatuses(Boolean(permissions?.canManageShipping), SHIPPING_STAGES);
  const [queue, setQueue] = useState<ShippingQueue>('ready');

  const groups = useMemo(() => groupByStage(feed.orders, SHIPPING_STAGES), [feed.orders]);
  const inQueue = (id: ShippingQueue) => SHIPPING_QUEUES.find(q => q.id === id)?.statuses.flatMap(s => groups[s as (typeof SHIPPING_STAGES)[number]]) ?? [];
  const missingSeller = missingSellerFields(config.seller);
  const orders = inQueue(queue);
  const fromAddress = [config.seller?.address, config.seller?.city, config.seller?.state, config.seller?.pincode].filter(Boolean).join(', ');
  const openSettings = permissions?.canManageSettings ? () => onNavigate?.('settings') : undefined;

  return (
    <div className="animate-fade-in space-y-5">
      <AdminPageHeader title="Shipping" line="Book couriers, print labels and follow parcels until they are delivered." />
      {missingSeller.length > 0 && (
        <AdminNotice>
          Seller details are incomplete ({describeSellerFields(missingSeller)}). Shipments cannot be booked until they are set in Settings, because the GST invoice is issued at booking.{' '}
          {openSettings && <button type="button" onClick={openSettings} className="font-semibold underline">Open Settings</button>}
        </AdminNotice>
      )}
      <Segmented<ShippingQueue> label="Shipping queues" value={queue} onChange={setQueue}
        options={SHIPPING_QUEUES.map(q => ({ id: q.id, label: q.label, count: feed.isLoading ? undefined : inQueue(q.id).length }))} />
      {feed.error && <AdminError>Could not load orders: {feed.error.message}</AdminError>}
      {feed.isLoading && <AdminLoading />}
      {!feed.isLoading && orders.length === 0 && (
        <AdminEmpty title={queue === 'ready' ? 'Nothing is waiting for a courier' : queue === 'in_transit' ? 'No parcels in transit' : 'No parcels coming back'}
          hint={queue === 'ready' ? 'Orders appear here once QC marks them packed.' : undefined} />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {orders.map(order => (
          <ShipmentCard key={order.id} order={order} storeName={config.storeName} fromAddress={fromAddress} missingSeller={missingSeller} onOpenSettings={openSettings} />
        ))}
      </div>
      {feed.hasMore && (
        <button type="button" onClick={() => void feed.loadMore()} disabled={feed.isFetchingMore} className="btn-secondary">
          {feed.isFetchingMore ? 'Loading…' : 'Load more orders'}
        </button>
      )}
    </div>
  );
}
