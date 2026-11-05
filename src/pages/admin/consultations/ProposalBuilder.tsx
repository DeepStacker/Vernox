import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AdminNotice, AdminSection } from '@/components/admin/AdminUi';
import { finishName, formatSizeCm } from '@/lib/catalog';
import { ADMIN_CONSULTATIONS_KEY, saveProposalDraft, sendProposal, useProposalDraft } from '@/lib/consultations/consultations';
import { deleteImage, uploadImage } from '@/lib/spaces/photoStorage';
import { usePhotoUrl } from '@/lib/spaces/usePhotoUrl';
import { MAX_PROPOSAL_ITEMS, type ConsultationDoc, type ProposalItem } from '@/types/consultation';
import { PieceDialog } from './PieceDialog';

const previewPath = (consultationId: string, itemId: string) => `consultations/${consultationId}/previews/${itemId}.png`;

function Thumb({ path }: { path: string | null }) {
  const photo = usePhotoUrl(path);
  return photo.url
    ? <img src={photo.url} alt="Piece on the wall" className="aspect-[4/3] w-32 shrink-0 rounded-md border border-border object-cover" />
    : <div className="aspect-[4/3] w-32 shrink-0 rounded-md border border-border bg-secondary" />;
}

/** The designer's draft proposal: pieces placed on the customer's walls, a short note, then send. */
export function ProposalBuilder({ consultation: c, onSent }: { consultation: ConsultationDoc; onSent: () => void }) {
  const qc = useQueryClient();
  const draft = useProposalDraft(c.id);
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Start from the saved draft, else from the proposal already sent (a revision starts from version 1).
  useEffect(() => {
    if (loaded || draft.isLoading) return;
    const source = draft.data ?? c.proposal;
    setItems(source?.items ?? []);
    setNote(source?.note ?? '');
    setLoaded(true);
  }, [draft.isLoading, draft.data, c.proposal, loaded]);

  const persist = async (nextItems: ProposalItem[], nextNote = note) => {
    await saveProposalDraft(c.id, nextItems, nextNote);
    setItems(nextItems);
    await draft.refetch();
  };

  const addItem = async (item: ProposalItem, preview: Blob) => {
    const path = previewPath(c.id, item.id);
    await uploadImage(path, preview);
    await persist([...items, { ...item, previewPath: path }]);
  };

  const removeItem = async (item: ProposalItem) => {
    setBusy(true);
    try {
      await persist(items.filter(i => i.id !== item.id));
      if (item.previewPath) await deleteImage(item.previewPath).catch(() => undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove this piece.');
    } finally {
      setBusy(false);
    }
  };

  const setItemNote = (id: string, value: string) => setItems(list => list.map(i => (i.id === id ? { ...i, note: value } : i)));

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); toast.success(done); return true; }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Something went wrong.'); return false; }
    finally { setBusy(false); }
  };

  const send = async () => {
    const ok = await run(async () => {
      await persist(items, note);
      await sendProposal(c.id);
    }, 'Proposal sent to the customer.');
    if (ok) {
      await qc.invalidateQueries({ queryKey: ADMIN_CONSULTATIONS_KEY });
      onSent();
    }
  };

  return (
    <AdminSection title="Proposal" count={items.length}>
      {c.revisionNote && <AdminNotice tone="info">Customer asked for a revision: {c.revisionNote}</AdminNotice>}
      <ul className="space-y-3">
        {items.map(item => (
          <li key={item.id} className="flex gap-3 rounded-lg border border-border bg-card p-3">
            <Thumb path={item.previewPath} />
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <p className="font-semibold">{item.productName}</p>
              <p className="text-muted-foreground">{c.walls.find(w => w.id === item.wallId)?.name} · {formatSizeCm(item)} · {finishName(item.finish)}</p>
              <input value={item.note} onChange={e => setItemNote(item.id, e.target.value)} placeholder="Note for the customer (optional)" maxLength={500} className="field" aria-label="Note for this piece" />
            </div>
            <button type="button" onClick={() => removeItem(item)} disabled={busy} className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-destructive">Remove</button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setAdding(true)} disabled={busy || items.length >= MAX_PROPOSAL_ITEMS} className="btn-secondary">Add a piece</button>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Note to the customer</span>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000} className="field" />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={() => run(() => persist(items, note), 'Draft saved.')} className="btn-secondary">Save draft</button>
        <button type="button" disabled={busy || items.length === 0} onClick={send} className="btn-primary">Send proposal</button>
      </div>
      <PieceDialog open={adding} consultation={c} onClose={() => setAdding(false)} onAdd={addItem} />
    </AdminSection>
  );
}
