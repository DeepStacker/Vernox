/**
 * Editing operations that produce new geometry or placements: booleans, offset outline,
 * align/distribute, mirror, fit-to-plate, convert to path. Pure functions over documents/objects.
 */
import { difference, intersection, normalise, offset, union, xor } from './geometry/clipper';
import { applyMatrix, centrePathData, pathBounds, pathToRings, placementMatrix, ringsBounds, ringsToPathData, type Bounds } from './geometry/path';
import { CUT_TOLERANCE, objectLocalPath, objectRings, WELD_MM } from './compose';
import { createPath } from './document';
import type { PathObject, Plate, ShapeObject, StudioObject, TextObject } from './schema';

export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude';

function toPathObject(rings: ReturnType<typeof union>, template: StudioObject, source: PathObject['source']): PathObject | null {
  if (rings.length === 0) return null;
  const c = centrePathData(ringsToPathData(rings, true, 3));
  return createPath({ d: c.d, x: c.cx, y: c.cy, op: template.op, name: template.name, source }, template.op);
}

/** Combines objects (first is the base for subtract) into one path object. */
export function booleanObjects(objects: StudioObject[], op: BooleanOp): PathObject | null {
  if (objects.length < 2) return null;
  const regions = objects.map(o => normalise(objectRings(o)));
  let result = regions[0];
  for (const r of regions.slice(1)) {
    result = op === 'union' ? union(result, r) : op === 'subtract' ? difference(result, r) : op === 'intersect' ? intersection(result, r) : xor(result, r);
  }
  return toPathObject(result, objects[0], 'boolean');
}

/** Outline ring around an object at `distanceMm` (positive grows); `ring` keeps only the band. */
export function offsetOutline(obj: StudioObject, distanceMm: number, ringWidthMm?: number): PathObject | null {
  const base = normalise(objectRings(obj));
  const grown = offset(base, distanceMm, 'round');
  const result = ringWidthMm ? difference(grown, offset(grown, -ringWidthMm, 'round')) : grown;
  return toPathObject(result, obj, 'offset');
}

export function objectBounds(obj: StudioObject): Bounds | null {
  if (obj.kind === 'hole') {
    const r = obj.diameterMm / 2;
    return { minX: obj.x - r, minY: obj.y - r, maxX: obj.x + r, maxY: obj.y + r };
  }
  const local = objectLocalPath(obj);
  if (!local) return null;
  return pathBounds(local, placementMatrix(obj.x, obj.y, obj.rotation, obj.scaleX, obj.scaleY));
}

/** Bounding box of a set of objects in plate mm. */
export function selectionBounds(objects: StudioObject[]): Bounds | null {
  return ringsBounds(objects.flatMap(o => { const b = objectBounds(o); return b ? [[{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY }]] : []; }));
}

/** Moves the selection as a whole so its box is centred on the plate (`axis`: across, down or both). */
export function centreOnPlate(objects: StudioObject[], plate: Plate, axis: 'both' | 'x' | 'y' = 'both'): Record<string, Partial<StudioObject>> {
  const b = selectionBounds(objects);
  if (!b) return {};
  const dx = axis === 'y' ? 0 : plate.widthMm / 2 - (b.minX + b.maxX) / 2;
  const dy = axis === 'x' ? 0 : plate.heightMm / 2 - (b.minY + b.maxY) / 2;
  return Object.fromEntries(objects.map(o => [o.id, { x: o.x + dx, y: o.y + dy }]));
}

/** Flips the selection in place about the centre of its box: `x` swaps left and right, `y` top and bottom. */
export function flipObjects(objects: StudioObject[], axis: 'x' | 'y'): Record<string, Partial<StudioObject>> {
  const b = selectionBounds(objects);
  if (!b) return {};
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  return Object.fromEntries(objects.map(o => [o.id, axis === 'x'
    ? { x: 2 * cx - o.x, scaleX: -o.scaleX, rotation: -o.rotation }
    : { y: 2 * cy - o.y, scaleY: -o.scaleY, rotation: -o.rotation }]));
}

