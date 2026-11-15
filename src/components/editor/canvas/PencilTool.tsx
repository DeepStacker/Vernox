/**
 * Pencil (freehand) layer. The stroke is drawn imperatively on a Konva line while the pointer
 * moves (no React renders), then smoothed into Beziers (lib/studio/draw/freehand) and added
 * as one path object. A second finger (pinch-zoom) abandons the stroke.
 */
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Line as KonvaLine } from 'konva/lib/shapes/Line';
import { Layer, Line, Rect } from 'react-konva/es/ReactKonvaCore';
import { freehandToSubPath, smoothingTolerancePx } from '@/lib/studio/draw/freehand';
import type { Pt } from '@/lib/studio/geometry/path';
import { commitDrawnSubPath } from '../drawActions';
import { useDrawStore } from '../drawStore';
import { CAPTURE_RECT, coarsePointer, DRAW_COLOUR, wantsPan, worldPointer } from './drawInput';

interface Props {
  scale: number;
  spaceDown: MutableRefObject<boolean>;
}

export function PencilTool({ scale, spaceDown }: Props) {
  const lineRef = useRef<KonvaLine>(null);
  const stroke = useRef<Pt[] | null>(null);
  const pointers = useRef(new Set<number>());
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const clear = () => {
    stroke.current = null;
    lineRef.current?.points([]);
    lineRef.current?.getLayer()?.batchDraw();
  };

  useEffect(() => {
    const release = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      const points = stroke.current;
      if (!points) return;
      clear();
      if (e.type === 'pointercancel') return;
      const s = scaleRef.current;
      const sub = freehandToSubPath(points, {
        toleranceMm: smoothingTolerancePx(useDrawStore.getState().smoothing) / s,
        closeDistanceMm: (coarsePointer() ? 24 : 12) / s,
      });
      if (sub) commitDrawnSubPath(sub);
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
    if (pointers.current.size > 1) { clear(); return; }
    const p = worldPointer(e);
    if (!p) return;
    stroke.current = [p];
    lineRef.current?.points([p.x, p.y]);
  };

  const onMove = (e: KonvaEventObject<PointerEvent>) => {
    const points = stroke.current;
    if (!points || pointers.current.size > 1) return;
    e.cancelBubble = true;
    const p = worldPointer(e);
    if (!p) return;
    const last = points[points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.75 / scaleRef.current) return;
    points.push(p);
    const line = lineRef.current;
    if (line) {
      line.points(points.flatMap(q => [q.x, q.y]));
      line.getLayer()?.batchDraw();
    }
  };

  return (
    <Layer>
      <Rect {...CAPTURE_RECT} onPointerDown={onDown} onPointerMove={onMove} />
      <Line ref={lineRef} stroke={DRAW_COLOUR} strokeWidth={2} lineCap="round" lineJoin="round" strokeScaleEnabled={false} listening={false} />
    </Layer>
  );
}
