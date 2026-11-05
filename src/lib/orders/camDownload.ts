/**
 * Production file download for one order line (SVG / DXF / PDF) plus manufacturability warnings.
 * Customer designs are exported as designed; catalog items use their outline (see camDocument.ts).
 */
import { exportProductionDXF, exportProductionSVG } from '@/lib/exportCAM';
import { exportProductionPDF } from '@/lib/exportPDF';
import { analyzeComposition } from '@/lib/studio/manufacturability';
import { productionRegion } from '@/lib/studio/production';
import { pieces } from '@/lib/studio/geometry/clipper';
import { ringsBounds } from '@/lib/studio/geometry/path';
import { isSubstrate, resolveSubstrateRules } from '@/lib/studio/materials';
import { createDocument } from '@/lib/studio/document';
import { issueMessage } from '@/lib/studio/i18n';
import type { Order, OrderItem } from '@/types/store';
import { buildCamDocument, type CamSource } from './camDocument';

function saveText(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type CamFormat = 'svg' | 'dxf' | 'pdf';

/** Builds and downloads the file; throws a readable Error when the design cannot be exported. */
export function downloadProductionFile(order: Order, item: OrderItem, format: CamFormat): CamSource {
  const ref = order.orderNumber || order.id;
  const { production, source } = buildCamDocument(ref, item);
  const base = `${ref}-${item.id}`.replace(/[^A-Za-z0-9_-]/g, '_');
  if (format === 'svg') saveText(exportProductionSVG(production), `${base}.svg`, 'image/svg+xml');
  else if (format === 'dxf') saveText(exportProductionDXF(production), `${base}.dxf`, 'application/dxf');
  else {
    exportProductionPDF(production, {
      reference: ref,
      title: item.productName,
      customerEmail: order.email,
      quantity: item.quantity,
    }).save(`${base}.pdf`);
  }
  return source;
}

/** Manufacturability messages for a line; empty when fine or when the design cannot be built. */
export function manufacturabilityWarnings(order: Order, item: OrderItem): string[] {
  try {
    const { production, source } = buildCamDocument(order.orderNumber || order.id, item);
    // Catalog outlines have no features to validate; only customer designs carry real geometry.
    if (source !== 'customer-design') return [];
    const substrate = isSubstrate(production.substrate) ? production.substrate : 'mild_steel';
    const rules = resolveSubstrateRules(substrate, production.thicknessMm);
    const { region, score } = productionRegion(production);
    const composition = {
      material: region, score, pieces: pieces(region), bridges: [], mountingHoles: [], mountingDropped: 0, pendingText: [],
      bounds: ringsBounds(region),
    };
    // A plate-less shell document: only geometric rules apply to frozen contours.
    const shell = createDocument({ plate: { style: 'none' } });
    return analyzeComposition(shell, composition, rules).issues.map(
      i => `${i.severity === 'error' ? 'Error' : 'Warning'}: ${issueMessage(i)}`,
    );
  } catch {
    return [];
  }
}
