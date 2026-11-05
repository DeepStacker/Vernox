/**
 * Production file download for one order line (SVG / DXF / PDF) plus manufacturability warnings.
 * Customer designs are exported as designed; catalog items use their outline (see camDocument.ts).
 */
import { FIBER_LASER_3KW_PROFILE, getGaugeParameters } from '@/lib/cadEngineTypes';
import { exportDocumentAsDXF, exportDocumentAsPDF, exportDocumentAsSVG } from '@/lib/exportCAM';
import { validateVectorDocument } from '@/lib/manufacturingRules';
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
  const { doc, source } = buildCamDocument(ref, item);
  const base = `${ref}-${item.id}`.replace(/[^A-Za-z0-9_-]/g, '_');
  if (format === 'svg') saveText(exportDocumentAsSVG(doc), `${base}.svg`, 'image/svg+xml');
  else if (format === 'dxf') saveText(exportDocumentAsDXF(doc), `${base}.dxf`, 'application/dxf');
  else exportDocumentAsPDF(doc, { orderNumber: ref, customerEmail: order.email, notes: item.productName }).save(`${base}.pdf`);
  return source;
}

/** Manufacturability messages for a line; empty when fine or when the design cannot be built. */
export function manufacturabilityWarnings(order: Order, item: OrderItem): string[] {
  try {
    const { doc, source } = buildCamDocument(order.orderNumber || order.id, item);
    // Catalog outlines have no features to validate; only customer designs carry real geometry.
    if (source !== 'customer-design') return [];
    const gauge = getGaugeParameters(FIBER_LASER_3KW_PROFILE, doc.material.substrate, doc.material.thicknessMm);
    return validateVectorDocument({ doc, machine: FIBER_LASER_3KW_PROFILE, gauge }).map(i => `${i.severity === 'error' ? 'Error' : 'Warning'}: ${i.message}`);
  } catch {
    return [];
  }
}
