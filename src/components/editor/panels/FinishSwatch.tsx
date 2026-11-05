import { finishPreset } from '@/lib/studio/materials';
import { cn } from '@/lib/utils';

export function FinishSwatch({ finish, active, onClick }: { finish: string; active: boolean; onClick: () => void }) {
  const p = finishPreset(finish);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={p.label}
      className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground"
    >
      <span
        className={cn('h-10 w-10 rounded-full border-2 shadow-sm transition-transform', active ? 'scale-105 border-primary' : 'border-transparent')}
        style={{ background: `linear-gradient(135deg, ${p.swatch.join(', ')})` }}
      />
      <span className={cn('leading-tight', active && 'text-foreground')}>{p.label}</span>
    </button>
  );
}
