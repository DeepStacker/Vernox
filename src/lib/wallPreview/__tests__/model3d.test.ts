import { describe, expect, it } from 'vitest';
import { buildPieceGroup, exportGlb, groupSizeMetres } from '../model3d';
import { outlineForProduct } from '../outline';

const outline = outlineForProduct({ shapeId: 'rectangle' }, { widthMm: 600, heightMm: 300 });

describe('3D model generation', () => {
  it('builds a model at true scale, 25 mm off the wall', () => {
    const size = groupSizeMetres(buildPieceGroup({ outline, finish: 'brass' }));
    expect(size.x).toBeCloseTo(0.6, 3);
    expect(size.y).toBeCloseTo(0.3, 3);
    // plate (2 mm) sits on 25 mm standoffs
    expect(size.z).toBeCloseTo(0.027, 3);
  });

  it('exports a non-empty binary glTF with the glTF magic header', async () => {
    const glb = await exportGlb({ outline, finish: 'stainless' });
    expect(glb.byteLength).toBeGreaterThan(500);
    const head = new DataView(glb);
    expect(String.fromCharCode(head.getUint8(0), head.getUint8(1), head.getUint8(2), head.getUint8(3))).toBe('glTF');
    expect(head.getUint32(4, true)).toBe(2);
    expect(head.getUint32(8, true)).toBe(glb.byteLength);
  });

  it('extrudes curved outlines too (circle)', async () => {
    const circle = outlineForProduct({ shapeId: 'circle' }, { widthMm: 400, heightMm: 400 });
    const size = groupSizeMetres(buildPieceGroup({ outline: circle, finish: 'copper', round: true }));
    expect(size.x).toBeGreaterThan(0.38);
    expect(size.x).toBeLessThan(0.42);
  });
});
