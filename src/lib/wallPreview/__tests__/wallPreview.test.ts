import { describe, expect, it } from 'vitest';
import { applyHomography, invertMatrix3, localScale, solveHomography, wallToImage } from '../homography';
import { perspectiveHomography, pxPerCmFromTwoPoints, pxPerCmFromWallWidth, scaleOnlyHomography } from '../calibration';
import { centreYForHeightCm, heightFromFloorCm, recommendSizes } from '../recommend';
import { materialForFinish } from '../materials';
import { estimateLightFromPixels, lightFromEstimate } from '../lighting';
import { mountingLayout } from '../outline';
import { SCENES } from '../scenes';
import type { Quad } from '../types';

const rect: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];

describe('homography', () => {
  it('maps the four source corners exactly onto the destination corners', () => {
    const dst: Quad = [{ x: 10, y: 20 }, { x: 210, y: 5 }, { x: 240, y: 160 }, { x: -5, y: 140 }];
    const h = solveHomography(rect, dst)!;
    rect.forEach((p, i) => {
      const q = applyHomography(h, p);
      expect(q.x).toBeCloseTo(dst[i].x, 6);
      expect(q.y).toBeCloseTo(dst[i].y, 6);
    });
  });

  it('is the identity-like scale for an axis-aligned rectangle', () => {
    const dst: Quad = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 150 }, { x: 0, y: 150 }];
    const h = solveHomography(rect, dst)!;
    expect(applyHomography(h, { x: 50, y: 25 })).toEqual({ x: expect.closeTo(150, 6), y: expect.closeTo(75, 6) });
    expect(localScale(h, { x: 50, y: 25 })).toBeCloseTo(3, 6);
  });

  it('inverts so that points round-trip', () => {
    const dst: Quad = [{ x: 30, y: 10 }, { x: 180, y: 30 }, { x: 170, y: 120 }, { x: 20, y: 140 }];
    const h = solveHomography(rect, dst)!;
    const inv = invertMatrix3(h)!;
    const p = { x: 37, y: 12 };
    const back = applyHomography(inv, applyHomography(h, p));
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });

  it('returns null for degenerate (collinear) corners', () => {
    const line: Quad = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(solveHomography(rect, line)).toBeNull();
  });

  it('shows perspective: the nearer (larger) edge has a bigger local scale', () => {
    const dst: Quad = [{ x: 20, y: 40 }, { x: 180, y: 0 }, { x: 180, y: 200 }, { x: 20, y: 160 }];
    const h = wallToImage(dst, 100, 50)!;
    expect(localScale(h, { x: 95, y: 25 })).toBeGreaterThan(localScale(h, { x: 5, y: 25 }));
  });

  it('every shipped scene has a valid wall plane inside its image', () => {
    for (const s of SCENES) {
      expect(wallToImage(s.wall.corners, s.wall.widthCm, s.wall.heightCm)).not.toBeNull();
      for (const c of s.wall.corners) {
        expect(c.x).toBeLessThanOrEqual(s.imageWidth);
        expect(c.y).toBeLessThanOrEqual(s.imageHeight);
      }
    }
  });
});

describe('scale calibration', () => {
  it('derives px/cm from two points on an A4 sheet', () => {
    expect(pxPerCmFromTwoPoints({ x: 100, y: 100 }, { x: 100, y: 100 + 297 }, 29.7)).toBeCloseTo(10, 6);
  });
  it('works on a diagonal mark', () => {
    expect(pxPerCmFromTwoPoints({ x: 0, y: 0 }, { x: 300, y: 400 }, 50)).toBeCloseTo(10, 6);
  });
  it('rejects zero-length marks and invalid lengths', () => {
    expect(pxPerCmFromTwoPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 30)).toBeNull();
    expect(pxPerCmFromTwoPoints({ x: 0, y: 0 }, { x: 50, y: 0 }, 0)).toBeNull();
    expect(pxPerCmFromTwoPoints({ x: 0, y: 0 }, { x: 50, y: 0 }, NaN)).toBeNull();
  });
  it('derives px/cm from wall width', () => {
    expect(pxPerCmFromWallWidth(1200, 300)).toBe(4);
    expect(pxPerCmFromWallWidth(1200, -1)).toBeNull();
  });
  it('builds a scale homography and a perspective homography from a known rectangle', () => {
    expect(applyHomography(scaleOnlyHomography(4), { x: 10, y: 5 })).toEqual({ x: 40, y: 20 });
    const h = perspectiveHomography([{ x: 10, y: 10 }, { x: 410, y: 10 }, { x: 410, y: 210 }, { x: 10, y: 210 }], 200, 100)!;
    expect(localScale(h, { x: 100, y: 50 })).toBeCloseTo(2, 6);
    expect(perspectiveHomography(rect, 0, 100)).toBeNull();
  });
});

