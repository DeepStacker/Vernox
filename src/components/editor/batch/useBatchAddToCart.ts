/**
 * Turns the batch into cart lines: one custom line per distinct design with its quantity,
 * each built by the same `toCartLine` as a single design (so it carries its own
 * `customDesignRef`, which the server stores on the order for production). Lines are added
 * until the checkout limits (lines, design bytes) are reached; the rest stay in the batch.
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useCart } from '@/lib/cartContext';
import { trackStoreEvent } from '@/lib/storeAnalytics';
import { toCartLine } from '@/lib/studio/api';
import { materialiseVariant } from '@/lib/studio/batch/evaluate';
import { fitsCart, splitQuantity, type Variant } from '@/lib/studio/batch/plan';
import { t } from '@/lib/studio/i18n';
import { useStudio } from '@/lib/studio/store';
import type { StudioRuntimeContext } from '../useStudioRuntime';
import { useBatchStore } from './batchStore';

const nextFrame = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export function useBatchAddToCart(ctx: StudioRuntimeContext) {
  const { items, add, setDrawerOpen } = useCart();
  const [adding, setAdding] = useState(false);

  const run = useCallback(async (variants: readonly Variant[]) => {
    setAdding(true);
    try {
      const doc = useStudio.getState().doc;
      const room = { lines: items.length, designChars: items.reduce((n, i) => n + (i.customDesignRef?.length ?? 0), 0) };
      const done: string[] = [];
      let skipped = 0;
      let full = false;
      for (const variant of variants) {
        if (full) break;
        let line;
        try {
          line = toCartLine(await materialiseVariant(doc, variant.texts), 1, ctx);
        } catch {
          skipped++; // too detailed to store, or no longer orderable: leave it in the batch
          await nextFrame();
          continue;
        }
        for (const quantity of splitQuantity(variant.quantity)) {
          if (!fitsCart(room, line.customDesignRef.length)) { full = true; break; }
          add({ ...line, quantity });
          room.lines += 1;
          room.designChars += line.customDesignRef.length;
        }
        if (!full) done.push(variant.key);
        await nextFrame();
      }
      useBatchStore.getState().markAdded(done);
      if (done.length) {
        trackStoreEvent('cart');
        setDrawerOpen(true);
      }
      const left = variants.length - done.length;
      if (done.length === 0) toast.error(t('batch.nothingFits'));
      else if (left > 0) toast.warning(t('batch.partial', { added: done.length, left }));
      else toast.success(t('batch.addedAll', { count: done.length }));
      return { added: done.length, left, skipped };
    } finally {
      setAdding(false);
    }
  }, [add, ctx, items, setDrawerOpen]);

  return { addBatch: run, adding };
}
