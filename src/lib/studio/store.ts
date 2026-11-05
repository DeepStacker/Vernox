/**
 * Editor state: the design document (undoable, via zundo snapshots of `doc` only) and the
 * selection. Every document edit goes through `edit*` actions so it lands in history.
 * Repeated edits of the same thing (typing in one field, nudging the same selection, dragging
 * a slider) within HISTORY_COALESCE_MS share one undo step; every other edit is its own step; derived updates (text outlines) are applied with `applyDerived`, outside
 * history, so undo never steps through machine-generated states.
 */
import { create } from 'zustand';
import { temporal } from 'zundo';
import { createDocument, defaultOpFor } from './document';
import { applyTemplateFields } from './templates/registry';
import type { MaterialChoice, Mounting, Plate, StudioDocument, StudioObject } from './schema';

export const HISTORY_LIMIT = 150;
const HISTORY_COALESCE_MS = 450;

/** Fields whose change invalidates a text outline. */
const OUTLINE_FIELDS = ['text', 'fontId', 'sizeMm', 'letterSpacingMm', 'lineHeight', 'align'] as const;

export type ObjectPatch = Partial<Omit<StudioObject, 'id' | 'kind'>> & Record<string, unknown>;

export interface StudioState {
  doc: StudioDocument;
  selection: string[];
  /** Replaces the document and starts a fresh history (new design, restore, template). */
  loadDocument: (doc: StudioDocument) => void;
  /** Replaces the document as one undoable edit (resize, fixes computed by the API). */
  loadDocumentTracked: (doc: StudioDocument) => void;
  select: (ids: string[]) => void;
  addObjects: (objects: StudioObject[], select?: boolean) => void;
  updateObjects: (patches: Record<string, ObjectPatch>) => void;
  removeObjects: (ids: string[]) => void;
  reorder: (ids: string[], to: 'front' | 'back' | 'forward' | 'backward') => void;
  replaceObjects: (removeIds: string[], add: StudioObject[]) => void;
  updatePlate: (patch: Partial<Plate>) => void;
  updateMaterial: (patch: Partial<MaterialChoice>) => void;
  updateMounting: (patch: Partial<Mounting>) => void;
  setAutoBridges: (on: boolean) => void;
  setTemplateFields: (fields: Record<string, string>) => void;
  setName: (name: string) => void;
  /** Derived, non-undoable update (e.g. a freshly shaped text outline). */
  applyDerived: (patches: Record<string, ObjectPatch>) => void;
}

function patchObject(o: StudioObject, patch: ObjectPatch): StudioObject {
  const next = { ...o, ...patch } as StudioObject;
  if (next.kind === 'text' && !('outline' in patch) && OUTLINE_FIELDS.some(k => k in patch && patch[k] !== (o as Record<string, unknown>)[k])) {
    next.outline = undefined;
  }
  return next;
}

/*
 * History coalescing. Each edit may carry a key describing *what* it changes; a run of edits
 * with the same key inside the window records only the snapshot before the run.
 */
let editKey: string | null = null;
let burst: { key: string | null; at: number } = { key: null, at: 0 };

function coalesceSameKey<T extends (...args: never[]) => void>(record: T): T {
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const key = editKey;
    const same = key !== null && key === burst.key && now - burst.at < HISTORY_COALESCE_MS;
    burst = { key, at: now };
    if (!same) record(...args);
  }) as T;
}

const keyFor = (kind: string, ids: string[], fields: object) => `${kind}:${[...ids].sort().join(',')}:${Object.keys(fields).sort().join(',')}`;