describe('size recommendation', () => {
  const sizes = [
    { widthMm: 300, heightMm: 150 },
    { widthMm: 600, heightMm: 300 },
    { widthMm: 900, heightMm: 450 },
    { widthMm: 1200, heightMm: 600 },
  ];
  it('picks about 58% of a 300 cm wall (the 90 cm piece is the closest)', () => {
    const r = recommendSizes(sizes, 300, 250);
    expect(r.idealWidthCm).toBe(174);
    expect(sizes[r.bestIndex].widthMm).toBe(1200);
    expect(r.verdicts).toEqual(['small', 'small', 'small', 'small']);
  });
  it('uses 2/3 of the furniture width when furniture is given', () => {
    const r = recommendSizes(sizes, 300, 250, 210);
    expect(r.idealWidthCm).toBe(139);
    expect(sizes[r.bestIndex].widthMm).toBe(1200);
    expect(r.verdicts[3]).toBe('good');
    expect(r.verdicts[0]).toBe('small');
  });
  it('flags pieces wider than the wall and never recommends them', () => {
    const r = recommendSizes(sizes, 100, 200);
    expect(r.verdicts[3]).toBe('toobig');
    expect(r.verdicts[2]).toBe('large');
    expect(sizes[r.bestIndex].widthMm).toBeLessThanOrEqual(900);
  });
  it('returns -1 when nothing fits', () => {
    expect(recommendSizes(sizes, 20, 20).bestIndex).toBe(-1);
  });
  it('converts between wall y and height from floor', () => {
    expect(heightFromFloorCm(95, 240)).toBe(145);
    expect(centreYForHeightCm(145, 240)).toBe(95);
  });
});

describe('finish materials', () => {
  it('gives polished metals a lower roughness than brushed ones', () => {
    expect(materialForFinish('stainless').roughness).toBeLessThan(materialForFinish('brushed_hairline').roughness);
    expect(materialForFinish('brushed_hairline').brushed).toBe(true);
    expect(materialForFinish('brass').brushed).toBe(false);
  });
  it('maps legacy ids and falls back to brass for unknown ids', () => {
    expect(materialForFinish('steel').id).toBe('black_patina');
    expect(materialForFinish('corten').id).toBe('corten_rust');
    expect(materialForFinish('unobtainium').id).toBe('brass');
  });
  it('keeps PBR values in range', () => {
    for (const f of ['black_patina', 'brass', 'antique_brass', 'gold', 'copper', 'corten_rust', 'stainless', 'brushed_hairline']) {
      const m = materialForFinish(f);
      expect(m.metalness).toBeGreaterThanOrEqual(0);
      expect(m.metalness).toBeLessThanOrEqual(1);
      expect(m.roughness).toBeGreaterThan(0);
      expect(m.roughness).toBeLessThanOrEqual(1);
    }
  });
});

describe('light estimate and mounting', () => {
  it('detects a warm, left-lit image', () => {
    const w = 8, h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = x < w / 2 ? 230 : 120;
        data[i] = v; data[i + 1] = v * 0.85; data[i + 2] = v * 0.6; data[i + 3] = 255;
      }
    }
    const e = estimateLightFromPixels(data, w, h);
    expect(e.warmth).toBeGreaterThan(0.2);
    expect(e.sideBias).toBeLessThan(0);
    expect(lightFromEstimate(e).fromX).toBeLessThan(0);
  });
  it('lays out four holes (six for wide pieces) inside the bounding box', () => {
    expect(mountingLayout(300, 150).holes).toHaveLength(4);
    const wide = mountingLayout(1200, 600);
    expect(wide.holes).toHaveLength(6);
    for (const hole of wide.holes) {
      expect(hole.x).toBeGreaterThan(0);
      expect(hole.x).toBeLessThan(1200);
      expect(hole.y).toBeGreaterThan(0);
      expect(hole.y).toBeLessThan(600);
    }
    expect(mountingLayout(600, 600, true).holes).toHaveLength(4);
  });
});
