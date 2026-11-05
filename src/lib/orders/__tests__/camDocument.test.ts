import { describe, expect, it } from 'vitest';
import { createDocument, createShape } from '@/lib/studio/document';
import { serializeForOrder } from '@/lib/studio/api';
import { pathToRings, ringsBounds } from '@/lib/studio/geometry/path';
import type { OrderItem } from '@/types/store';
import { buildCamDocument } from '../camDocument';

const baseItem: OrderItem = {
  id: 'i1', productId: 'prod-1', productName: 'Test piece', productSlug: 'test', shapeId: 'rectangle',
  sizeLabel: '400mm', widthMm: 400, heightMm: 300, finish: 'brass', unitPrice: 100, quantity: 1, lineTotal: 100,
};
const custom = (design: unknown): OrderItem => ({ ...baseItem, productId: 'custom-bespoke', customDesignRef: JSON.stringify(design) });

const boundsOf = (d: string) => ringsBounds(pathToRings(d))!;

describe('buildCamDocument', () => {
  it('exports the frozen production geometry of a v4 studio design exactly', () => {
    const doc = createDocument({
      plate: { style: 'solid', shapeId: 'rectangle', widthMm: 250, heightMm: 180, cornerRadiusMm: 0 },
      mounting: { preset: 'none' },
      objects: [createShape({ shapeId: 'circle', widthMm: 40, heightMm: 40, x: 125, y: 90 })],
    });
    const stored = JSON.parse(serializeForOrder(doc));
    const cam = buildCamDocument('ORD-1', custom(stored));
    expect(cam.source).toBe('customer-design');
    expect(cam.designFormat).toBe('studio-v4');
    expect(cam.production).toEqual(stored.production);
    expect(cam.documentId).toBe('cam-ORD-1-i1');
  });

  it('composes v4 designs that carry no production snapshot', () => {
    const doc = createDocument({ plate: { style: 'solid', shapeId: 'rectangle', widthMm: 200, heightMm: 100 }, mounting: { preset: 'none' } });
    const cam = buildCamDocument('ORD-1', custom(doc));
    expect(cam.production.contours.map(c => c.role)).toEqual(['outer']);
    expect(cam.production.widthMm).toBeCloseTo(200, 3);
  });

  it('migrates legacy VDM 3.0.0 designs with the old exporter semantics', () => {
    const legacy = {
      version: '3.0.0', unit: 'mm',
      material: { substrate: 'brass_cz108', thicknessMm: 3, finish: 'brass' },
      boundary: { widthMm: 250, heightMm: 180, cornerRadiusMm: 0, shapeTemplateId: 'rectangle', pathData: 'M0,0 L250,0 L250,180 L0,180 Z' },
      layers: [
        { id: 'h1', type: 'mounting_hole', visible: true, diameterMm: 6, edgeOffsetMm: 15, transform: { xMm: 15, yMm: 15, scaleX: 1, scaleY: 1, rotationDeg: 0 } },
        { id: 'p1', type: 'vector_path', visible: true, isClosed: true, pathData: 'M0,0 L40,0 L40,20 L0,20 Z', transform: { xMm: 100, yMm: 80, scaleX: 1, scaleY: 1, rotationDeg: 0 } },
        { id: 'p2', type: 'vector_path', visible: false, isClosed: true, pathData: 'M0,0 L10,0 L10,10 Z', transform: { xMm: 5, yMm: 5, scaleX: 1, scaleY: 1, rotationDeg: 0 } },
      ],
      manufacturingAnalytics: { totalCutLengthMm: 1234, totalPierceCount: 9, estimatedCutTimeSec: 42, partWeightKg: 1.1 },
    };
    const cam = buildCamDocument('ORD-1', custom(legacy));
    expect(cam.designFormat).toBe('legacy-vdm3');
    const { contours, widthMm, heightMm, substrate, thicknessMm } = cam.production;
    expect([widthMm, heightMm]).toEqual([250, 180]);
    expect([substrate, thicknessMm]).toEqual(['brass_cz108', 3]);
    expect(contours.map(c => c.role)).toEqual(['inner', 'inner', 'outer']);
    const rect = contours.map(c => boundsOf(c.d)).find(b => Math.round(b.maxX - b.minX) === 40)!;
    expect([rect.minX, rect.minY]).toEqual([100, 80]);
  });

  it('refuses corrupt or incomplete customer designs instead of inventing geometry', () => {
    expect(() => buildCamDocument('ORD-1', { ...baseItem, customDesignRef: '{not json' })).toThrow(/not valid JSON/);
    expect(() => buildCamDocument('ORD-1', { ...baseItem, customDesignRef: '{"version":"3.0.0"}' })).toThrow(/incomplete/);
    expect(() => buildCamDocument('ORD-1', { ...baseItem, customDesignRef: '{"schemaVersion":4,"objects":"x"}' })).toThrow(/incomplete or corrupt/);
  });

  it('falls back to the catalog outline for catalog items', () => {
    const { production, source } = buildCamDocument('ORD-2', baseItem);
    expect(source).toBe('catalog-shape');
    expect(production.widthMm).toBeCloseTo(400, 3);
    expect(production.contours.map(c => c.role)).toEqual(['outer']);
    expect(() => buildCamDocument('ORD-2', { ...baseItem, shapeId: 'no-such-shape' })).toThrow(/Unknown catalog shape/);
  });
});
