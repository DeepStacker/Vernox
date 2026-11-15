// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPath, createShape } from '../document';
import type { StudioObject } from '../schema';
import { centreOnPlate, flipObjects, selectionBounds } from '../operations';
import { gridRepeat, linearRepeat, MAX_REPEAT_COPIES, radialRepeat, RepeatLimitError, symmetryCopies } from '../repeat';

const square = (x: number, y: number, op: 'cut' | 'add' | 'score' = 'cut') => createShape({ shapeId: 'square', widthMm: 20, heightMm: 10, x, y, op });
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('linear repeat', () => {
  it('steps by the object extent plus the gap along the direction', () => {
    const { copies, originals } = linearRepeat([square(50, 50)], { count: 4, gapMm: 5, angleDeg: 0 });
    expect(copies.map(c => c.x)).toEqual([75, 100, 125]);
    expect(copies.every(c => c.y === 50)).toBe(true);
    expect(originals).toHaveLength(1);
    const down = linearRepeat([square(50, 50)], { count: 3, gapMm: 2, angleDeg: 90 });
    near(down.copies[0].y, 50 + 12);
    near(down.copies[0].x, 50);
  });

  it('keeps the op, gives fresh ids, and groups the array with its original', () => {
    const base = square(10, 10, 'score');
    const { copies, originals } = linearRepeat([base], { count: 3, gapMm: 4, angleDeg: 0 });
    expect(copies.every(c => c.op === 'score')).toBe(true);
    expect(new Set([base.id, ...copies.map(c => c.id)]).size).toBe(3);
    const group = originals[0].groupId;
    expect(group).toBeTruthy();
    expect(copies.every(c => c.groupId === group)).toBe(true);
  });

  it('count 1 changes nothing', () => {
    expect(linearRepeat([square(0, 0)], { count: 1, gapMm: 5, angleDeg: 0 }).copies).toEqual([]);
  });
});

describe('grid repeat', () => {
  it('makes rows x columns - 1 copies on the expected pitch', () => {
    const { copies } = gridRepeat([square(0, 0)], { rows: 3, columns: 4, gapXMm: 5, gapYMm: 2 });
    expect(copies).toHaveLength(11);
    const xs = new Set(copies.map(c => c.x)), ys = new Set(copies.map(c => c.y));
    expect([...xs].sort((a, b) => a - b)).toEqual([0, 25, 50, 75]);
    expect([...ys].sort((a, b) => a - b)).toEqual([0, 12, 24]);
  });

  it('remaps existing groups per copy', () => {
    const a = { ...square(0, 0), groupId: 'g1' }, b = { ...square(30, 0), groupId: 'g1' };
    const { copies, originals } = gridRepeat([a, b], { rows: 1, columns: 3, gapXMm: 5, gapYMm: 0 });
    expect(originals.map(o => o.groupId)).toEqual(['g1', 'g1']);
    expect(new Set(copies.map(c => c.groupId)).size).toBe(2);
    expect(copies[0].groupId).toBe(copies[1].groupId);
    expect(copies[0].groupId).not.toBe(copies[2].groupId);
  });
});

describe('radial repeat', () => {
  const centre = { x: 100, y: 100 };
  it('places copies evenly on the circle through the original', () => {
    const { copies } = radialRepeat([square(100, 40)], { count: 4, centre, rotateCopies: false, sweepDeg: 360 });
    const at = copies.map(c => [Math.round(c.x), Math.round(c.y)]);
    expect(at).toEqual([[160, 100], [100, 160], [40, 100]]);
    expect(copies.every(c => c.rotation === 0)).toBe(true);
  });

  it('rotates copies when asked and keeps scale and op', () => {
    const base = { ...square(100, 40, 'add'), scaleX: -1 };
    const { copies } = radialRepeat([base], { count: 4, centre, rotateCopies: true, sweepDeg: 360 });
    expect(copies.map(c => c.rotation)).toEqual([90, 180, 270]);
    expect(copies.every(c => c.op === 'add' && c.scaleX === -1)).toBe(true);
  });

  it('moves the original onto the requested radius', () => {
    const { originals, copies } = radialRepeat([square(100, 90)], { count: 3, centre, radiusMm: 70, rotateCopies: true, sweepDeg: 360 });
    near(Math.hypot(originals[0].x - 100, originals[0].y - 100), 70);
    near(Math.hypot(copies[0].x - 100, copies[0].y - 100), 70);
    near(originals[0].y, 30);
  });

  it('an arc sweep ends on the last copy', () => {
    const { copies } = radialRepeat([square(100, 40)], { count: 3, centre, rotateCopies: false, sweepDeg: 180 });
    expect(copies.map(c => [Math.round(c.x), Math.round(c.y)])).toEqual([[160, 100], [100, 160]]);
  });
});

