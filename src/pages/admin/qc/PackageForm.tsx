import { useState } from 'react';
import { toast } from 'sonner';
import { isValidPackage, parseNotes, recordPackage } from '@/lib/orders/orderNotes';
import type { Order } from '@/types/store';
import { useOrderActions } from '../shared/useOrderActions';

const FIELDS = [
  { key: 'lengthCm', label: 'Length (cm)' },
  { key: 'widthCm', label: 'Width (cm)' },
  { key: 'heightCm', label: 'Height (cm)' },
  { key: 'weightKg', label: 'Weight (kg)' },
] as const;

type Draft = Record<(typeof FIELDS)[number]['key'], string>;

/** Package dimensions and weight, saved in the order notes block for the shipping step. */
export function PackageForm({ order, disabled }: { order: Order; disabled: boolean }) {
  const { who, saveNotes } = useOrderActions();
  const saved = parseNotes(order.adminNotes).data.package;
  const [draft, setDraft] = useState<Draft>({
    lengthCm: saved ? String(saved.lengthCm) : '', widthCm: saved ? String(saved.widthCm) : '',
    heightCm: saved ? String(saved.heightCm) : '', weightKg: saved ? String(saved.weightKg) : '',
  });
  const numbers = {
    lengthCm: Number(draft.lengthCm), widthCm: Number(draft.widthCm), heightCm: Number(draft.heightCm), weightKg: Number(draft.weightKg),
  };

  const save = async () => {
    try {
      const notes = recordPackage(order.adminNotes, numbers, who, Date.now());
      if (await saveNotes(order, notes)) toast.success('Package details saved for shipping');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save package details');
    }
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Package for shipping</h4>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FIELDS.map(f => (
          <label key={f.key} className="text-xs text-muted-foreground">
            {f.label}
            <input type="number" inputMode="decimal" min="0" step="0.1" value={draft[f.key]} disabled={disabled}
              onChange={e => setDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-oxblood" />
          </label>
        ))}
      </div>
      <button type="button" disabled={disabled || !isValidPackage(numbers)} onClick={() => void save()}
        className="min-h-11 rounded-lg border border-border bg-background px-4 text-sm font-semibold disabled:opacity-40">
        {saved ? 'Update package details' : 'Save package details'}
      </button>
    </div>
  );
}
