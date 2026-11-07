import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  STAFF_TICKET_CHANNELS, TICKET_CHANNEL_LABELS, TICKET_TOPICS, useCreateTicket, type NewStaffTicket, type StaffTicketChannel,
} from '@/lib/data/tickets';

const EMPTY = { customerName: '', customerEmail: '', customerPhone: '', orderNumber: '', message: '' };

/**
 * Logs a request that came in by email, WhatsApp or phone. An order number links the ticket and fills
 * any blank customer field on the server; otherwise an email or phone is required.
 */
export function NewTicketDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateTicket();
  const [channel, setChannel] = useState<StaffTicketChannel>('whatsapp');
  const [topic, setTopic] = useState<NewStaffTicket['topic']>('Order help');
  const [fields, setFields] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof EMPTY) => (value: string) => setFields(f => ({ ...f, [key]: value }));
  const answerable = Boolean(fields.orderNumber.trim() || fields.customerEmail.trim() || fields.customerPhone.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)) as Partial<typeof EMPTY>;
    try {
      const { id, ref } = await create.mutateAsync({ channel, topic, ...trimmed, message: trimmed.message ?? '' });
      toast.success(`Ticket ${ref} logged`);
      setFields(EMPTY);
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log the ticket.');
    }
  };

  const input = (key: keyof typeof EMPTY, label: string, props: Record<string, unknown> = {}) => (
    <label className="block text-sm font-medium">{label}
      <input value={fields[key]} onChange={e => set(key)(e.target.value)} className="field mt-1 font-normal" {...props} />
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a ticket</DialogTitle>
          <DialogDescription>For a request that came in by email, WhatsApp or phone. With an order number the customer details fill in from the order.</DialogDescription>
        </DialogHeader>
        <form onSubmit={e => void submit(e)} className="space-y-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Channel">
            {STAFF_TICKET_CHANNELS.map(c => (
              <button key={c} type="button" role="radio" aria-checked={channel === c} onClick={() => setChannel(c)}
                className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${channel === c ? 'bg-oxblood text-ivory' : 'bg-muted/50 text-muted-foreground'}`}>
                {TICKET_CHANNEL_LABELS[c]}
              </button>
            ))}
          </div>
          <label className="block text-sm font-medium">Topic
            <select value={topic} onChange={e => setTopic(e.target.value as NewStaffTicket['topic'])} className="field mt-1 font-normal">
              {TICKET_TOPICS.map(t => <option key={t}>{t}</option>)}
            </select>
          </label>
          {input('orderNumber', 'Order number (optional)', { maxLength: 40, placeholder: 'VX-…', autoCapitalize: 'characters' })}
          {input('customerName', 'Customer name', { maxLength: 120 })}
          <div className="grid gap-3 sm:grid-cols-2">
            {input('customerPhone', 'Phone', { type: 'tel', maxLength: 20, inputMode: 'tel' })}
            {input('customerEmail', 'Email', { type: 'email', maxLength: 254 })}
          </div>
          <label className="block text-sm font-medium">What the customer asked
            <textarea required rows={4} maxLength={4000} value={fields.message} onChange={e => set('message')(e.target.value)} className="field mt-1 font-normal" />
          </label>
          {!answerable && <p className="text-xs text-muted-foreground">Add an order number, phone or email so the ticket can be answered.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={create.isPending || !answerable || !fields.message.trim()} className="btn-primary">
              {create.isPending ? 'Saving…' : 'Log ticket'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
