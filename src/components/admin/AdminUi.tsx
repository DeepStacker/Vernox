/**
 * Building blocks shared by every admin screen, so headers, states, stat tiles and tab strips look
 * and behave the same. They use the storefront design tokens (src/index.css): the `btn`, `field`
 * and `skeleton` classes, the `destructive` colour and the 44 px minimum tap size for tablets.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const dangerButton = 'btn bg-destructive text-destructive-foreground hover:opacity-90';

export function AdminPageHeader({ title, line, actions }: { title: string; line?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-3xl">{title}</h2>
        {line && <p className="mt-0.5 text-sm text-muted-foreground">{line}</p>}
      </div>
      {actions}
    </header>
  );
}

export function AdminSection({ title, count, children, aside }: { title: string; count?: number; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{title}{count !== undefined && <span className="ml-2 text-sm font-normal text-muted-foreground">({count})</span>}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function AdminLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-16" />)}
    </div>
  );
}

export function AdminEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
      <p className="font-display text-xl">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AdminError({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{children}</p>;
}

export function AdminNotice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'info' }) {
  return (
    <p role="status" className={cn('rounded-lg border p-3 text-sm', tone === 'warn' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-border bg-muted/40 text-foreground')}>
      {children}
    </p>
  );
}

export function StatTile({ label, value, onClick, warn }: { label: string; value: number | string; onClick?: () => void; warn?: boolean }) {
  const classes = cn('min-h-11 rounded-lg border p-4 text-left shadow-soft', warn ? 'border-destructive/40 bg-destructive/10' : 'border-border bg-card');
  const body = (
    <>
      <div className="font-display text-3xl">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
    </>
  );
  return onClick ? <button type="button" onClick={onClick} className={classes}>{body}</button> : <div className={classes}>{body}</div>;
}

export interface SegmentedOption<T extends string> { id: T; label: string; count?: number }

/** Tab strip for switching between the queues of one console. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly SegmentedOption<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(o => (
        <button key={o.id} type="button" role="tab" aria-selected={o.id === value} onClick={() => onChange(o.id)}
          className={cn('min-h-11 rounded-md border px-4 text-sm font-semibold transition-colors',
            o.id === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>
          {o.label}{o.count !== undefined && <span className="ml-2 opacity-80">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Label above one form control; keeps spacing and type identical across dialogs and forms. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-semibold">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-destructive">{error}</span>}
    </label>
  );
}
