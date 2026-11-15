/**
 * Repeat and symmetry: linear, grid and radial arrays, and N-fold / mirror symmetry around a
 * point. Pure functions over objects. Each returns the (possibly moved) originals and the new
 * copies as real objects with fresh ids; copies keep their op (cut / add / score), text
 * outlines and groups. The UI applies a result as one undoable edit (replaceObjects).
 *
 * Copies of a selection that is not grouped are grouped together with it so the whole array
 * moves as one; groups inside the selection are kept per copy.
 */
import { newId } from './document';
import { selectionBounds } from './operations';
import { applyMatrix, placementMatrix, type Bounds, type Pt } from './geometry/path';
import type { StudioObject } from './schema';

/** Largest number of copies one action may create (the document holds at most 2000 objects). */
export const MAX_REPEAT_COPIES = 400;
export const MAX_DOCUMENT_OBJECTS = 2000;

export class RepeatLimitError extends Error {}

export interface RepeatResult {
  /** The selection, with the array group applied (and moved, for radial repeat with a radius). */
  originals: StudioObject[];
  copies: StudioObject[];
}

export interface LinearRepeat { count: number; gapMm: number; angleDeg: number }
export interface GridRepeat { rows: number; columns: number; gapXMm: number; gapYMm: number }
export interface RadialRepeat {
  count: number;
  centre: Pt;
  /** Distance of the selection's centre from `centre`; undefined keeps where it is. */
  radiusMm?: number;
  /** Turn each copy so it faces outward like the original (true) or keep its orientation. */
  rotateCopies: boolean;
  /** Angle covered by the copies: 360 closes the circle, less leaves an arc. */
  sweepDeg: number;
  startAngleDeg?: number;
}
export interface Symmetry { folds: number; mirror: boolean; centre: Pt }

const centreOf = (b: Bounds): Pt => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });

/** Guards the copy count; `existing` is the number of objects already in the document. */
export function assertCopyBudget(copyCount: number, existing = 0) {
  if (copyCount > MAX_REPEAT_COPIES) throw new RepeatLimitError(`At most ${MAX_REPEAT_COPIES} copies at a time (this makes ${copyCount}).`);
  if (existing + copyCount > MAX_DOCUMENT_OBJECTS) throw new RepeatLimitError(`A design holds up to ${MAX_DOCUMENT_OBJECTS} objects.`);
}

const wholeCount = (n: number) => Math.max(1, Math.floor(Number.isFinite(n) ? n : 1));

type Transform = (o: StudioObject) => StudioObject;

const translate = (dx: number, dy: number): Transform => o => ({ ...o, x: o.x + dx, y: o.y + dy });

/** Rotates an object rigidly about a pivot (position orbits, orientation turns). */
export const rotateAbout = (pivot: Pt, deg: number): Transform => {
  const m = placementMatrix(pivot.x, pivot.y, deg, 1, 1);
  return o => {
    const p = applyMatrix(m, { x: o.x - pivot.x, y: o.y - pivot.y });
    return { ...o, x: p.x, y: p.y, rotation: o.rotation + deg };
  };
};

/** Orbits an object about a pivot without turning it. */
const orbit = (pivot: Pt, deg: number): Transform => {
  const rotate = rotateAbout(pivot, deg);
  return o => ({ ...rotate(o), rotation: o.rotation });
};

/** Mirror across the vertical line x = cx (scale and rotation flip with it, as `mirrorCopy`). */
const mirrorAcross = (cx: number): Transform => o => ({ ...o, x: 2 * cx - o.x, scaleX: -o.scaleX, rotation: -o.rotation });

/**
 * Builds copies by applying one transform per copy. Fresh ids; groups remapped per copy, or,
 * when nothing was grouped, all copies and originals share one new group.
 */
