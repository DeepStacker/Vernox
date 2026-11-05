/**
 * Studio UI state that is not part of the design (no undo): step, mode, open panels, the
 * latest geometry analysis from the worker, and canvas view commands.
 */
import { create } from 'zustand';
import type { GeometryResult } from '@/workers/geometryWorker';
import { readSavedMode, saveMode, type StudioMode } from '@/lib/studio/modes';

export type StudioStep = 'start' | 'design' | 'review';
export type LengthUnit = 'mm' | 'cm' | 'in';
export type Panel = 'templates' | 'text' | 'shape' | 'plate' | 'layers' | 'inspect' | null;

export interface StudioUi {
  step: StudioStep;
  mode: StudioMode;
  panel: Panel;
  traceOpen: boolean;
  traceFile: File | null;
  shortcutsOpen: boolean;
  geometry: GeometryResult | null;
  geometryError: string | null;
  /** Number of text outlines currently being shaped. */
  shaping: number;
  showGrid: boolean;
  unit: LengthUnit;
  setUnit: (unit: LengthUnit) => void;
  snap: boolean;
  /** Incremented to ask the canvas to fit the plate in view. */
  fitRequest: number;
  setStep: (step: StudioStep) => void;
  setMode: (mode: StudioMode) => void;
  setPanel: (panel: Panel) => void;
  openTrace: (file?: File | null) => void;
  closeTrace: () => void;
  setShortcutsOpen: (open: boolean) => void;
  setGeometry: (g: GeometryResult) => void;
  setGeometryError: (message: string | null) => void;
  shapingDelta: (delta: number) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  requestFit: () => void;
}

export const useStudioUi = create<StudioUi>()(set => ({
  step: 'start',
  mode: readSavedMode(),
  panel: null,
  traceOpen: false,
  traceFile: null,
  shortcutsOpen: false,
  geometry: null,
  geometryError: null,
  shaping: 0,
  showGrid: false,
  unit: 'mm',
  setUnit: unit => set({ unit }),
  snap: true,
  fitRequest: 0,
  setStep: step => set({ step }),
  setMode: mode => {
    saveMode(mode);
    set({ mode });
  },
  setPanel: panel => set({ panel }),
  openTrace: (file = null) => set({ traceOpen: true, traceFile: file }),
  closeTrace: () => set({ traceOpen: false, traceFile: null }),
  setShortcutsOpen: shortcutsOpen => set({ shortcutsOpen }),
  setGeometry: geometry => set({ geometry, geometryError: null }),
  setGeometryError: geometryError => set({ geometryError }),
  shapingDelta: delta => set(s => ({ shaping: Math.max(0, s.shaping + delta) })),
  toggleGrid: () => set(s => ({ showGrid: !s.showGrid })),
  toggleSnap: () => set(s => ({ snap: !s.snap })),
  requestFit: () => set(s => ({ fitRequest: s.fitRequest + 1 })),
}));