export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** Moves objects so the chosen edge lines up with the selection (or the plate when alone). */
export function alignObjects(objects: StudioObject[], edge: AlignEdge, plate: Plate): Record<string, Partial<StudioObject>> {
  const boxes = objects.map(o => ({ o, b: objectBounds(o) })).filter((e): e is { o: StudioObject; b: Bounds } => Boolean(e.b));
  if (boxes.length === 0) return {};
  const target: Bounds = boxes.length === 1
    ? { minX: 0, minY: 0, maxX: plate.widthMm, maxY: plate.heightMm }
    : (ringsBounds(boxes.map(e => [{ x: e.b.minX, y: e.b.minY }, { x: e.b.maxX, y: e.b.maxY }])) as Bounds);
  const out: Record<string, Partial<StudioObject>> = {};
  for (const { o, b } of boxes) {
    let dx = 0, dy = 0;
    if (edge === 'left') dx = target.minX - b.minX;
    if (edge === 'right') dx = target.maxX - b.maxX;
    if (edge === 'hcenter') dx = (target.minX + target.maxX) / 2 - (b.minX + b.maxX) / 2;
    if (edge === 'top') dy = target.minY - b.minY;
    if (edge === 'bottom') dy = target.maxY - b.maxY;
    if (edge === 'vcenter') dy = (target.minY + target.maxY) / 2 - (b.minY + b.maxY) / 2;
    out[o.id] = { x: o.x + dx, y: o.y + dy };
  }
  return out;
}

/** Equal gaps between 3+ objects along an axis. */
export function distributeObjects(objects: StudioObject[], axis: 'x' | 'y'): Record<string, Partial<StudioObject>> {
  const boxes = objects.map(o => ({ o, b: objectBounds(o) })).filter((e): e is { o: StudioObject; b: Bounds } => Boolean(e.b));
  if (boxes.length < 3) return {};
  const lo = (b: Bounds) => (axis === 'x' ? b.minX : b.minY);
  const hi = (b: Bounds) => (axis === 'x' ? b.maxX : b.maxY);
  boxes.sort((a, b) => lo(a.b) - lo(b.b));
  const span = hi(boxes[boxes.length - 1].b) - lo(boxes[0].b);
  const total = boxes.reduce((s, e) => s + hi(e.b) - lo(e.b), 0);
  const gap = (span - total) / (boxes.length - 1);
  const out: Record<string, Partial<StudioObject>> = {};
  let cursor = lo(boxes[0].b);
  for (const { o, b } of boxes) {
    const delta = cursor - lo(b);
    out[o.id] = axis === 'x' ? { x: o.x + delta } : { y: o.y + delta };
    cursor += hi(b) - lo(b) + gap;
  }
  return out;
}

/** New letter height so the text fits inside the plate with a margin (keeps proportions). */
export function fitTextSize(obj: TextObject, plate: Plate, marginMm = 20): number | null {
  if (!obj.outline) return null;
  const b = pathBounds(obj.outline);
  if (!b) return null;
  const w = (b.maxX - b.minX) * Math.abs(obj.scaleX);
  const h = (b.maxY - b.minY) * Math.abs(obj.scaleY);
  const factor = Math.min((plate.widthMm - 2 * marginMm) / w, (plate.heightMm - 2 * marginMm) / h);
  return factor > 0 && Number.isFinite(factor) ? Math.round(obj.sizeMm * factor * 10) / 10 : null;
}

/** Mirror copy across the plate's vertical (x) or horizontal (y) centre line. */
export function mirrorCopy<T extends StudioObject>(obj: T, axis: 'x' | 'y', plate: Plate): Partial<T> {
  return axis === 'x'
    ? ({ x: plate.widthMm - obj.x, scaleX: -obj.scaleX, rotation: -obj.rotation } as Partial<T>)
    : ({ y: plate.heightMm - obj.y, scaleY: -obj.scaleY, rotation: -obj.rotation } as Partial<T>);
}

/**
 * Turns text or a shape into an editable path with the same outline and placement (one-way:
 * the text can no longer be retyped). Welded text keeps its welded outline, which is
 * flattened to line segments because the weld is an offset of the letters.
 */
export function convertToPath(obj: TextObject | ShapeObject): PathObject | null {
  let local = objectLocalPath(obj);
  if (!local) return null;
  if (obj.kind === 'text' && obj.weld) {
    local = ringsToPathData(offset(normalise(pathToRings(local, CUT_TOLERANCE)), WELD_MM / 2, 'round'), true, 3);
  }
  const c = centrePathData(local);
  const at = applyMatrix(placementMatrix(obj.x, obj.y, obj.rotation, obj.scaleX, obj.scaleY), { x: c.cx, y: c.cy });
  const name = obj.name ?? (obj.kind === 'text' ? obj.text.replace(/\s+/g, ' ').trim().slice(0, 60) : undefined);
  return createPath({
    d: c.d, x: at.x, y: at.y, rotation: obj.rotation, scaleX: obj.scaleX, scaleY: obj.scaleY,
    op: obj.op, name: name || undefined, locked: obj.locked, hidden: obj.hidden, groupId: obj.groupId, source: 'draw',
  });
}
