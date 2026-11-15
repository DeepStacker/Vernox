/**
 * Pen tool layer: forwards pointer events to the pure pen state machine (lib/studio/draw/pen)
 * and renders the draft. Works with mouse, pen and touch; a second finger (pinch-zoom)
 * withdraws the point the first finger just placed.
 */
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Circle, Layer, Line, Path, Rect } from 'react-konva/es/ReactKonvaCore';
import { penDown, penMove, penUndoPoint, penUp } from '@/lib/studio/draw/pen';
import { serializePath } from '@/lib/studio/draw/pathModel';
import { commitDrawnSubPath } from '../drawActions';
import { useDrawStore } from '../drawStore';
import { CAPTURE_RECT, coarsePointer, DRAW_COLOUR, wantsPan, worldPointer } from './drawInput';

interface Props {
  /** Current zoom (screen px per mm). */
  scale: number;
  spaceDown: MutableRefObject<boolean>;
}

export function PenTool({ scale, spaceDown }: Props) {
  const pen = useDrawStore(s => s.pen);
  const pointers = useRef(new Set<number>());
  const placedThisGesture = useRef(false);
  const coarse = coarsePointer();
  const hitMm = (coarse ? 22 : 9) / scale;

  useEffect(() => {
    const release = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      const d = useDrawStore.getState();
      if (d.pen.dragging) d.setPen(penUp(d.pen));
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);

  const onDown = (e: KonvaEventObject<PointerEvent>) => {
    if (wantsPan(e, spaceDown)) return;
    e.cancelBubble = true;
    pointers.current.add(e.evt.pointerId);
    const d = useDrawStore.getState();
    if (pointers.current.size > 1) {
      if (placedThisGesture.current) d.setPen(penUndoPoint(d.pen));
      placedThisGesture.current = false;
      return;
    }
    const p = worldPointer(e);
    if (!p) return;
    const step = penDown(d.pen, p, hitMm);
    placedThisGesture.current = step.draft.nodes.length > d.pen.nodes.length;
    d.setPen(step.draft);
    if (step.result) commitDrawnSubPath(step.result);
  };

  const onMove = (e: KonvaEventObject<PointerEvent>) => {
    if (pointers.current.size > 1) return;
    const p = worldPointer(e);
    if (!p) return;
    const d = useDrawStore.getState();
    d.setPen(penMove(d.pen, p, 3 / scale));
  };

  const nodes = pen.nodes;
  const last = nodes[nodes.length - 1];
  const draftD = useMemo(() => (nodes.length > 1 ? serializePath([{ nodes, closed: false }]) : ''), [nodes]);
  const hover = pen.hover;
  const nearFirst = Boolean(hover && nodes.length >= 2 && Math.hypot(hover.x - nodes[0].x, hover.y - nodes[0].y) <= hitMm);
  const rubber = last && hover && !pen.dragging
    ? `M${last.x} ${last.y}C${(last.out ?? last).x} ${(last.out ?? last).y} ${hover.x} ${hover.y} ${hover.x} ${hover.y}`
    : '';
  const a = (coarse ? 8 : 5) / scale;

  return (
    <Layer>
      <Rect {...CAPTURE_RECT} onPointerDown={onDown} onPointerMove={onMove} />
      {draftD && <Path data={draftD} stroke={DRAW_COLOUR} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />}
      {rubber && <Path data={rubber} stroke={DRAW_COLOUR} strokeWidth={1} dash={[4, 4]} strokeScaleEnabled={false} listening={false} />}
      {last?.in && last.out && (
        <>
          <Line points={[last.in.x, last.in.y, last.x, last.y, last.out.x, last.out.y]} stroke={DRAW_COLOUR} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
          <Circle x={last.in.x} y={last.in.y} radius={a * 0.7} fill={DRAW_COLOUR} listening={false} />
          <Circle x={last.out.x} y={last.out.y} radius={a * 0.7} fill={DRAW_COLOUR} listening={false} />
        </>
      )}
      {nodes.map((n, i) => (
        <Rect
          key={i}
          x={n.x - (i === 0 && nearFirst ? a * 1.6 : a)}
          y={n.y - (i === 0 && nearFirst ? a * 1.6 : a)}
          width={(i === 0 && nearFirst ? a * 1.6 : a) * 2}
          height={(i === 0 && nearFirst ? a * 1.6 : a) * 2}
          fill={i === nodes.length - 1 ? DRAW_COLOUR : '#fff'}
          stroke={DRAW_COLOUR}
          strokeWidth={1.2}
          strokeScaleEnabled={false}
          listening={false}
        />
      ))}
    </Layer>
  );
}
