import { Check } from 'lucide-react';
import { FULFILMENT_STAGES, fulfilmentStageIndex } from '@/lib/orders/fulfilmentStages';
import type { OrderStatus } from '@/lib/orders/orderStateMachine';
import { cn } from '@/lib/utils';

/** Status timeline for an order, driven only by its real status. Compact: dots on a rail, the current step named. */
export function OrderProgress({ status }: { status: OrderStatus }) {
  const reached = fulfilmentStageIndex(status);
  const last = FULFILMENT_STAGES.length - 1;
  const stage = FULFILMENT_STAGES[Math.max(reached, 0)];
  return (
    <div>
      <ol className="flex items-center" aria-label="Order progress">
        {FULFILMENT_STAGES.map((s, i) => {
          const done = i < reached || (i === reached && i === last);
          const current = i === reached && !done;
          return (
            <li key={s.title} className={cn('flex items-center', i < last && 'flex-1')} aria-current={current ? 'step' : undefined}>
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                  done && 'border-burgundy bg-burgundy text-cream',
                  current && 'border-burgundy bg-card text-burgundy ring-4 ring-burgundy/15',
                  !done && !current && 'border-border bg-card text-muted-foreground',
                )}
                title={s.title}
              >
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
                <span className="sr-only">{s.title}{done ? ' (done)' : current ? ' (current)' : ''}</span>
              </span>
              {i < last && <span className={cn('mx-1 h-0.5 flex-1 rounded', i < reached ? 'bg-burgundy' : 'bg-border')} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
      {reached >= 0 && <p className="mt-3 text-sm font-semibold">{stage.title}</p>}
    </div>
  );
}
