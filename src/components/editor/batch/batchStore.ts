/**
 * Batch screen state that is not part of the design: the pasted/uploaded CSV text, which
 * text objects are variables, and which designs were already added to the cart. Kept in
 * memory only, so leaving the screen and coming back keeps the sheet but a reload starts clean.
 */
import { create } from 'zustand';
import type { Bindings } from '@/lib/studio/batch/variables';

interface BatchState {
  csv: string;
  fileName: string;
  bindings: Bindings;
  /** Variant keys already added to the cart. */
  added: ReadonlySet<string>;
  setCsv: (csv: string, fileName?: string) => void;
  setBinding: (objectId: string, template: string) => void;
  markAdded: (keys: Iterable<string>) => void;
  clearSheet: () => void;
}

export const useBatchStore = create<BatchState>()(set => ({
  csv: '',
  fileName: '',
  bindings: {},
  added: new Set(),
  setCsv: (csv, fileName = '') => set({ csv, fileName, added: new Set() }),
  setBinding: (objectId, template) => set(s => ({ bindings: { ...s.bindings, [objectId]: template }, added: new Set() })),
  markAdded: keys => set(s => ({ added: new Set([...s.added, ...keys]) })),
  clearSheet: () => set({ csv: '', fileName: '', added: new Set() }),
}));
