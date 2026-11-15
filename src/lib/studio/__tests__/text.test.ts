// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { area, normalise } from '../geometry/clipper';
import { pathBounds, pathToRings, ringsBounds } from '../geometry/path';
import { shapeKey, shapeText } from '../text/shaper';
import { useDiskFonts } from './testFonts';

beforeAll(() => useDiskFonts());

describe('text to outline', () => {
  it('sizes Latin text by cap height in millimetres', async () => {
    const r = await shapeText({ text: 'H', fontId: 'poppins-semibold', sizeMm: 50, letterSpacingMm: 0, lineHeight: 1.2, align: 'center' });
    const b = pathBounds(r.d)!;
    expect(b.maxY - b.minY).toBeCloseTo(50, 0);
    // Centred on the origin.
    expect((b.minX + b.maxX) / 2).toBeCloseTo(0, 1);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(0, 1);
  });

  it('letter spacing widens the run by spacing × gaps', async () => {
    const base = { text: 'AVATAR', fontId: 'bebas-neue', sizeMm: 40, lineHeight: 1.2, align: 'center' as const };
    const tight = await shapeText({ ...base, letterSpacingMm: 0 });
    const loose = await shapeText({ ...base, letterSpacingMm: 5 });
    expect(loose.widthMm - tight.widthMm).toBeCloseTo(25, 0); // 5 gaps × 5 mm
  });

  it('shapes Devanagari text into outlines', async () => {
    const r = await shapeText({ text: 'शर्मा', fontId: 'yatra-one', sizeMm: 60, letterSpacingMm: 0, lineHeight: 1.2, align: 'center' });
    expect(r.d.length).toBeGreaterThan(100);
    expect(r.heightMm).toBeGreaterThan(50);
    expect(r.widthMm).toBeGreaterThan(60);
  });

  it('stacks multiple lines', async () => {
    const one = await shapeText({ text: 'A', fontId: 'poppins-semibold', sizeMm: 20, letterSpacingMm: 0, lineHeight: 1.2, align: 'center' });
    const two = await shapeText({ text: 'A\nA', fontId: 'poppins-semibold', sizeMm: 20, letterSpacingMm: 0, lineHeight: 1.2, align: 'center' });
    expect(two.heightMm).toBeGreaterThan(one.heightMm * 1.8);
  });
});

describe('text on an arc', () => {
  const base = { text: 'VERNOX', fontId: 'poppins-semibold', sizeMm: 20, letterSpacingMm: 0, lineHeight: 1.2, align: 'center' as const };
  /** Centre height of the leftmost and the middle letter (y grows downwards). */
  const ends = (d: string) => {
    const boxes = pathToRings(d, 0.1).map(r => ringsBounds([r])!).sort((a, b) => a.minX - b.minX);
    const cy = (b: { minY: number; maxY: number }) => (b.minY + b.maxY) / 2;
    const mid = boxes.reduce((best, b) => (Math.abs((b.minX + b.maxX) / 2) < Math.abs((best.minX + best.maxX) / 2) ? b : best));
    return { left: cy(boxes[0]), middle: cy(mid) };
  };
  const filled = (d: string) => Math.abs(area(normalise(pathToRings(d, 0.02))));

  it('bends over the top of a circle for a positive radius and along the bottom for a negative one', async () => {
    const straight = await shapeText(base);
    const top = await shapeText({ ...base, arcRadiusMm: 60 });
    const bottom = await shapeText({ ...base, arcRadiusMm: -60 });
    expect(top.heightMm).toBeGreaterThan(straight.heightMm + 5);
    expect(ends(top.d).left).toBeGreaterThan(ends(top.d).middle + 5); // ends droop
    expect(ends(bottom.d).left).toBeLessThan(ends(bottom.d).middle - 5); // ends rise (a smile)
    expect(shapeKey({ ...base, arcRadiusMm: 60 })).not.toBe(shapeKey(base));
  });

  it('places letters rigidly, so the cut outline keeps every letter exact', async () => {
    const straight = await shapeText(base);
    const arc = await shapeText({ ...base, arcRadiusMm: 80 });
    // Rotation and translation preserve area; a warp would not.
    expect(Math.abs(filled(arc.d) - filled(straight.d)) / filled(straight.d)).toBeLessThan(0.002);
  });

  it('treats 0 as straight and clamps tiny radii to the letter height', async () => {
    const straight = await shapeText(base);
    expect((await shapeText({ ...base, arcRadiusMm: 0 })).d).toBe(straight.d);
    const tiny = await shapeText({ ...base, arcRadiusMm: 1 });
    const clamped = await shapeText({ ...base, arcRadiusMm: 20 });
    expect(tiny.d).toBe(clamped.d);
  });
});
