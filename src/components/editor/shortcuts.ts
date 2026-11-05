/** The studio's shortcut table (handler + "?" overlay share it). */
import type { Shortcut } from '@/hooks/useKeyboardShortcuts';
import { redo, undo, useStudio } from '@/lib/studio/store';
import {
  addShapeObject, addTextObject, deleteSelection, duplicateSelection, groupSelection, nudgeSelection, selectAll, zoomFit,
} from './actions';
import { useStudioUi } from './uiStore';

const zoom = (factor: number) => window.dispatchEvent(new CustomEvent('vernox-studio:zoom', { detail: factor }));
const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export const STUDIO_SHORTCUTS: Shortcut[] = [
  { keys: 'Ctrl Z', label: 'Undo', match: (e, m) => m && !e.shiftKey && e.key.toLowerCase() === 'z', run: undo },
  { keys: 'Ctrl Shift Z / Ctrl Y', label: 'Redo', match: (e, m) => m && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y'), run: redo },
  { keys: 'Ctrl D', label: 'Duplicate', match: (e, m) => m && e.key.toLowerCase() === 'd', run: duplicateSelection },
  { keys: 'Ctrl A', label: 'Select all', match: (e, m) => m && e.key.toLowerCase() === 'a', run: selectAll },
  { keys: 'Ctrl G', label: 'Group', match: (e, m) => m && !e.shiftKey && e.key.toLowerCase() === 'g', run: () => groupSelection(true) },
  { keys: 'Ctrl Shift G', label: 'Ungroup', match: (e, m) => m && e.shiftKey && e.key.toLowerCase() === 'g', run: () => groupSelection(false) },
  { keys: 'Del', label: 'Delete', match: e => e.key === 'Delete' || e.key === 'Backspace', run: deleteSelection },
  { keys: 'Esc', label: 'Deselect', match: e => e.key === 'Escape', run: () => useStudio.getState().select([]) },
  { keys: '← ↑ → ↓', label: 'Nudge 1 mm (Shift: 10 mm)', match: (e, m) => !m && e.key in arrows, run: e => { const [dx, dy] = arrows[e.key]; const k = e.shiftKey ? 10 : 1; nudgeSelection(dx * k, dy * k); } },
  { keys: 'T', label: 'Add text', match: (e, m) => !m && e.key.toLowerCase() === 't', run: () => addTextObject() },
  { keys: 'S', label: 'Add circle', match: (e, m) => !m && e.key.toLowerCase() === 's', run: () => addShapeObject('circle') },
  { keys: 'U', label: 'Upload & trace', match: (e, m) => !m && e.key.toLowerCase() === 'u', run: () => useStudioUi.getState().openTrace() },
  { keys: 'L', label: 'Layers', match: (e, m) => !m && e.key.toLowerCase() === 'l', run: () => { const ui = useStudioUi.getState(); ui.setMode('pro'); ui.setPanel('layers'); } },
  { keys: '] / [', label: 'Bring to front / send to back', match: (e, m) => !m && (e.key === ']' || e.key === '['), run: e => { const s = useStudio.getState(); s.reorder(s.selection, e.key === ']' ? 'front' : 'back'); } },
  { keys: '+ / −', label: 'Zoom in / out', match: (e, m) => !m && (e.key === '+' || e.key === '=' || e.key === '-'), run: e => zoom(e.key === '-' ? 1 / 1.25 : 1.25) },
  { keys: '0', label: 'Fit to screen', match: (e, m) => !m && e.key === '0', run: zoomFit },
  { keys: 'G', label: 'Toggle grid', match: (e, m) => !m && e.key.toLowerCase() === 'g', run: () => useStudioUi.getState().toggleGrid() },
  { keys: 'Space + drag', label: 'Pan', match: () => false, run: () => {} },
  { keys: '?', label: 'Show shortcuts', match: e => e.key === '?', run: () => useStudioUi.getState().setShortcutsOpen(true) },
];