function build(originals: StudioObject[], transforms: Transform[]): RepeatResult {
  const grouped = originals.some(o => o.groupId);
  const arrayGroup = grouped ? undefined : `g_${newId('r')}`;
  const copies = transforms.flatMap(apply => {
    const remap = new Map<string, string>();
    return originals.map(o => {
      const copy = { ...apply(o), id: newId(o.id.split('_')[0] || 'o') };
      if (o.groupId) {
        if (!remap.has(o.groupId)) remap.set(o.groupId, `g_${newId('r')}`);
        copy.groupId = remap.get(o.groupId);
      } else if (arrayGroup) copy.groupId = arrayGroup;
      return copy;
    });
  });
  return { originals: arrayGroup ? originals.map(o => ({ ...o, groupId: arrayGroup })) : originals, copies };
}

/** Copies in a row. `gapMm` is the clear space between neighbours' bounding boxes along the direction. */
export function linearRepeat(objects: StudioObject[], opts: LinearRepeat): RepeatResult {
  const count = wholeCount(opts.count);
  const b = selectionBounds(objects);
  assertCopyBudget(count - 1);
  if (!b || count < 2) return { originals: objects, copies: [] };
  const a = (opts.angleDeg * Math.PI) / 180;
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  const along = (b.maxX - b.minX) * Math.abs(dir.x) + (b.maxY - b.minY) * Math.abs(dir.y);
  const step = along + opts.gapMm;
  return build(objects, Array.from({ length: count - 1 }, (_, i) => translate(dir.x * step * (i + 1), dir.y * step * (i + 1))));
}

/** Rows × columns of copies; the gaps are clear space between bounding boxes. */
export function gridRepeat(objects: StudioObject[], opts: GridRepeat): RepeatResult {
  const rows = wholeCount(opts.rows), columns = wholeCount(opts.columns);
  assertCopyBudget(rows * columns - 1);
  const b = selectionBounds(objects);
  if (!b || rows * columns < 2) return { originals: objects, copies: [] };
  const stepX = b.maxX - b.minX + opts.gapXMm, stepY = b.maxY - b.minY + opts.gapYMm;
  const transforms: Transform[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) if (r || c) transforms.push(translate(c * stepX, r * stepY));
  return build(objects, transforms);
}

/** Copies around a centre. The original stays at its place unless `radiusMm` moves it onto the circle. */
export function radialRepeat(objects: StudioObject[], opts: RadialRepeat): RepeatResult {
  const count = wholeCount(opts.count);
  assertCopyBudget(count - 1);
  const b = selectionBounds(objects);
  if (!b || count < 2) return { originals: objects, copies: [] };
  let originals = objects;
  const own = centreOf(b);
  if (opts.radiusMm !== undefined && opts.radiusMm >= 0) {
    const dx = own.x - opts.centre.x, dy = own.y - opts.centre.y;
    const len = Math.hypot(dx, dy);
    const dir = len > 1e-6 ? { x: dx / len, y: dy / len } : { x: 0, y: -1 };
    originals = objects.map(translate(opts.centre.x + dir.x * opts.radiusMm - own.x, opts.centre.y + dir.y * opts.radiusMm - own.y));
  }
  // A full circle divides by count; an arc puts the last copy at the end of the sweep.
  const full = Math.abs(opts.sweepDeg) >= 360 - 1e-9;
  const step = opts.sweepDeg / (full ? count : count - 1);
  const make = opts.rotateCopies ? rotateAbout : orbit;
  return build(originals, Array.from({ length: count - 1 }, (_, i) => make(opts.centre, step * (i + 1) + (opts.startAngleDeg ?? 0))));
}

/** N-fold rotational symmetry, plus the mirror image of every rotation when `mirror` is on. */
export function symmetryCopies(objects: StudioObject[], opts: Symmetry): RepeatResult {
  const folds = wholeCount(opts.folds);
  assertCopyBudget(folds * (opts.mirror ? 2 : 1) - 1);
  if (selectionBounds(objects) === null || (folds < 2 && !opts.mirror)) return { originals: objects, copies: [] };
  const transforms: Transform[] = [];
  for (let k = 0; k < folds; k++) {
    const turn = rotateAbout(opts.centre, (360 / folds) * k);
    for (const flip of opts.mirror ? [false, true] : [false]) {
      if (k === 0 && !flip) continue;
      const mirror = mirrorAcross(opts.centre.x);
      transforms.push(o => turn(flip ? mirror(o) : o));
    }
  }
  return build(objects, transforms);
}
