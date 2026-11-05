import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useCart } from '@/lib/cartContext';
import { trackStoreEvent } from '@/lib/storeAnalytics';
import { toCartLine } from '@/lib/studio/api';
import { t } from '@/lib/studio/i18n';
import { useStudio } from '@/lib/studio/store';
import type { StudioRuntimeContext } from './useStudioRuntime';

/** Adds the current design to the cart (price is display-only; the server re-prices). */
export function useAddToCart(ctx: StudioRuntimeContext) {
  const { add, setDrawerOpen } = useCart();
  const [adding, setAdding] = useState(false);
  const run = useCallback(async (quantity = 1) => {
    setAdding(true);
    try {
      // Yield a frame so the button shows its busy state before composing.
      await new Promise(r => requestAnimationFrame(() => r(null)));
      const line = toCartLine(useStudio.getState().doc, quantity, ctx);
      add(line);
      trackStoreEvent('cart');
      toast.success(t('bar.added'));
      setDrawerOpen(true);
      return true;
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      toast.error(code === 'DESIGN_TOO_DETAILED' ? t('error.tooDetailed') : t('bar.fixFirst'));
      return false;
    } finally {
      setAdding(false);
    }
  }, [add, ctx, setDrawerOpen]);
  return { addToCart: run, adding };
}
