/**
 * Drawing commands shared by the canvas tools, the toolbar, the inspector and the keyboard:
 * committing pen / pencil paths, node editing and converting text or shapes to paths. Each
 * document change is a single store edit, so it is one undo step.
 */
import { drawnPathObject, editedPathPatch } from '@/lib/studio/draw/objects';
import { penFinish, penUndoPoint } from '@/lib/studio/draw/pen';
import {
  deleteNode, getNode, moveNode, parsePathData, setNodeType, type EditablePath, type SubPath,
} from '@/lib/studio/draw/pathModel';
import { applyMatrix, invertMatrix, placementMatrix } from '@/lib/studio/geometry/path';
import type { PathObject } from '@/lib/studio/schema';
import { selectedObjects, useStudio } from '@/lib/studio/store';
import { useDrawStore, type DrawTool } from './drawStore';
import { useStudioUi } from './uiStore';

export function setDrawTool(tool: DrawTool) {
  useDrawStore.getState().setTool(tool);
  if (tool !== 'select') {
    useStudio.getState().select([]);
    useStudioUi.getState().setPanel(null);
  }
}

/** Adds a finished pen / pencil sub-path (plate mm) as a new path object and selects it. */
export function commitDrawnSubPath(sub: SubPath): PathObject | null {
  const s = useStudio.getState();
  const obj = drawnPathObject(sub, s.doc.plate.style);
  if (obj) s.addObjects([obj]);
  return obj;
}

/** Enter: ends the pen draft as an open line. */
export function finishPen() {
  const d = useDrawStore.getState();
  const sub = penFinish(d.pen);
  d.setPen({ ...d.pen, nodes: [], dragging: false });
  if (sub) commitDrawnSubPath(sub);
}

/** Esc: drops the pen draft; with nothing drawn, leaves the drawing tool. */
export function cancelDrawing() {
  const d = useDrawStore.getState();
  if (d.tool === 'pen' && d.pen.nodes.length > 0) d.setPen({ ...d.pen, nodes: [], dragging: false });
  else d.setTool('select');
}

export function undoPenPoint() {
  const d = useDrawStore.getState();
  d.setPen(penUndoPoint(d.pen));
}

function pathObject(id: string): PathObject | undefined {
  const o = useStudio.getState().doc.objects.find(x => x.id === id);
  return o?.kind === 'path' ? o : undefined;
}

/** Starts editing the points of a path (the given one, else the single selected path). */
export function enterNodeEdit(id?: string): boolean {
  const s = useStudio.getState();
  const target = id ? pathObject(id) : (() => {
    const sel = selectedObjects(s);
    return sel.length === 1 && sel[0].kind === 'path' ? sel[0] : undefined;
  })();
  if (!target || target.locked) return false;
  s.select([target.id]);
  useDrawStore.getState().setNodeEdit({ objectId: target.id, selected: null });
  return true;
}

export function exitNodeEdit() {
  useDrawStore.getState().setNodeEdit(null);
}

export function editingPath(): { obj: PathObject; path: EditablePath } | null {
  const session = useDrawStore.getState().nodeEdit;
  const obj = session && pathObject(session.objectId);
  return obj ? { obj, path: parsePathData(obj.d) } : null;
}

/** Stores an edited local path on the object being edited (removes the object when nothing is left). */
export function commitEditedPath(objectId: string, path: EditablePath) {
  const s = useStudio.getState();
  const obj = pathObject(objectId);
  if (!obj) return;
  const patch = editedPathPatch(obj, path);
  if (!patch) {
    exitNodeEdit();
    s.removeObjects([objectId]);
    return;
  }
  s.updateObjects({ [objectId]: patch });
}

export function deleteSelectedNode() {
  const e = editingPath();
  const ref = useDrawStore.getState().nodeEdit?.selected;
  if (!e || !ref) return;
  useDrawStore.getState().selectNode(null);
  commitEditedPath(e.obj.id, deleteNode(e.path, ref));
}

export function toggleSelectedNodeType() {
  const e = editingPath();
  const ref = useDrawStore.getState().nodeEdit?.selected;
  const node = e && ref ? getNode(e.path, ref) : undefined;
  if (!e || !ref || !node) return;
  commitEditedPath(e.obj.id, setNodeType(e.path, ref, node.type === 'smooth' ? 'corner' : 'smooth'));
}

/** Moves the selected anchor by a plate-space distance (arrow keys), whatever the object's rotation or scale. */
export function nudgeSelectedNode(dx: number, dy: number) {
  const e = editingPath();
  const ref = useDrawStore.getState().nodeEdit?.selected;
  if (!e || !ref) return;
  const inv = invertMatrix(placementMatrix(0, 0, e.obj.rotation, e.obj.scaleX, e.obj.scaleY));
  if (!inv) return;
  const d = applyMatrix(inv, { x: dx, y: dy });
  commitEditedPath(e.obj.id, moveNode(e.path, ref, d.x, d.y));
}

/** Replaces the selected text or shape with an editable path and starts editing its points. */
export async function convertSelectionToPath() {
  const s = useStudio.getState();
  const sel = selectedObjects(s);
  const one = sel.length === 1 ? sel[0] : undefined;
  if (!one || (one.kind !== 'text' && one.kind !== 'shape')) return;
  const { convertToPath } = await import('@/lib/studio/operations');
  const path = convertToPath(one);
  if (!path) return;
  s.replaceObjects([one.id], [path]);
  enterNodeEdit(path.id);
}
