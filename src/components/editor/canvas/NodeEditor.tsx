/**
 * Node editing layer for one path object. The path is edited in the object's local
 * coordinates (pointer positions go through the inverse placement matrix), so it works on
 * rotated, scaled and mirrored objects. Drags preview locally and commit once on release:
 * every drag, insertion, deletion or corner/smooth toggle is one undo step.
 *
 *  - drag an anchor or a handle; tap an anchor to select it, double-tap to toggle corner/smooth
 *  - tap the outline to add an anchor there
 */
import { useEffect, useMemo, useState } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Circle, Layer, Line, Path, Rect } from 'react-konva/es/ReactKonvaCore';
import {
  getNode, insertNode, moveHandle, moveNode, nearestSegment, parsePathData, serializePath, setNodeType, transformPath,
  type EditablePath, type NodeRef,
} from '@/lib/studio/draw/pathModel';
import { applyMatrix, invertMatrix, placementMatrix, type Pt } from '@/lib/studio/geometry/path';
import type { PathObject } from '@/lib/studio/schema';
import { useStudio } from '@/lib/studio/store';
import { commitEditedPath, exitNodeEdit } from '../drawActions';
import { useDrawStore } from '../drawStore';
import { coarsePointer, DRAW_COLOUR } from './drawInput';

/** Shapes of this layer carry this name so the stage does not start a pan or marquee on them. */
export const NODE_EDITOR_NAME = 'node-editor';

const sameRef = (a: NodeRef | null, b: NodeRef) => Boolean(a && a.sub === b.sub && a.index === b.index);

interface HandleRef { ref: NodeRef; which: 'in' | 'out' }

export function NodeEditor({ obj, scale }: { obj: PathObject; scale: number }) {
  const selected = useDrawStore(s => s.nodeEdit?.selected ?? null);
  const selectNode = useDrawStore(s => s.selectNode);
  const stillSelected = useStudio(s => s.selection.length === 1 && s.selection[0] === obj.id);
  const base = useMemo(() => parsePathData(obj.d), [obj.d]);
  const [live, setLive] = useState<EditablePath | null>(null);
  const path = live ?? base;
  const m = useMemo(() => placementMatrix(obj.x, obj.y, obj.rotation, obj.scaleX, obj.scaleY), [obj.x, obj.y, obj.rotation, obj.scaleX, obj.scaleY]);
  const inv = useMemo(() => invertMatrix(m), [m]);
  const world = useMemo(() => transformPath(path, m), [path, m]);
  const worldD = useMemo(() => serializePath(world), [world]);

  // Selecting something else (or undoing the object away) ends the session.
  useEffect(() => { if (!stillSelected) exitNodeEdit(); }, [stillSelected]);

  if (!inv) return null;
  const toLocal = (p: Pt) => applyMatrix(inv, p);
  const coarse = coarsePointer();
  const r = (coarse ? 9 : 5) / scale;

  const anchorDrag = (ref: NodeRef) => (e: KonvaEventObject<DragEvent>) => {
    const n = getNode(base, ref);
    if (!n) return null;
    const p = toLocal(e.target.position());
    return moveNode(base, ref, p.x - n.x, p.y - n.y);
  };
  const handleDrag = (h: HandleRef) => (e: KonvaEventObject<DragEvent>) => moveHandle(base, h.ref, h.which, toLocal(e.target.position()));

  const commit = (next: EditablePath | null) => {
    if (next) commitEditedPath(obj.id, next);
    setLive(null);
  };

  const onOutlineTap = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const p = e.target.getStage()?.getRelativePointerPosition();
    if (!p) return;
    const hit = nearestSegment(base, toLocal(p));
    if (!hit) return;
    const { path: next, ref } = insertNode(base, hit.sub, hit.seg, hit.t);
    commitEditedPath(obj.id, next);
    selectNode(ref);
  };

  const toggle = (ref: NodeRef) => {
    const n = getNode(base, ref);
    if (n) commitEditedPath(obj.id, setNodeType(base, ref, n.type === 'smooth' ? 'corner' : 'smooth'));
  };

  // Handles of the selected anchor and the facing handles of its neighbours.
  const handles: HandleRef[] = [];
  if (selected && getNode(path, selected)) {
    const sub = path[selected.sub];
    const count = sub.nodes.length;
    const prev = selected.index > 0 ? selected.index - 1 : sub.closed ? count - 1 : -1;
    const next = selected.index < count - 1 ? selected.index + 1 : sub.closed ? 0 : -1;
    handles.push({ ref: selected, which: 'in' }, { ref: selected, which: 'out' });
    if (prev >= 0) handles.push({ ref: { sub: selected.sub, index: prev }, which: 'out' });
    if (next >= 0) handles.push({ ref: { sub: selected.sub, index: next }, which: 'in' });
  }

  return (
    <Layer>
      <Path
        name={NODE_EDITOR_NAME}
        data={worldD}
        stroke={DRAW_COLOUR}
        strokeWidth={1.5}
        hitStrokeWidth={coarse ? 24 : 12}
        strokeScaleEnabled={false}
        fillEnabled={false}
        onClick={onOutlineTap}
        onTap={onOutlineTap}
      />
      {handles.map(h => {
        const n = getNode(world, h.ref);
        const at = n?.[h.which];
        if (!n || !at) return null;
        return (
          <Line key={`l-${h.ref.sub}-${h.ref.index}-${h.which}`} points={[n.x, n.y, at.x, at.y]} stroke={DRAW_COLOUR} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
        );
      })}
      {world.map((sub, si) => sub.nodes.map((n, ni) => {
        const ref = { sub: si, index: ni };
        const on = sameRef(selected, ref);
        const common = {
          name: NODE_EDITOR_NAME,
          x: n.x,
          y: n.y,
          fill: on ? DRAW_COLOUR : '#fff',
          stroke: DRAW_COLOUR,
          strokeWidth: 1.2,
          strokeScaleEnabled: false,
          draggable: true,
          onMouseDown: () => selectNode(ref),
          onTouchStart: () => selectNode(ref),
          onDblClick: () => toggle(ref),
          onDblTap: () => toggle(ref),
          onDragMove: (e: KonvaEventObject<DragEvent>) => setLive(anchorDrag(ref)(e)),
          onDragEnd: (e: KonvaEventObject<DragEvent>) => commit(anchorDrag(ref)(e)),
        };
        return n.type === 'smooth'
          ? <Circle key={`a-${si}-${ni}`} {...common} radius={r} />
          : <Rect key={`a-${si}-${ni}`} {...common} width={r * 2} height={r * 2} offsetX={r} offsetY={r} />;
      }))}
      {handles.map(h => {
        const at = getNode(world, h.ref)?.[h.which];
        if (!at) return null;
        return (
          <Circle
            key={`h-${h.ref.sub}-${h.ref.index}-${h.which}`}
            name={NODE_EDITOR_NAME}
            x={at.x}
            y={at.y}
            radius={r * 0.75}
            fill={DRAW_COLOUR}
            draggable
            onDragMove={e => setLive(handleDrag(h)(e))}
            onDragEnd={e => commit(handleDrag(h)(e))}
          />
        );
      })}
    </Layer>
  );
}
