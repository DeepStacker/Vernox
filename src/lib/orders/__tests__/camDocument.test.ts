import { describe, expect, it } from 'vitest';
import type { OrderItem } from '@/types/store';
import { buildCamDocument } from '../camDocument';

const baseItem: OrderItem = {
  id: 'i1', productId: 'prod-1', productName: 'Test piece', productSlug: 'test', shapeId: 'rectangle',
  sizeLabel: '400mm', widthMm: 400, heightMm: 300, finish: 'brass', unitPrice: 100, quantity: 1, lineTotal: 100,
};

describe('buildCamDocument', () => {
  it('exports the customer design layers unchanged for studio orders', () => {
    const design = {
      version: '3.0.0', unit: 'mm',
      material: { substrate: 'brass_cz108', thicknessMm: 3, finish: 'brushed' },
      boundary: { widthMm: 250, heightMm: 180, cornerRadiusMm: 0, shapeTemplateId: 'circle', pathData: 'M0,0' },
      layers: [{ id: 'l1', type: 'text', name: 'Customer text' }],
      manufacturingAnalytics: { totalCutLengthMm: 1234, totalPierceCount: 9, estimatedCutTimeSec: 42, partWeightKg: 1.1 },
    };
    const { doc, source } = buildCamDocument('ORD-1', { ...baseItem, productId: 'custom-bespoke', customDesignRef: JSON.stringify(design) });
    expect(source).toBe('customer-design');
    expect(doc.layers).toHaveLength(1);
    expect(doc.boundary.widthMm).toBe(250);
    expect(doc.manufacturingAnalytics.totalCutLengthMm).toBe(1234);
    expect(doc.documentId).toBe('cam-ORD-1-i1');
  });

  it('refuses corrupt or incomplete customer designs instead of inventing geometry', () => {
    expect(() => buildCamDocument('ORD-1', { ...baseItem, customDesignRef: '{not json' })).toThrow(/not valid JSON/);
    expect(() => buildCamDocument('ORD-1', { ...baseItem, customDesignRef: '{"version":"3.0.0"}' })).toThrow(/incomplete/);
  });

  it('falls back to the catalog outline for catalog items without fabricated analytics', () => {
    const { doc, source } = buildCamDocument('ORD-2', baseItem);
    expect(source).toBe('catalog-shape');
    expect(doc.boundary.widthMm).toBe(400);
    expect(doc.layers).toEqual([]);
    expect(doc.manufacturingAnalytics.totalCutLengthMm).toBe(0);
    expect(doc.manufacturingAnalytics.isValidated).toBe(false);
  });
});
