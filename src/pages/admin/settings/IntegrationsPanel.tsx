/**
 * Settings > Integrations (super admin): enter the Razorpay, Resend, MSG91, Shiprocket and WhatsApp keys in the app.
 * The server encrypts them and never sends them back (api/_lib/integrationSecrets.ts); this screen shows only whether
 * each is set and its last four characters, and a Check button tries the keys against the provider.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { adminAction } from '@/lib/data/adminApi';

type Group = 'payments' | 'email' | 'sms' | 'shipping' | 'whatsapp';
interface Field {
  name: string;
  group: Group;
  label: string;
  secret: boolean;
  hint?: string;
  source: 'environment' | 'app' | null;
  preview: string | null;
  updatedAt: number | null;
  unreadable?: boolean;
}

const GROUPS: Array<{ id: Group; title: string; what: string; check?: 'razorpay' | 'resend' | 'shiprocket' | 'whatsapp' }> = [
  { id: 'payments', title: 'Razorpay', what: 'Online payments, refunds, payment links and the EMI message.', check: 'razorpay' },
  { id: 'email', title: 'Email (Resend)', what: 'Order emails, ticket replies, newsletter confirmations and staff alerts.', check: 'resend' },
  { id: 'sms', title: 'SMS (MSG91)', what: 'Order SMS and the cash-on-delivery confirmation code. Needs DLT-approved templates.' },
  { id: 'shipping', title: 'Shiprocket', what: 'Courier rates, booking, labels and tracking. Without it shipping is entered by hand.', check: 'shiprocket' },
  { id: 'whatsapp', title: 'WhatsApp (Meta)', what: 'Order updates on WhatsApp and customer messages as support tickets.', check: 'whatsapp' },
];

const KEY = ['admin', 'integrations'] as const;

function GroupCard({ group, fields }: { group: (typeof GROUPS)[number]; fields: Field[] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [checkResult, setCheckResult] = useState<{ ok: boolean; message: string } | null>(null);
  const save = useMutation({
    mutationFn: (values: Record<string, string | null>) => adminAction<{ fields: Field[] }>('SAVE_INTEGRATIONS', { values }),
    onSuccess: data => {
      qc.setQueryData(KEY, data);
      void qc.invalidateQueries({ queryKey: ['admin', 'launch-status'] });
      setDraft({});
      setCheckResult(null);
    },
  });
  const check = useMutation({
    mutationFn: () => adminAction<{ ok: boolean; message: string }>('CHECK_INTEGRATION', { id: group.check }),
    onSuccess: setCheckResult,
    onError: err => setCheckResult({ ok: false, message: err instanceof Error ? err.message : 'Check failed.' }),
  });
  const changes = Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim()));
  const ready = fields.every(f => f.source && !f.unreadable);

  const submit = async () => {
    try {
      await save.mutateAsync(changes);
      toast.success(`${group.title} saved. It is active within a few seconds.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    }
  };
  const remove = async (f: Field) => {
    if (!window.confirm(`Remove ${f.label}? ${group.title} stops working until it is entered again.`)) return;
    try {
      await save.mutateAsync({ [f.name]: null });
      toast.success(`${f.label} removed.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove.');
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-border p-4" aria-labelledby={`int-${group.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 id={`int-${group.id}`} className="flex items-center gap-2 font-semibold">
            {ready ? <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-label="Set up" /> : <Circle className="h-4 w-4 text-muted-foreground" aria-label="Not set up" />}
            {group.title}
          </h4>
          <p className="text-sm text-muted-foreground">{group.what}</p>
        </div>
        {group.check && (
          <button type="button" className="btn-secondary" disabled={check.isPending} onClick={() => check.mutate()}>
            {check.isPending ? 'Checking…' : 'Check'}
          </button>
        )}
      </div>
      {checkResult && (
        <p role="status" className={`rounded-md p-2 text-sm ${checkResult.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>{checkResult.message}</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map(f => {
          const id = `int-field-${f.name}`;
          const json = f.name.endsWith('_TEMPLATES');
          const status = f.unreadable
            ? 'Stored but unreadable (the server key changed): enter it again'
            : f.source === 'environment' ? `Set on the server${f.preview ? `: ${f.preview}` : ''}`
              : f.source === 'app' ? `Saved${f.preview ? `: ${f.preview}` : ''}` : 'Not set';
          return (
            <div key={f.name} className={json ? 'md:col-span-2' : undefined}>
              <label htmlFor={id} className="block text-sm font-medium">{f.label}</label>
              {json ? (
                <textarea id={id} rows={3} value={draft[f.name] ?? ''} onChange={e => setDraft(d => ({ ...d, [f.name]: e.target.value }))}
                  disabled={f.source === 'environment'} className="field mt-1 font-mono text-xs" placeholder={f.source === 'app' && f.preview ? f.preview : '{}'} />
              ) : (
                <input id={id} type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={draft[f.name] ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [f.name]: e.target.value }))} disabled={f.source === 'environment'}
                  className="field mt-1 font-mono" placeholder={f.source ? 'Type to replace' : ''} />
              )}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className={f.unreadable ? 'text-destructive' : undefined}>{status}</span>
                {f.source === 'app' && (
                  <button type="button" className="min-h-11 underline" onClick={() => void remove(f)} disabled={save.isPending}>Remove</button>
                )}
              </p>
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button type="button" className="btn-primary" disabled={save.isPending || Object.keys(changes).length === 0} onClick={() => void submit()}>
          {save.isPending ? 'Saving…' : `Save ${group.title}`}
        </button>
      </div>
    </section>
  );
}

export function IntegrationsPanel() {
  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: () => adminAction<{ fields: Field[] }>('GET_INTEGRATIONS'), staleTime: 30_000 });
  const fields = data?.fields ?? [];
  return (
    <section id="integrations" className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-soft">
      <div>
        <h3 className="flex items-center gap-2 font-display text-xl"><ShieldCheck className="h-5 w-5 text-brass" aria-hidden="true" /> Integrations</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Paste each provider's keys here and press Save; they work within a few seconds, no redeploy needed. Keys are encrypted on the
          server and never shown again (only the last four characters). A key set in the server environment takes precedence and is locked here.
        </p>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p role="alert" className="text-sm text-destructive">Could not load the integrations: {error.message}</p>}
      {GROUPS.map(g => {
        const groupFields = fields.filter(f => f.group === g.id);
        return groupFields.length ? <GroupCard key={g.id} group={g} fields={groupFields} /> : null;
      })}
    </section>
  );
}
