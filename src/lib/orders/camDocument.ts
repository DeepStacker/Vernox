/**
 * Builds the VectorDocument used for CAM export from an order line.
 * Studio orders carry the customer's complete design (`customDesignRef`, written by the
 * Crafting Studio); that document is exported as-is so production cuts exactly what the
 * customer designed. Only catalog items fall back to the product's boundary outline.
 */
import { FIBER_LASER_3KW_PROFILE, getGaugeParameters, type MetalSubstrate, type VectorDocument } from '@/lib/cadEngineTypes';
import { getShapeById } from '@/lib/shapes';
import type { OrderItem } from '@/types/store';

export type CamSource = 'customer-design' | 'catalog-shape';

export interface CamDocument {
  doc: VectorDocument;
  source: CamSource;
}

function isVectorDocument(value: unknown): value is VectorDocument {
  const v = value as Partial<VectorDocument> | null;
  return Boolean(
    v && typeof v === 'object' && v.boundary && typeof v.boundary.widthMm === 'number' &&
      typeof v.boundary.heightMm === 'number' && Array.isArray(v.layers) && v.material,
  );
}

export function hasCustomDesign(item: Pick<OrderItem, 'customDesignRef'>): boolean {
  return Boolean(item.customDesignRef && item.customDesignRef.trim().startsWith('{'));
}

export function buildCamDocument(orderId: string, item: OrderItem): CamDocument {
  if (hasCustomDesign(item)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(item.customDesignRef as string);
    } catch {
      throw new Error('The stored customer design is not valid JSON and cannot be exported.');
    }
    if (!isVectorDocument(parsed)) {
      throw new Error('The stored customer design is incomplete (missing boundary, material or layers).');
    }
    return { doc: { ...parsed, documentId: `cam-${orderId}-${item.id}` }, source: 'customer-design' };
  }

  const shape = getShapeById(item.shapeId);
  if (!shape) throw new Error(`Unknown catalog shape "${item.shapeId}"; cannot build a cutting outline.`);
  const width = item.widthMm;
  const height = item.heightMm;
  if (!(width > 0 && height > 0)) throw new Error('This item has no dimensions recorded.');

  const finish = item.finish ?? '';
  const substrate: MetalSubstrate = finish.includes('copper') ? 'copper_c101'
    : finish.includes('stainless') ? 'stainless_304'
    : finish.includes('steel') ? 'mild_steel'
    : finish.includes('corten') ? 'corten_weathering'
    : 'brass_cz108';
  const thicknessMm = 3.0;

  return {
    source: 'catalog-shape',
    doc: {
      version: '3.0.0',
      documentId: `cam-${orderId}-${item.id}`,
      unit: 'mm',
      boundary: {
        widthMm: width,
        heightMm: height,
        cornerRadiusMm: 0,
        shapeTemplateId: item.shapeId,
        pathData: shape.getPath(width, height),
      },
      material: {
        substrate,
        thicknessMm,
        finish: finish as VectorDocument['material']['finish'],
        activeGaugeParams: getGaugeParameters(FIBER_LASER_3KW_PROFILE, substrate, thicknessMm),
      },
      layers: [],
      // Not measured for catalog outlines; zeros mean "unknown", validation is explicitly off.
      manufacturingAnalytics: {
        totalCutLengthMm: 0,
        totalPierceCount: 0,
        estimatedCutTimeSec: 0,
        partWeightKg: 0,
        isValidated: false,
      },
      uploadedArtworkName: `${orderId} - ${item.productName}`,
    } as VectorDocument,
  };
}
