import type { ReactNode } from 'react';
import { finishLabels, formatSizeCm, type ProductSize } from '@/lib/catalog';
import { cn } from '@/lib/utils';

export function Chip({ active, onClick, children, label, className }: { active?: boolean; onClick: () => void; children: ReactNode; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'min-h-10 shrink-0 rounded-full border px-3.5 text-sm transition-colors duration-200 motion-reduce:transition-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burgundy',
        active ? 'border-burgundy bg-burgundy text-cream' : 'border-border bg-card text-foreground hover:border-burgundy/50',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {children}
    </div>
  );
}

export function SizeChips({ sizes, index, onChange, verdicts }: { sizes: ProductSize[]; index: number; onChange: (i: number) => void; verdicts?: string[] }) {
  return (
    <Row label="Size">
      {sizes.map((s, i) => (
        <Chip key={s.label + i} active={i === index} onClick={() => onChange(i)} label={`${formatSizeCm(s)}${verdicts?.[i] === 'good' ? ', recommended' : ''}`}>
          {formatSizeCm(s)}
          {verdicts?.[i] === 'good' && <span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gold align-middle" />}
        </Chip>
      ))}
    </Row>
  );
}

export function FinishChips({ finishes, value, onChange }: { finishes: string[]; value: string; onChange: (f: string) => void }) {
  return (
    <Row label="Finish">
      {finishes.map(f => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          aria-pressed={f === value}
          aria-label={finishLabels[f]?.name ?? f}
          title={finishLabels[f]?.name ?? f}
          className={cn(
            'h-10 w-10 shrink-0 rounded-full border-2 transition-transform duration-200 motion-reduce:transition-none',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burgundy',
            f === value ? 'scale-110 border-burgundy' : 'border-border',
          )}
          style={{ background: finishLabels[f]?.swatch ?? '#999' }}
        />
      ))}
    </Row>
  );
}
