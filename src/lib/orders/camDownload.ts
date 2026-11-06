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
import { createZip, type ZipEntry } from './zipStore';

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type CamFormat = 'svg' | 'dxf' | 'pdf';

const MIME: Record<CamFormat, string> = { svg: 'image/svg+xml', dxf: 'application/dxf', pdf: 'application/pdf' };

export interface ProductionFile {
  filename: string;
  data: Uint8Array;
  source: CamSource;
}

/** Builds one order line's production file; throws a readable Error when the design cannot be exported. */
export function buildProductionFile(order: Order, item: OrderItem, format: CamFormat, label: string = item.id): ProductionFile {
  const ref = order.orderNumber || order.id;
  const { production, source } = buildCamDocument(ref, item);
  const filename = `${ref}-${label}.${format}`.replace(/[^A-Za-z0-9_.-]/g, '_');
  if (format === 'pdf') {
    const pdf = exportProductionPDF(production, {
      reference: ref,
      title: item.productName,
      customerEmail: order.email,
      quantity: item.quantity,
    });
    return { filename, data: new Uint8Array(pdf.output('arraybuffer')), source };
  }
  const text = format === 'svg' ? exportProductionSVG(production) : exportProductionDXF(production);
  return { filename, data: new TextEncoder().encode(text), source };
}

/** Builds and downloads the file for one order line. */
export function downloadProductionFile(order: Order, item: OrderItem, format: CamFormat): CamSource {
  const file = buildProductionFile(order, item, format);
  saveBlob(new Blob([file.data], { type: MIME[format] }), file.filename);
  return file.source;
}

export interface ZipResult {
  filename: string;
  files: number;
  /** Lines that could not be exported, with the reason. */
  failed: { item: OrderItem; reason: string }[];
}

/**
 * Downloads every line of an order as one zip: one file per line, numbered in line order so
 * batch variants stay distinguishable. Lines that cannot be exported are skipped and
 * reported, not fatal. Throws when no line could be exported.
 */
export function downloadOrderZip(order: Order, format: CamFormat): ZipResult {
  const entries: ZipEntry[] = [];
  const failed: ZipResult['failed'] = [];
  const width = String(order.items.length).length;
  order.items.forEach((item, i) => {
    try {
      const name = item.productName.replace(/^Custom:\s*/, '');
      const file = buildProductionFile(order, item, format, `${String(i + 1).padStart(width, '0')}-${name}`.slice(0, 80));
      entries.push({ name: file.filename, data: file.data });
    } catch (err) {
      failed.push({ item, reason: err instanceof Error ? err.message : 'Could not export' });
    }
  });
  if (entries.length === 0) throw new Error(failed[0]?.reason ?? 'Nothing to export.');
  const filename = `${order.orderNumber || order.id}-${format}.zip`.replace(/[^A-Za-z0-9_.-]/g, '_');
  saveBlob(new Blob([createZip(entries)], { type: 'application/zip' }), filename);
  return { filename, files: entries.length, failed };
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
