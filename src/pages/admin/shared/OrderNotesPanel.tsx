import { useState } from 'react';
import { freeText } from '@/lib/orders/orderNotes';
import type { Order } from '@/types/store';
import { useOrderActions } from './useOrderActions';

/** Internal notes: shows the free-text history and, for roles that may write orders, an add-note box. */
export function OrderNotesPanel({ order }: { order: Order }) {
  const { canWrite, addNote } = useOrderActions();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const text = freeText(order.adminNotes);

  const submit = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    const ok = await addNote(order, draft);
    setBusy(false);
    if (ok) setDraft('');
  };

  return (
    <section aria-label="Internal notes" className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Internal notes</h4>
      {text
        ? <pre className="whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-muted/30 p-3 text-xs font-sans">{text}</pre>
        : <p className="text-xs text-muted-foreground">No notes yet.</p>}
      {canWrite ? (
        <div className="flex gap-2">
          <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && void submit()}
            placeholder="Add an internal note" aria-label="New internal note" maxLength={500}
            className="min-h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-oxblood" />
          <button type="button" onClick={() => void submit()} disabled={busy || !draft.trim()}
            className="min-h-11 rounded-lg bg-oxblood px-4 text-sm font-semibold text-ivory disabled:opacity-50">Add</button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Your role can read notes but not add them.</p>
      )}
    </section>
  );
}