describe('symmetry', () => {
  const centre = { x: 100, y: 100 };
  it('N-fold copies rotate about the centre', () => {
    const { copies } = symmetryCopies([square(130, 100)], { folds: 6, mirror: false, centre });
    expect(copies).toHaveLength(5);
    for (const c of copies) near(Math.hypot(c.x - 100, c.y - 100), 30);
    expect(copies.map(c => c.rotation)).toEqual([60, 120, 180, 240, 300]);
  });

  it('mirror adds a reflected copy per rotation, flipping scale and angle', () => {
    const base = { ...square(130, 90), rotation: 20 };
    const { copies } = symmetryCopies([base], { folds: 3, mirror: true, centre });
    expect(copies).toHaveLength(5);
    const reflected = copies.find(c => c.scaleX === -1 && c.rotation === -20)!;
    near(reflected.x, 70);
    near(reflected.y, 90);
  });

  it('mirror alone (1 fold) makes a single mirror image', () => {
    const { copies } = symmetryCopies([square(130, 90)], { folds: 1, mirror: true, centre });
    expect(copies).toHaveLength(1);
    near(copies[0].x, 70);
  });

  it('the union of the copies is symmetric under the rotation', () => {
    const base = createPath({ d: 'M-5 -5L10 -3L3 8Z', x: 140, y: 80 });
    const { originals, copies } = symmetryCopies([base], { folds: 4, mirror: false, centre });
    const b = selectionBounds([...originals, ...copies])!;
    near((b.minX + b.maxX) / 2, 100);
    near((b.minY + b.maxY) / 2, 100);
  });
});

describe('limits', () => {
  it('refuses more copies than one action may make', () => {
    expect(() => gridRepeat([square(0, 0)], { rows: 30, columns: 30, gapXMm: 1, gapYMm: 1 })).toThrow(RepeatLimitError);
    expect(() => linearRepeat([square(0, 0)], { count: MAX_REPEAT_COPIES + 2, gapMm: 1, angleDeg: 0 })).toThrow(RepeatLimitError);
  });
});

describe('centre and flip', () => {
  const plate = { style: 'solid' as const, shapeId: 'rectangle', widthMm: 300, heightMm: 200, cornerRadiusMm: 0, borderMm: 15 };
  it('centres a selection as a whole, keeping its internal layout', () => {
    const a = square(20, 20), b = square(60, 20);
    const patches = centreOnPlate([a, b], plate);
    expect(patches[b.id].x! - patches[a.id].x!).toBe(40);
    const moved = [{ ...a, ...patches[a.id] } as StudioObject, { ...b, ...patches[b.id] } as StudioObject];
    const box = selectionBounds(moved)!;
    near((box.minX + box.maxX) / 2, 150);
    near((box.minY + box.maxY) / 2, 100);
    expect(centreOnPlate([a], plate, 'x')[a.id].y).toBe(a.y);
  });

  it('flips about the selection centre, mirroring scale and angle', () => {
    const a = square(20, 20), b = square(60, 20);
    const p = flipObjects([a, b], 'x');
    near(p[a.id].x as number, 60);
    near(p[b.id].x as number, 20);
    expect(p[a.id].scaleX).toBe(-1);
    const turned = { ...square(20, 20), rotation: 30 };
    expect(flipObjects([turned], 'y')[turned.id]).toMatchObject({ scaleY: -1, rotation: -30 });
  });
});
