// @vitest-environment node
import DxfParser from 'dxf-parser';
import { describe, expect, it } from 'vitest';
import { CAM_LAYERS, exportProductionDXF, exportProductionSVG } from '@/lib/exportCAM';
import { composeDocument } from '../compose';
import { createDocument, createHole, createShape } from '../document';
import { resolveCutRules } from '../materials';
import { buildProduction, machineContours } from '../production';

const rules = resolveCutRules('black_patina', 2);

function plateWithCutouts() {
  const doc = createDocument({
    plate: { style: 'solid', shapeId: 'rectangle', widthMm: 300, heightMm: 200, cornerRadiusMm: 0 },
    mounting: { preset: 'none' },
    objects: [
      createShape({ shapeId: 'rectangle', widthMm: 100, heightMm: 50, x: 150, y: 100 }),
      createHole({ x: 20, y: 20, diameterMm: 6 }),
    ],
  });
  return buildProduction(composeDocument(doc, rules), rules, 'black_patina');
}

interface ParsedDxf {
  header: Record<string, unknown>;
  tables: { layer: { layers: Record<string, unknown> } };
  entities: { type: string; layer: string; shape?: boolean; vertices: { x: number; y: number }[] }[];
}

describe('production geometry', () => {
  it('orders inner contours before the outer perimeter', () => {
    const prod = plateWithCutouts();
    expect(prod.contours.map(c => c.role)).toEqual(['inner', 'inner', 'outer']);
    expect(prod.widthMm).toBeCloseTo(300, 3);
    expect(prod.heightMm).toBeCloseTo(200, 3);
  });

  it('kerf compensation grows the part by kerf/2 per edge and shrinks holes', () => {
    const prod = plateWithCutouts();
    const nominal = machineContours(prod, false);
    const comp = machineContours(prod, true);
    const width = (rings: typeof nominal, role: 'inner' | 'outer') => {
      const pts = rings.filter(c => c.role === role).flatMap(c => c.ring);
      return Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x));
    };
    expect(width(comp, 'outer') - width(nominal, 'outer')).toBeCloseTo(prod.kerfMm, 3);
    // The rectangular cut-out shrinks by the kerf.
    const rect = (rings: typeof nominal) => rings.filter(c => c.role === 'inner').map(c => Math.max(...c.ring.map(p => p.x)) - Math.min(...c.ring.map(p => p.x))).sort((a, b) => b - a)[0];
    expect(rect(nominal) - rect(comp)).toBeCloseTo(prod.kerfMm, 3);
  });

  it('writes an R12 DXF in millimetres with closed polylines on cut-order layers', () => {
    const dxf = exportProductionDXF(plateWithCutouts());
    const parsed = new DxfParser().parseSync(dxf) as unknown as ParsedDxf;
    expect(parsed.header.$ACADVER).toBe('AC1009');
    expect(parsed.header.$INSUNITS).toBe(4);
    expect(Object.keys(parsed.tables.layer.layers)).toEqual(expect.arrayContaining([CAM_LAYERS.inner.name, CAM_LAYERS.outer.name]));
    const polys = parsed.entities.filter(e => e.type === 'POLYLINE');
    expect(polys.map(p => p.layer)).toEqual([CAM_LAYERS.inner.name, CAM_LAYERS.inner.name, CAM_LAYERS.outer.name]);
    expect(polys.every(p => p.shape)).toBe(true);
    const xs = polys.flatMap(p => p.vertices.map(v => v.x));
    const ys = polys.flatMap(p => p.vertices.map(v => v.y));
    expect(Math.min(...xs)).toBeCloseTo(0, 3);
    expect(Math.max(...xs)).toBeCloseTo(300, 3);
    expect(Math.max(...ys)).toBeCloseTo(200, 3);
    // y is flipped into DXF's y-up frame: the hole near the top-left plate corner sits near y = 200.
    const hole = polys[0].vertices.length > polys[1].vertices.length ? polys[0] : polys[1];
    expect(Math.max(...hole.vertices.map(v => v.y))).toBeGreaterThan(170);
  });

  it('writes a millimetre SVG with layer groups in cut order', () => {
    const svg = exportProductionSVG(plateWithCutouts());
    expect(svg).toContain('width="300.000mm"');
    expect(svg.indexOf(CAM_LAYERS.inner.name)).toBeLessThan(svg.indexOf(CAM_LAYERS.outer.name));
    expect((svg.match(/<path /g) ?? []).length).toBe(3);
  });
});
