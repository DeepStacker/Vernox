/**
 * Admin landing page: a focused "my work" view per role. Sections appear according to the
 * permission flags derived from STAFF_ROLE_PERMISSIONS, never from role names.
 */
import { useMemo } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canAccessTab, formatRole, type AdminTabId } from '@/lib/auth/permissions';
import { useAdminData } from '@/lib/data/adminData';
import { useB2bInquiries } from '@/lib/data/b2b';
import { ORDER_STATUS_LABELS } from '@/lib/orders/orderStateMachine';
import { isAssignedTo, oldestFirst, PRODUCTION_STAGES, stageCounts } from '@/lib/orders/productionQueue';
import { StatusBadge, SlaBadge } from '../shared/badges';
import { useWorkshopQueue } from '../shared/useWorkshopQueue';

type Go = (tab: AdminTabId) => void;

const Tile = ({ label, value, onClick, warn }: { label: string; value: number | string; onClick?: () => void; warn?: boolean }) => (
  <button type="button" onClick={onClick} className={`min-h-11 rounded-xl border p-4 text-left shadow-soft ${warn ? 'border-[#9B1C2E]/40 bg-[#FDE8EC]' : 'border-border/70 bg-card'}`}>
    <div className="font-display text-3xl text-oxblood-deep">{value}</div>
    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
  </button>
);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section aria-label={title} className="space-y-3"><h3 className="text-lg font-semibold">{title}</h3>{children}</section>;
}

function WorkshopSection({ go }: { go: Go }) {
  const who = useAuth().user?.email ?? '';
  const stages = [...PRODUCTION_STAGES, 'Packed'] as const;
  const queue = useWorkshopQueue(stages);
  const counts = stageCounts(queue.orders, stages);
  const active = useMemo(() => queue.orders.filter(o => PRODUCTION_STAGES.includes(o.status as (typeof PRODUCTION_STAGES)[number]) && o.status !== 'Quality_Check').sort(oldestFirst), [queue.orders]);
  const overdue = active.filter(o => queue.slaFor(o).level === 'overdue').length;
  const mine = queue.orders.filter(o => isAssignedTo(o, who)).length;
  return (
    <Section title="Workshop">
      {queue.error && <p role="alert" className="text-sm text-[#9B1C2E]">Could not load the queue: {queue.error.message}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stages.map(s => (
          <Tile key={s} label={s === 'Paid' ? 'Waiting to start' : ORDER_STATUS_LABELS[s]} value={queue.isLoading ? '…' : counts[s]}
            onClick={() => go(s === 'Quality_Check' || s === 'Packed' ? 'qc' : 'production')} />
        ))}
        <Tile label="Assigned to me" value={queue.isLoading ? '…' : mine} onClick={() => go('production')} />
      </div>
      {overdue > 0 && <p role="status" className="rounded-lg border border-[#9B1C2E]/30 bg-[#FDE8EC] p-3 text-sm text-[#9B1C2E]">{overdue} order(s) are past their lead time.</p>}
      <ol className="space-y-2">
        {active.slice(0, 8).map(o => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-card p-3 text-sm">
            <span className="font-mono font-semibold">{o.orderNumber || o.id}</span>
            <span className="flex items-center gap-2"><StatusBadge status={o.status} /><SlaBadge sla={queue.slaFor(o)} /></span>
          </li>
        ))}
        {!queue.isLoading && active.length === 0 && <li className="text-sm text-muted-foreground">Nothing waiting in production.</li>}
      </ol>
    </Section>
  );
}

function SupportSection({ go }: { go: Go }) {
  const { orders, ordersLoading } = useAdminData();
  const { permissions } = useAuth();
  const b2b = useB2bInquiries(Boolean(permissions?.canReadB2b));
  const open = orders.filter(o => !['Delivered', 'Cancelled', 'Refunded', 'Expired', 'Payment_Failed', 'Returned'].includes(o.status)).length;
  const newInquiries = (b2b.data ?? []).filter(i => i.status === 'pending_review').length;
  return (
    <Section title="Customers">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Open orders (recent)" value={ordersLoading ? '…' : open} onClick={() => go('support')} />
        {permissions?.canReadB2b && <Tile label="New trade enquiries" value={b2b.isLoading ? '…' : newInquiries} onClick={() => go('b2b')} warn={newInquiries > 0} />}
      </div>
    </Section>
  );
}

function CatalogSection({ go }: { go: Go }) {
  const { products } = useAdminData();
  const out = products.filter(p => p.trackInventory !== false && p.stock <= 0).length;
  const low = products.filter(p => p.trackInventory !== false && p.stock > 0 && p.stock <= 5).length;
  const samples = products.filter(p => p.isSample).length;
  return (
    <Section title="Catalog">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Out of stock" value={out} onClick={() => go('products')} warn={out > 0} />
        <Tile label="Low stock (5 or fewer)" value={low} onClick={() => go('products')} />
        <Tile label="Sample products to replace" value={samples} onClick={() => go('products')} warn={samples > 0} />
      </div>
    </Section>
  );
}

function DispatchSection({ go }: { go: Go }) {
  const { orders, ordersLoading } = useAdminData();
  const packed = orders.filter(o => o.status === 'Packed').length;
  return (
    <Section title="Dispatch">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Tile label="Packed, ready to ship" value={ordersLoading ? '…' : packed} onClick={() => go('orders')} /></div>
    </Section>
  );
}

export function RoleHome({ role, onSelectTab }: { role: NonNullable<ReturnType<typeof useAuth>['staffRole']>; onSelectTab: Go }) {
  const { permissions: p } = useAuth();
  if (!p) return null;
  const links: Array<[AdminTabId, string]> = [
    ['production', 'Production'], ['qc', 'QC and packing'], ['orders', 'Orders'], ['support', 'Support'], ['b2b', 'Trade enquiries'],
    ['products', 'Catalog'], ['analytics', 'Analytics'], ['roles', 'Team'],
  ];
  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl text-oxblood-deep">My work</h2>
        <p className="text-sm text-muted-foreground">Signed in as {formatRole(role)}.</p>
      </div>
      {p.canManageProduction && <WorkshopSection go={onSelectTab} />}
      {p.canManageShipping && !p.canManageProduction && <DispatchSection go={onSelectTab} />}
      {p.canManageSupport && <SupportSection go={onSelectTab} />}
      {p.canManageProducts && <CatalogSection go={onSelectTab} />}
      <Section title="Quick links">
        <div className="flex flex-wrap gap-2">
          {links.filter(([tab]) => canAccessTab(role, tab)).map(([tab, label]) => (
            <button key={tab} type="button" onClick={() => onSelectTab(tab)} className="min-h-11 rounded-lg border border-border bg-card px-4 text-sm font-semibold">{label}</button>
          ))}
        </div>
      </Section>
    </div>
  );
}
