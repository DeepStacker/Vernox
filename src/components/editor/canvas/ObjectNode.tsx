import { memo } from 'react';
import { Circle, Path } from 'react-konva/es/ReactKonvaCore';
import type { KonvaEventObject } from 'konva/lib/Node';
import { objectLocalPath } from '@/lib/studio/compose';
import type { StudioObject } from '@/lib/studio/schema';

/** Last known outline per text object, shown while a new outline is being shaped. */
const lastOutline = new Map<string, string>();

export interface ObjectPaint {
  wall: string;
  stops: (string | number)[];
  score: string;
}

interface Props {
  obj: StudioObject;
  paint: ObjectPaint;
  draggable: boolean;
  onPointerDown: (e: KonvaEventObject<MouseEvent | TouchEvent>, id: string) => void;
  onDragStart: (e: KonvaEventObject<DragEvent>) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: KonvaEventObject<Event>) => void;
}

/** One design object on the canvas. Memoised on the object itself: edits replace only changed objects. */
export const ObjectNode = memo(function ObjectNode({ obj, paint, draggable, onPointerDown, onDragStart, onDragMove, onDragEnd, onTransformEnd }: Props) {
  if (obj.hidden) return null;
  const common = {
    id: obj.id,
    name: 'studio-object',
    x: obj.x,
    y: obj.y,
    rotation: obj.rotation,
    scaleX: obj.scaleX,
    scaleY: obj.scaleY,
    draggable,
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
    onMouseDown: (e: KonvaEventObject<MouseEvent>) => onPointerDown(e, obj.id),
    onTouchStart: (e: KonvaEventObject<TouchEvent>) => onPointerDown(e, obj.id),
    onDragStart,
    onDragMove,
    onDragEnd,
    onTransformEnd,
  };
  if (obj.kind === 'hole') {
    return <Circle {...common} radius={obj.diameterMm / 2} fill={paint.wall} stroke="rgba(0,0,0,0.25)" strokeWidth={0.4} strokeScaleEnabled={false} />;
  }
  let d = objectLocalPath(obj);
  if (obj.kind === 'text') {
    if (d) lastOutline.set(obj.id, d);
    else d = lastOutline.get(obj.id) ?? null;
  }
  if (!d) {
    // Text still shaping for the first time: a soft placeholder of roughly the right size.
    const w = obj.kind === 'text' ? Math.max(10, obj.text.length * obj.sizeMm * 0.6) : 10;
    const h = obj.kind === 'text' ? obj.sizeMm : 10;
    return <Path {...common} data={`M${-w / 2} ${-h / 2}H${w / 2}V${h / 2}H${-w / 2}Z`} fill="rgba(0,0,0,0.06)" />;
  }
  if (obj.op === 'score') {
    return <Path {...common} data={d} stroke={paint.score} strokeWidth={1.2} strokeScaleEnabled={false} hitStrokeWidth={8} />;
  }
  if (obj.op === 'add') {
    return (
      <Path
        {...common}
        data={d}
        fillLinearGradientStartPoint={{ x: -100, y: -100 }}
        fillLinearGradientEndPoint={{ x: 100, y: 100 }}
        fillLinearGradientColorStops={paint.stops}
        fillRule="nonzero"
      />
    );
  }
  return <Path {...common} data={d} fill={paint.wall} fillRule="nonzero" />;
});
