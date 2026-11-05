/**
 * Production file exports (SVG, DXF R12; the PDF sheet is in exportPDF.ts) from frozen production geometry
 * (src/lib/studio/production.ts). Used by the admin Production console (via
 * src/lib/orders/camDownload.ts) and by the studio's own export menu.
 *
 * Geometry is exported at 1:1 in millimetres, contours in cut order (inner before outer).
 * By default contours are nominal (the CAM software applies its tool/kerf offset); pass
 * `applyKerf` for files that are already compensated by kerf/2.
 */
import { writeDxfR12, type DxfLayer } from './exportDXF';
import { machineContours, type OrderedContour } from './studio/production';
import { ringsToPathData } from './studio/geometry/path';
import type { ProductionGeometry } from './studio/schema';

export interface CamExportOptions {
  applyKerf?: boolean;
}

/** DXF/SVG layer names; numeric prefixes keep alphabetical order equal to cut order. */
export const CAM_LAYERS = {
  inner: { name: '1_CUT_INNER', color: 1, svg: '#e11d48' },
  score: { name: '2_SCORE', color: 5, svg: '#2563eb' },
  outer: { name: '3_CUT_OUTER', color: 7, svg: '#111111' },
} as const;

function grouped(contours: OrderedContour[]) {
  return (['inner', 'score', 'outer'] as const).map(role => ({ role, items: contours.filter(c => c.role === role) }));
}

function extents(prod: ProductionGeometry, applyKerf: boolean) {
  const grow = applyKerf ? prod.kerfMm : 0;
  return { w: prod.widthMm + grow, h: prod.heightMm + grow, shift: applyKerf ? prod.kerfMm / 2 : 0 };
}

export function exportProductionSVG(prod: ProductionGeometry, options: CamExportOptions = {}): string {
  const applyKerf = options.applyKerf ?? false;
  const { w, h, shift } = extents(prod, applyKerf);
  const contours = machineContours(prod, applyKerf);
  const groups = grouped(contours).map(({ role, items }) => {
    const layer = CAM_LAYERS[role];
    const paths = items
      .map(c => `    <path d="${ringsToPathData([c.ring.map(p => ({ x: p.x + shift, y: p.y + shift }))], c.closed, 3)}"/>`)
      .join('\n');
    return `  <g id="${layer.name}" fill="none" stroke="${layer.svg}" stroke-width="0.1">\n${paths}\n  </g>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(3)}mm" height="${h.toFixed(3)}mm" viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}" data-material="${prod.substrate}" data-thickness-mm="${prod.thicknessMm}" data-kerf-mm="${prod.kerfMm}" data-kerf-compensated="${applyKerf}">
  <!-- Vernox production file. Units: mm. Cut order: ${CAM_LAYERS.inner.name}, ${CAM_LAYERS.score.name}, ${CAM_LAYERS.outer.name}. -->
${groups.join('\n')}
</svg>
`;
}

export function exportProductionDXF(prod: ProductionGeometry, options: CamExportOptions = {}): string {
  const applyKerf = options.applyKerf ?? false;
  const { w, h, shift } = extents(prod, applyKerf);
  const contours = machineContours(prod, applyKerf);
  const layers: DxfLayer[] = grouped(contours).map(({ role, items }) => ({
    name: CAM_LAYERS[role].name,
    color: CAM_LAYERS[role].color,
    polylines: items.map(c => ({ points: c.ring.map(p => ({ x: p.x + shift, y: p.y + shift })), closed: c.closed })),
  }));
  return writeDxfR12(layers, w, h);
}
