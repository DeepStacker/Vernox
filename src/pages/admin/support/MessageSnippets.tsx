import { Copy, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { messageSnippets, whatsappLink } from '@/lib/orders/orderSearch';
import type { Order } from '@/types/store';

/** Copy-ready customer messages with a WhatsApp click-to-chat link built from the order phone. */
export function MessageSnippets({ order, storeName }: { order: Order; storeName: string }) {
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Message copied');
    } catch {
      toast.error('Could not copy. Select the text and copy it manually.');
    }
  };

  return (
    <section aria-label="Customer messages" className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer messages</h4>
      {messageSnippets(order, storeName).map(s => {
        const link = whatsappLink(order.phone, s.text);
        return (
          <div key={s.id} className="rounded-lg border border-border/70 p-3 space-y-2">
            <div className="text-sm font-semibold">{s.label}</div>
            <pre className="whitespace-pre-wrap break-words text-xs font-sans text-muted-foreground">{s.text}</pre>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copy(s.text)} className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold">
                <Copy className="h-4 w-4" /> Copy
              </button>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="min-h-11 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              ) : (
                <span className="inline-flex min-h-11 items-center text-xs text-muted-foreground">No valid phone number on this order</span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
