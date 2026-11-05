/**
 * Consultations console (permission consultations.read; actions need consultations.manage): the
 * designer queue (new, in progress, proposed, closed) with the turnaround clock, the customer's walls,
 * photos, measurements and notes, and the proposal builder. Workflow rules: api/_lib/proposals.ts.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AdminEmpty, AdminError, AdminLoading, AdminNotice, AdminPageHeader, AdminSection, Segmented } from '@/components/admin/AdminUi';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ROOMS } from '@/lib/catalog';
import {
  ADMIN_CONSULTATIONS_KEY, claimConsultation, useAdminConsultations,
} from '@/lib/consultations/consultations';
import { STATUS_LABEL, consultationSla, type SlaLevel } from '@/lib/consultations/consultationModel';
import { usePhotoUrl } from '@/lib/spaces/usePhotoUrl';
import { cn } from '@/lib/utils';
import { BUDGET_BANDS, CONSULTATION_STATUSES, type ConsultationDoc, type ConsultationStatus, type SpaceWall } from '@/types/consultation';
import { ProposalBuilder } from './ProposalBuilder';

const day = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const SLA_STYLE: Record<SlaLevel, string> = {
  ok: 'bg-secondary text-secondary-foreground',
  due_soon: 'bg-amber-100 text-amber-900',
  overdue: 'bg-destructive/10 text-destructive',
  done: 'bg-secondary text-muted-foreground',
};

function SlaBadge({ c }: { c: ConsultationDoc }) {
  const sla = consultationSla(c, Date.now());
  if (sla.level === 'done') return <span className="text-xs text-muted-foreground">{c.status === 'proposed' ? 'Sent' : 'Done'}</span>;
  const text = sla.level === 'overdue' ? `${-sla.daysLeft} d overdue` : sla.level === 'due_soon' ? 'Due today' : `${sla.daysLeft} d left`;
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', SLA_STYLE[sla.level])}>{text}</span>;
}

function WallPhoto({ wall, ready }: { wall: SpaceWall; ready: boolean }) {
  const photo = usePhotoUrl(wall.photoPath, ready);
  return (
    <figure className="space-y-2">
      {photo.url ? <img src={photo.url} alt={`${wall.name} photo`} className="aspect-[4/3] w-full rounded-lg border border-border object-cover" />
        : <div className="grid aspect-[4/3] place-items-center rounded-lg border border-border bg-secondary text-sm text-muted-foreground">{!wall.photoPath ? 'No photo' : !ready ? 'Photo not copied yet' : photo.loading ? 'Loading' : 'Photo unavailable'}</div>}
      <figcaption className="text-sm">
        <span className="font-semibold">{wall.name}</span> · {wall.widthCm} × {wall.heightCm} cm{wall.pxPerCm ? '' : ' · no scale'}
        {wall.notes && <span className="block text-muted-foreground">{wall.notes}</span>}
      </figcaption>
    </figure>
  );
}

function Detail({ c, onBack }: { c: ConsultationDoc; onBack: () => void }) {
  const { user, staffRole, permissions } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const canManage = permissions?.canManageConsultations === true;
  const isAdmin = staffRole === 'admin' || staffRole === 'super_admin';
  const mine = c.assignedUid === user?.uid || (isAdmin && !!c.assignedUid);
  const editable = canManage && c.status === 'in_progress' && mine;
  const budget = BUDGET_BANDS.find(b => b.id === c.budgetBand)?.label;

  const claim = async () => {
    setBusy(true);
    try {
      await claimConsultation(c.id);
      await qc.invalidateQueries({ queryKey: ADMIN_CONSULTATIONS_KEY });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not claim this consultation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground underline underline-offset-4">Back to the queue</button>
      <AdminPageHeader
        title={c.spaceName}
        line={`${ROOMS.find(r => r.id === c.roomType)?.name ?? c.roomType} · ${c.customerName} · ${STATUS_LABEL[c.status]} · due ${day(c.dueAt)}`}
        actions={canManage && c.status !== 'closed' && !(c.assignedUid === user?.uid) ? <button type="button" onClick={claim} disabled={busy} className="btn-primary">{c.assignedUid ? 'Take over' : 'Claim'}</button> : undefined}
      />
      {!c.photosReady && c.walls.some(w => w.photoPath) && <AdminNotice>The wall photos have not been copied yet. Claim the consultation to retry.</AdminNotice>}
      {(budget || c.notes) && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          {budget && <p><span className="text-muted-foreground">Budget: </span>{budget}</p>}
          {c.notes && <p className="mt-1"><span className="text-muted-foreground">Notes: </span>{c.notes}</p>}
        </div>
      )}
      <AdminSection title="Walls" count={c.walls.length}>
        <div className="grid gap-4 sm:grid-cols-2">{c.walls.map(w => <WallPhoto key={w.id} wall={w} ready={c.photosReady} />)}</div>
      </AdminSection>
      {editable && <ProposalBuilder consultation={c} onSent={onBack} />}
      {c.status === 'proposed' && c.proposal && <AdminNotice tone="info">Proposal version {c.proposal.version} sent {day(c.proposal.sentAt)} with {c.proposal.items.length} pieces. It reopens when the customer asks for a revision.</AdminNotice>}
      {c.status === 'closed' && <AdminNotice tone="info">Closed: {c.outcome === 'accepted' ? 'the customer accepted the proposal' : 'the customer declined or closed it'}.</AdminNotice>}
    </div>
  );
}

export function ConsultationsConsole() {
  const { permissions } = useAuth();
  const feed = useAdminConsultations(Boolean(permissions?.canReadConsultations));
  const [queue, setQueue] = useState<ConsultationStatus>('new');
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(() => feed.data ?? [], [feed.data]);
  const counts = useMemo(() => Object.fromEntries(CONSULTATION_STATUSES.map(s => [s, all.filter(c => c.status === s).length])) as Record<ConsultationStatus, number>, [all]);
  // Oldest due first: the next deadline leads.
  const rows = useMemo(() => all.filter(c => c.status === queue).sort((a, b) => a.dueAt - b.dueAt), [all, queue]);
  const open = all.find(c => c.id === openId);

  if (open) return <div className="animate-fade-in"><Detail c={open} onBack={() => setOpenId(null)} /></div>;

  return (
    <div className="animate-fade-in space-y-5">
      <AdminPageHeader title="Consultations" line="Customers who paid for design help. Open one to see their walls and build a proposal." />
      <Segmented<ConsultationStatus> label="Consultation queues" value={queue} onChange={setQueue}
        options={CONSULTATION_STATUSES.map(s => ({ id: s, label: STATUS_LABEL[s], count: feed.isLoading ? undefined : counts[s] }))} />
      {feed.error && <AdminError>Could not load consultations: {feed.error.message}</AdminError>}
      {feed.isLoading && <AdminLoading />}
      {!feed.isLoading && rows.length === 0 && <AdminEmpty title="Nothing here" hint="Paid consultations appear in New." />}
      {rows.length > 0 && <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {rows.map(c => (
          <li key={c.id}>
            <button type="button" onClick={() => setOpenId(c.id)} className="flex min-h-14 w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-secondary/50">
              <span>
                <span className="font-semibold">{c.spaceName}</span>
                <span className="block text-muted-foreground">{c.customerName} · {c.walls.length} {c.walls.length === 1 ? 'wall' : 'walls'}{c.assignedName ? ` · ${c.assignedName}` : ''}{c.revisionsUsed > 0 ? ' · revision' : ''}</span>
              </span>
              <SlaBadge c={c} />
            </button>
          </li>
        ))}
      </ul>}
    </div>
  );
}
