// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { pathBounds } from '../geometry/path';
import { shapeText } from '../text/shaper';
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