export const useStudio = create<StudioState>()(
  temporal(
    set => {
      const editDoc = (fn: (doc: StudioDocument) => StudioDocument, key: string | null = null) => {
        editKey = key;
        set(s => ({ doc: { ...fn(s.doc), updatedAt: Date.now(), production: undefined } }));
        editKey = null;
      };
      return {
        doc: createDocument(),
        selection: [],
        loadDocument: doc => {
          const t = useStudio.temporal.getState();
          t.pause();
          set({ doc, selection: [] });
          t.resume();
          t.clear();
          burst = { key: null, at: 0 };
        },
        loadDocumentTracked: next => editDoc(() => next),
        select: ids => set({ selection: ids }),
        addObjects: (objects, select = true) => {
          editDoc(d => ({ ...d, objects: [...d.objects, ...objects] }));
          if (select) set({ selection: objects.map(o => o.id) });
        },
        updateObjects: patches => editDoc(
          d => ({ ...d, objects: d.objects.map(o => (patches[o.id] ? patchObject(o, patches[o.id]) : o)) }),
          keyFor('objects', Object.keys(patches), Object.assign({}, ...Object.values(patches))),
        ),
        removeObjects: ids => {
          const gone = new Set(ids);
          editDoc(d => ({ ...d, objects: d.objects.filter(o => !gone.has(o.id)) }));
          set(s => ({ selection: s.selection.filter(id => !gone.has(id)) }));
        },
        replaceObjects: (removeIds, add) => {
          const gone = new Set(removeIds);
          editDoc(d => {
            const at = d.objects.findIndex(o => gone.has(o.id));
            const kept = d.objects.filter(o => !gone.has(o.id));
            const idx = at < 0 ? kept.length : Math.min(at, kept.length);
            return { ...d, objects: [...kept.slice(0, idx), ...add, ...kept.slice(idx)] };
          });
          set({ selection: add.map(o => o.id) });
        },
        reorder: (ids, to) => editDoc(d => {
          const set_ = new Set(ids);
          const moving = d.objects.filter(o => set_.has(o.id));
          const rest = d.objects.filter(o => !set_.has(o.id));
          if (to === 'front') return { ...d, objects: [...rest, ...moving] };
          if (to === 'back') return { ...d, objects: [...moving, ...rest] };
          const objects = d.objects.slice();
          const step = to === 'forward' ? 1 : -1;
          const order = step > 0 ? [...objects.keys()].reverse() : [...objects.keys()];
          for (const i of order) {
            const j = i + step;
            if (set_.has(objects[i].id) && j >= 0 && j < objects.length && !set_.has(objects[j].id)) {
              [objects[i], objects[j]] = [objects[j], objects[i]];
            }
          }
          return { ...d, objects };
        }),
        updatePlate: patch => editDoc(d => {
          const plate = { ...d.plate, ...patch };
          if (patch.style && patch.style !== d.plate.style) {
            // Switching plate style flips the natural role of objects (cut-outs vs solid letters).
            const from = defaultOpFor(d.plate.style), to = defaultOpFor(patch.style);
            return {
              ...d,
              plate,
              manufacturing: { ...d.manufacturing, autoBridges: patch.style !== 'solid' || d.manufacturing.autoBridges },
              mounting: patch.style === 'solid' ? d.mounting : { ...d.mounting, preset: patch.style === 'none' ? 'none' : d.mounting.preset },
              objects: d.objects.map(o => (o.kind !== 'hole' && o.op === from ? { ...o, op: to } : o)),
            };
          }
          return { ...d, plate };
        }, keyFor('plate', [], patch)),
        updateMaterial: patch => editDoc(d => ({ ...d, material: { ...d.material, ...patch } }), keyFor('material', [], patch)),
        updateMounting: patch => editDoc(d => ({ ...d, mounting: { ...d.mounting, ...patch } }), keyFor('mounting', [], patch)),
        setAutoBridges: on => editDoc(d => ({ ...d, manufacturing: { ...d.manufacturing, autoBridges: on } })),
        setTemplateFields: fields => editDoc(d => applyTemplateFields(d, fields), keyFor('template', [], fields)),
        setName: name => editDoc(d => ({ ...d, name }), 'name'),
        applyDerived: patches => {
          const t = useStudio.temporal.getState();
          t.pause();
          set(s => ({ doc: { ...s.doc, objects: s.doc.objects.map(o => (patches[o.id] ? ({ ...o, ...patches[o.id] } as StudioObject) : o)) } }));
          t.resume();
        },
      };
    },
    {
      partialize: s => ({ doc: s.doc }),
      equality: (a, b) => a.doc === b.doc,
      limit: HISTORY_LIMIT,
      handleSet: handleSet => coalesceSameKey(handleSet as (...args: never[]) => void) as typeof handleSet,
    },
  ),
);

export const undo = () => useStudio.temporal.getState().undo();
export const redo = () => useStudio.temporal.getState().redo();

export function selectedObjects(s: Pick<StudioState, 'doc' | 'selection'>): StudioObject[] {
  const ids = new Set(s.selection);
  return s.doc.objects.filter(o => ids.has(o.id));
}
