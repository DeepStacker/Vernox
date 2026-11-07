/**
 * Support tickets from the contact form, or logged by staff for requests that came in by email,
 * WhatsApp or phone: list, filter by status, read the thread, send a reply (emailed to the customer
 * through the notifications outbox, only when the ticket has an email) or add an internal note, and
 * change the status. Answers given on WhatsApp or phone are recorded as notes.
 */
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  TICKET_CHANNEL_LABELS, TICKET_STATUSES, TICKET_STATUS_LABELS, useTicketMutations, useTickets, whatsappWindowOpen, type Ticket, type TicketStatus,
} from '@/lib/data/tickets';
import { NewTicketDialog } from './NewTicketDialog';

const DIRECTION_LABEL = { inbound: 'Customer', reply: 'Reply emailed', note: 'Internal note' } as const;
/** wa.me needs the international number without "+"; Indian 10-digit mobiles get the 91 prefix. */
const whatsappLink = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
};
const when = (ms: number) => (ms ? new Date(ms).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

function TicketThread({ ticket, canWrite }: { ticket: Ticket; canWrite: boolean }) {
  const { setTicketStatus, addTicketMessage, sendTicketWhatsApp } = useTicketMutations();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async (direction: 'reply' | 'note') => {
    if (!text.trim()) return;
    setSaving(true);
    if (await addTicketMessage({ id: ticket.id, direction, text: text.trim() })) setText('');
    setSaving(false);
  };

  const sendWhatsApp = async () => {
    if (!text.trim()) return;
    setSaving(true);
    if (await sendTicketWhatsApp({ id: ticket.id, text: text.trim() })) setText('');
    setSaving(false);
  };
  const isWhatsApp = ticket.channel === 'whatsapp';
  const windowOpen = whatsappWindowOpen(ticket);

  return (
    <article className="space-y-4 rounded-xl border border-border/70 bg-card p-4">
      <header>
        <h3 className="text-lg font-semibold">{ticket.customerName}</h3>
        <p className="flex flex-wrap gap-x-2 text-sm">
          {ticket.customerEmail && <a className="underline" href={`mailto:${ticket.customerEmail}`}>{ticket.customerEmail}</a>}
          {ticket.customerPhone && <>
            <a className="underline" href={`tel:${ticket.customerPhone}`}>{ticket.customerPhone}</a>
            <a className="underline" href={whatsappLink(ticket.customerPhone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </>}
        </p>
        <p className="text-xs text-muted-foreground">
          {ticket.ref} · {TICKET_CHANNEL_LABELS[ticket.channel]} · {ticket.topic}{ticket.orderNumber ? ` · order ${ticket.orderNumber}` : ''}{ticket.assignedTo ? ` · ${ticket.assignedTo}` : ''}
        </p>
      </header>

      <ol className="space-y-2">
        {ticket.messages.map((m, i) => (
          <li key={`${m.at}-${i}`} className={`rounded-lg p-3 text-sm ${m.direction === 'inbound' ? 'bg-muted/40' : m.direction === 'reply' ? 'bg-oxblood/5' : 'border border-dashed border-border'}`}>
            <p className="whitespace-pre-wrap">{m.text}</p>
            <p className="mt-1 text-xs text-muted-foreground">{m.direction === 'reply' && isWhatsApp ? 'Reply sent on WhatsApp' : DIRECTION_LABEL[m.direction]} · {m.direction === 'inbound' ? ticket.customerName : m.by} · {when(m.at)}</p>
          </li>
        ))}
      </ol>

      {canWrite && (
        <div className="space-y-3">
          <label className="block text-sm font-medium">Message
            <textarea rows={3} maxLength={2000} value={text} onChange={e => setText(e.target.value)} className="field mt-1 font-normal" />
          </label>
          <div className="flex flex-wrap gap-2">
            {ticket.customerEmail && (
              <button type="button" disabled={saving || !text.trim()} onClick={() => void add('reply')} className="btn-primary">Send reply</button>
            )}
            {windowOpen && (
              <button type="button" disabled={saving || !text.trim()} onClick={() => void sendWhatsApp()} className="btn-primary">Send on WhatsApp</button>
            )}
            <button type="button" disabled={saving || !text.trim()} onClick={() => void add('note')} className="btn-secondary">Add note</button>
          </div>
          {isWhatsApp && !windowOpen && (
            <p className="text-xs text-muted-foreground">
              The customer's last WhatsApp message is more than 24 hours old, so WhatsApp only allows an approved template now. Use the WhatsApp link above to continue in your own app.
            </p>
          )}
          {!ticket.customerEmail && !windowOpen && (
            <p className="text-xs text-muted-foreground">No email on this ticket. Answer on WhatsApp or phone, then add what you said as a note.</p>
          )}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Set status">
            {TICKET_STATUSES.map(s => (
              <button key={s} type="button" disabled={ticket.status === s} onClick={() => void setTicketStatus({ id: ticket.id, status: s })}
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:bg-oxblood disabled:text-ivory">
                {TICKET_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export function TicketsConsole() {
  const { permissions } = useAuth();
  const { data = [], isLoading, error } = useTickets(Boolean(permissions?.canReadTickets));
  const [filter, setFilter] = useState<TicketStatus | 'all'>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const canWrite = Boolean(permissions?.canWriteTickets);

  const visible = data.filter(t => filter === 'all' || t.status === filter);
  const selected = data.find(t => t.id === selectedId) ?? null;
  const count = (s: TicketStatus) => data.filter(t => t.status === s).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
          {(['all', ...TICKET_STATUSES] as const).map(s => (
            <button key={s} type="button" role="tab" aria-selected={filter === s} onClick={() => setFilter(s)}
              className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${filter === s ? 'bg-oxblood text-ivory' : 'bg-muted/50 text-muted-foreground'}`}>
              {s === 'all' ? `All (${data.length})` : `${TICKET_STATUS_LABELS[s]} (${count(s)})`}
            </button>
          ))}
        </div>
        {canWrite && (
          <button type="button" onClick={() => setLogging(true)} className="btn-primary inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Log ticket
          </button>
        )}
      </div>
      {canWrite && (
        <NewTicketDialog open={logging} onClose={() => setLogging(false)}
          onCreated={id => { setLogging(false); setFilter('open'); setSelectedId(id); }} />
      )}
      {error && <p role="alert" className="text-sm text-destructive">Could not load tickets: {error.message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ul className="space-y-2">
          {!isLoading && visible.length === 0 && <li className="text-sm text-muted-foreground">No tickets in this view.</li>}
          {visible.map(t => (
            <li key={t.id}>
              <button type="button" onClick={() => setSelectedId(t.id)}
                className={`min-h-11 w-full rounded-lg border p-3 text-left text-sm ${t.id === selectedId ? 'border-oxblood bg-oxblood/5' : 'border-border/70 bg-card'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{t.customerName}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{TICKET_STATUS_LABELS[t.status]}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{t.ref} · {TICKET_CHANNEL_LABELS[t.channel]} · {t.topic} · {when(t.updatedAt)}</div>
              </button>
            </li>
          ))}
        </ul>
        {selected
          ? <TicketThread key={selected.id} ticket={selected} canWrite={canWrite} />
          : <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Select a ticket to read the thread.</p>}
      </div>
    </div>
  );
}
