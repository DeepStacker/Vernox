/** Small, consistent form controls for the studio panels. */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useStudioUi, type LengthUnit } from '../uiStore';

const UNIT_MM: Record<LengthUnit, number> = { mm: 1, cm: 10, in: 25.4 };

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1 text-xs text-muted-foreground', className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * Numeric input that commits on blur/Enter (one undo step per edit). `length` fields show
 * and accept the current display unit while the value stays in millimetres.
 */
export function NumberField({
  label, value, onChange, min, max, step = 1, length = false, suffix, className,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  length?: boolean;
  suffix?: string;
  className?: string;
}) {
  const unit = useStudioUi(s => s.unit);
  const k = length ? UNIT_MM[unit] : 1;
  const digits = length && unit !== 'mm' ? 2 : step < 1 ? 1 : 0;
  const shown = (value / k).toFixed(digits);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const n = Number(draft.replace(',', '.'));
    if (!Number.isFinite(n)) return setDraft(shown);
    let mm = n * k;
    if (min !== undefined) mm = Math.max(min, mm);
    if (max !== undefined) mm = Math.min(max, mm);
    if (Math.abs(mm - value) > 1e-9) onChange(mm);
    else setDraft(shown);
  };
  return (
    <Field label={label} className={className}>
      <div className="flex h-9 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
        <input
          inputMode="decimal"
          className="h-full w-full min-w-0 bg-transparent px-2 text-sm text-foreground outline-none"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1) * k;
              onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value + delta)));
            }
          }}
          aria-label={label}
        />
        <span className="pr-2 text-xs text-muted-foreground">{suffix ?? (length ? unit : '')}</span>
      </div>
    </Field>
  );
}

export function Segmented<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span id={id}>{label}</span>
      <div role="radiogroup" aria-labelledby={id} className="flex rounded-md border border-input bg-background p-0.5">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-8 flex-1 items-center justify-center rounded px-2 text-xs transition-colors',
              value === o.value ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0">
      {title && <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>}
      {children}
    </section>
  );
}

export function IconButton({ label, onClick, children, active, disabled, className }: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40',
        active && 'bg-primary text-primary-foreground hover:bg-primary/90',
        className,
      )}
    >
      {children}
    </button>
  );
}
