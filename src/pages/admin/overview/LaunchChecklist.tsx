import type { AdminTabId } from '@/lib/auth/permissions';
import { useStoreConfig } from '@/lib/data/settings';
import { launchChecklist } from '../settings/settingsForm';

/** Owner-facing list of business details still on placeholders; hidden once everything is real. */
export function LaunchChecklist({ go }: { go: (tab: AdminTabId) => void }) {
  const config = useStoreConfig().data;
  const items = config ? launchChecklist(config) : [];
  if (items.length === 0) return null;
  // Same look as AdminNotice, which is a <p> and cannot hold a list.
  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">Before launch, replace the placeholders:</p>
      <ul className="mt-1 list-disc pl-5">{items.map(item => <li key={item}>{item}</li>)}</ul>
      <button type="button" onClick={() => go('settings')} className="mt-2 min-h-11 font-semibold underline">Open Settings</button>
    </div>
  );
}
