/**
 * Drawing UI state (not part of the design, no undo): the active canvas tool, the pen draft,
 * the pencil smoothing and the node-editing session. The document only changes when a path
 * is committed (see drawActions.ts), so each finished path or node edit is one undo step.
 */
import { create } from 'zustand';
import { EMPTY_PEN, type PenDraft } from '@/lib/studio/draw/pen';
import type { NodeRef } from '@/lib/studio/draw/pathModel';

export type DrawTool = 'select' | 'pen' | 'pencil';

export interface NodeEditSession {
  objectId: string;
  /** Selected anchor (handles shown, Delete / arrows / corner-smooth act on it). */
  selected: NodeRef | null;
}

export interface DrawState {
  tool: DrawTool;
  pen: PenDraft;
  /** Pencil smoothing, 0 (follow the hand) … 100 (very smooth). */
  smoothing: number;
  nodeEdit: NodeEditSession | null;
  setTool: (tool: DrawTool) => void;
  setPen: (pen: PenDraft) => void;
  setSmoothing: (smoothing: number) => void;
  setNodeEdit: (session: NodeEditSession | null) => void;
  selectNode: (ref: NodeRef | null) => void;
}

export const useDrawStore = create<DrawState>()(set => ({
  tool: 'select',
  pen: EMPTY_PEN,
  smoothing: 50,
  nodeEdit: null,
  setTool: tool => set({ tool, pen: EMPTY_PEN, nodeEdit: null }),
  setPen: pen => set({ pen }),
  setSmoothing: smoothing => set({ smoothing: Math.max(0, Math.min(100, smoothing)) }),
  setNodeEdit: nodeEdit => set({ nodeEdit, tool: 'select', pen: EMPTY_PEN }),
  selectNode: selected => set(s => (s.nodeEdit ? { nodeEdit: { ...s.nodeEdit, selected } } : {})),
}));

/** True while a drawing tool or node editing owns the canvas pointer and the editing keys. */
export const drawContextActive = () => {
  const s = useDrawStore.getState();
  return s.tool !== 'select' || s.nodeEdit !== null;
};
