import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle } from 'lucide-react';
import type { AdminTabId } from '@/lib/auth/permissions';
import { adminAction } from '@/lib/data/adminApi';
import { useStoreConfig } from '@/lib/data/settings';
import { launchChecklist } from '../settings/settingsForm';

/** Mirror of api/_lib/launchStatus.ts LaunchItem. */
interface LaunchItem {
  id: string;
  group: 'payments' | 'shipping' | 'messages' | 'platform' | 'catalogue';
  label: string;
  ready: boolean;
  required: boolean;
  help: string;
  detail?: string;
}

const GROUP_LABELS: Record<LaunchItem['group'], string> = {
  payments: 'Payments', shipping: 'Shipping', messages: 'Customer messages', platform: 'Hosting', catalogue: 'Catalogue and team',
};

/** Server keys and catalogue state (presence only), merged with the business details checked from settings. */
function useLaunchStatus() {
  return useQuery({
    queryKey: ['admin', 'launch-status'],
    queryFn: () => adminAction<{ items: LaunchItem[] }>('GET_LAUNCH_STATUS'),
    staleTime: 60_000,
  });
}

/** Owner-facing reminder on the admin home: what is still missing before taking real orders; hidden once done. */
export function LaunchChecklist({ go }: { go: (tab: AdminTabId) => void }) {
  const config = useStoreConfig().data;
  const business = config ? launchChecklist(config) : [];
  const server = useLaunchStatus().data?.items ?? [];
  const missing = [...business, ...server.filter(i => i.required && !i.ready).map(i => i.label)];
  if (missing.length === 0) return null;
  // Same look as AdminNotice, which is a <p> and cannot hold a list.
  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">Before launch, set these up:</p>
      <ul className="mt-1 list-disc pl-5">{missing.map(item => <li key={item}>{item}</li>)}</ul>
      <button type="button" onClick={() => go('settings')} className="mt-2 min-h-11 font-semibold underline">Open Settings &gt; Launch setup</button>
    </div>
  );
}

/** Full list in Settings: every owner-provided key and detail, what it switches on and where to set it. */
export function LaunchSetupPanel() {
  const config = useStoreConfig().data;
  const business = config ? launchChecklist(config) : [];
  const { data, isLoading, error } = useLaunchStatus();
  const items = data?.items ?? [];
  const groups = [...new Set(items.map(i => i.group))];
  const requiredLeft = business.length + items.filter(i => i.required && !i.ready).length;

  return (
    <section id="launch-setup" className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-soft">
      <div>
        <h3 className="font-display text-xl">Launch setup</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {requiredLeft === 0 ? 'Everything required for real orders is set.' : `${requiredLeft} required item${requiredLeft === 1 ? '' : 's'} left before taking real orders.`}{' '}
          Keys are entered in the hosting settings, never here, and this page shows only whether each one is set.
        </p>
      </div>
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business details (below on this page)</h4>
        {business.length === 0
          ? <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" /> Seller, contact and grievance officer details are set.</p>
          : <ul className="space-y-1 text-sm">{business.map(b => <li key={b} className="flex items-start gap-2"><Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" /><span>{b}</span></li>)}</ul>}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Checking keys…</p>}
      {error && <p role="alert" className="text-sm text-destructive">Could not check the keys: {error.message}</p>}
      {groups.map(group => (
        <div key={group} className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{GROUP_LABELS[group]}</h4>
          <ul className="space-y-3">
            {items.filter(i => i.group === group).map(item => (
              <li key={item.id} className="flex items-start gap-2 text-sm">
                {item.ready
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-label="Set" />
                  : <Circle className={`mt-0.5 h-4 w-4 shrink-0 ${item.required ? 'text-amber-700' : 'text-muted-foreground'}`} aria-label="Not set" />}
                <div>
                  <p className="font-medium">
                    {item.label}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{item.ready ? 'set' : item.required ? 'required' : 'optional'}{item.detail ? ` · ${item.detail}` : ''}</span>
                  </p>
                  {!item.ready && <p className="text-muted-foreground">{item.help}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
