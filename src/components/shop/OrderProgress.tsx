import { CheckCircle2, Clock } from 'lucide-react';
import { FULFILMENT_STAGES, fulfilmentStageIndex } from '@/lib/orders/fulfilmentStages';
import type { OrderStatus } from '@/lib/orders/orderStateMachine';

/** Progress tiles for an order, driven only by its real status. */
export function OrderProgress({ status }: { status: OrderStatus }) {
  const reached = fulfilmentStageIndex(status);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {FULFILMENT_STAGES.map((stage, index) => {
        const done = index < reached || (index === reached && index === FULFILMENT_STAGES.length - 1);
        const current = index === reached && !done;
        return (
          <div
            key={stage.title}
            className={`p-4 rounded-sm border transition-all ${
              done
                ? 'bg-cream/60 border-burgundy/30 text-dark-brown'
                : current
                  ? 'bg-burgundy/5 border-burgundy text-burgundy ring-1 ring-burgundy/20'
                  : 'bg-cream/20 border-[#E8E1D3] text-dark-brown/40'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold">0{index + 1}</span>
              {done ? (
                <CheckCircle2 className="w-4 h-4 text-burgundy" />
              ) : current ? (
                <Clock className="w-4 h-4 text-gold" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-[#E0D7C6]" />
              )}
            </div>
            <h4 className="text-xs font-semibold leading-snug font-sans">{stage.title}</h4>
            <p className="text-[10px] mt-1 leading-relaxed opacity-80 font-sans">{stage.desc}</p>
          </div>
        );
      })}
    </div>
  );
}
