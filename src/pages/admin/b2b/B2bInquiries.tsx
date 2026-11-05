/**
 * Trade / B2B enquiries from the public Trade form. Visible to roles with b2b.read (support, order
 * manager, admin, super admin); the same roles may change the enquiry status (firestore.rules).
 */
import { useState } from 'react';
import { B2B_STATUSES, B2B_STATUS_LABELS, useB2bInquiries, useB2bMutations, type B2bInquiry, type B2bStatus } from '@/lib/data/b2b';
import { normaliseIndianPhone } from '@/lib/orders/orderSearch';
import { useAuth } from '@/lib/auth/AuthProvider';

const FIELDS: Array<[string, keyof B2bInquiry]> = [
  ['Company', 'company'], ['Phone', 'phone'], ['Project type', 'projectType'], ['Volume', 'volume'],
  ['Alloy preference', 'alloyPreference'], ['Timeline', 'timeline'], ['Reference', 'refId'],
];

export function B2bInquiries() {
  const { permissions } = useAuth();
  const { data = [], isLoading, error } = useB2bInquiries(Boolean(permissions?.canReadB2b));
  const { setInquiryStatus } = useB2bMutations();
  const [filter, setFilter] = useState<B2bStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = data.filter(i => filter === 'all' || i.status === filter);
  const selected = data.find(i => i.id === selectedId) ?? null;
  const count = (s: B2bStatus) => data.filter(i => i.status === s).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl text-oxblood-deep">Trade enquiries</h2>
        <p className="text-sm text-muted-foreground">Enquiries from the Trade page. Reply by email or phone, then record the outcome.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {(['all', ...B2B_STATUSES] as const).map(s => (
          <button key={s} type="button" role="tab" aria-selected={filter === s} onClick={() => setFilter(s)}
            className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${filter === s ? 'bg-oxblood text-ivory' : 'bg-muted/50 text-muted-foreground'}`}>
            {s === 'all' ? `All (${data.length})` : `${B2B_STATUS_LABELS[s]} (${count(s)})`}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-[#9B1C2E]">Could not load enquiries: {error.message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ul className="space-y-2">
          {!isLoading && visible.length === 0 && <li className="text-sm text-muted-foreground">No enquiries in this view.</li>}
          {visible.map(i => (
            <li key={i.id}>
              <button type="button" onClick={() => setSelectedId(i.id)}
                className={`min-h-11 w-full rounded-lg border p-3 text-left text-sm ${i.id === selectedId ? 'border-oxblood bg-oxblood/5' : 'border-border/70 bg-card'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{i.company || i.name}</span>
                  <span className="text-xs rounded-full bg-muted px-2 py-0.5">{B2B_STATUS_LABELS[i.status]}</span>
                </div>
                <div className="text-xs text-muted-foreground">{i.name} · {i.createdAt ? new Date(i.createdAt).toLocaleDateString('en-IN') : 'date unknown'}</div>
              </button>
            </li>
          ))}
        </ul>

        {selected ? (
          <article className="rounded-xl border border-border/70 bg-card p-4 space-y-4">
            <header>
              <h3 className="text-lg font-semibold">{selected.name}</h3>
              <a className="text-sm underline" href={`mailto:${selected.email}`}>{selected.email}</a>
              {normaliseIndianPhone(selected.phone) && <> · <a className="text-sm underline" href={`tel:+${normaliseIndianPhone(selected.phone)}`}>{selected.phone}</a></>}
            </header>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {FIELDS.map(([label, key]) => selected[key] ? (
                <div key={key}><dt className="text-xs text-muted-foreground">{label}</dt><dd>{String(selected[key])}</dd></div>
              ) : null)}
            </dl>
            {selected.notes && <p className="whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-sm">{selected.notes}</p>}
            <div className="flex flex-wrap gap-2">
              {B2B_STATUSES.filter(s => s !== 'pending_review').map(s => (
                <button key={s} type="button" disabled={selected.status === s} onClick={() => void setInquiryStatus({ id: selected.id, status: s })}
                  className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:bg-oxblood disabled:text-ivory">
                  Mark {B2B_STATUS_LABELS[s].toLowerCase()}
                </button>
              ))}
            </div>
          </article>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Select an enquiry to see the details.</p>
        )}
      </div>
    </div>
  );
}
