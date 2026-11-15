// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pieces, normalise } from '../geometry/clipper';
import { pathBounds, pathToRings } from '../geometry/path';
import { parametricShape } from '../elements/parametric';
import { studioShapePath } from '../shapes';

const regionOf = (d: string) => normalise(pathToRings(d, 0.05));

describe('parametric shapes', () => {
  it('polygon has the requested number of corners and fits its diameter', () => {
    for (const sides of [3, 5, 8, 12]) {
      const { d } = parametricShape('polygon', 80, { sides });
      expect(pathToRings(d)[0]).toHaveLength(sides);
      const b = pathBounds(d)!;
      expect(Math.max(b.maxX - b.minX, b.maxY - b.minY)).toBeLessThanOrEqual(80.01);
    }
  });

  it('star alternates outer and inner points by the inner ratio', () => {
    const { d } = parametricShape('star', 100, { points: 7, innerRatio: 0.5 });
    const ring = pathToRings(d)[0];
    expect(ring).toHaveLength(14);
    const radii = ring.map(p => Math.hypot(p.x, p.y));
    expect(radii[0]).toBeCloseTo(50, 1);
    expect(radii[1]).toBeCloseTo(25, 1);
  });

  it('ring is one piece with one hole of the right width', () => {
    const { d } = parametricShape('ring', 100, { bandRatio: 0.2 });
    const ps = pieces(regionOf(d));
    expect(ps).toHaveLength(1);
    expect(ps[0].holes).toHaveLength(1);
    const hole = ps[0].holes[0];
    expect(Math.max(...hole.map(p => Math.hypot(p.x, p.y)))).toBeCloseTo(40, 0);
  });

  it('spiral is an open score line that stays inside its diameter', () => {
    const s = parametricShape('spiral', 120, { turns: 4 });
    expect(s.op).toBe('score');
    expect(s.d).not.toMatch(/Z/i);
    const b = pathBounds(s.d)!;
    expect(b.maxX).toBeLessThanOrEqual(60.1);
    expect(b.minX).toBeGreaterThanOrEqual(-60.1);
  });

  it('clamps out-of-range parameters instead of producing broken geometry', () => {
    expect(pathToRings(parametricShape('polygon', 50, { sides: 1 }).d)[0]).toHaveLength(3);
    expect(pathToRings(parametricShape('star', 50, { points: 99 }).d)[0]).toHaveLength(48);
  });

  it('teardrop fills its box: point at the top centre, round base at the bottom', () => {
    const b = pathBounds(studioShapePath('teardrop', 40, 60))!;
    expect(b.minX).toBeCloseTo(0, 0);
    expect(b.maxX).toBeCloseTo(40, 0);
    expect(b.minY).toBeCloseTo(0, 0);
    expect(b.maxY).toBeCloseTo(60, 0);
    expect(pieces(regionOf(studioShapePath('teardrop', 40, 60)))).toHaveLength(1);
  });
});
