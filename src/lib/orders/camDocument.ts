/**
 * Builds the production geometry for one order line.
 *
 * Studio orders carry the customer's complete design in `customDesignRef`:
 *  - schemaVersion 4 (current studio): the frozen `production` contours are exported as-is,
 *    so production cuts exactly what the customer saw priced. Documents without a snapshot
 *    (e.g. created through the headless API) are composed here with the same code.
 *  - VDM 3.0.0 (studio before Nov 2026): migrated by `migrateLegacyDesign` with the old
 *    exporter's semantics (boundary = outer perimeter, every feature = inner cut, positions
 *    translated by transform.xMm/yMm).
 * Only catalog items fall back to the product's boundary outline.
 */
import { composeDocument } from '@/lib/studio/compose';
import { circleRing, difference, normaliseEvenOdd, union } from '@/lib/studio/geometry/clipper';
import { pathToRings, ringsBounds, type Rings } from '@/lib/studio/geometry/path';
import { isSubstrate, resolveCutRules, resolveSubstrateRules, type Substrate } from '@/lib/studio/materials';
import { buildProduction } from '@/lib/studio/production';
import { STUDIO_SCHEMA_VERSION, studioDocumentSchema, type ProductionGeometry } from '@/lib/studio/schema';
import { STUDIO_SHAPES, studioShapePath } from '@/lib/studio/shapes';
import type { OrderItem } from '@/types/store';

export type CamSource = 'customer-design' | 'catalog-shape';

export interface CamDocument {
  production: ProductionGeometry;
  source: CamSource;
  documentId: string;
  title: string;
  /** Format the customer design was stored in (absent for catalog items). */
  designFormat?: 'studio-v4' | 'legacy-vdm3';
}

export function hasCustomDesign(item: Pick<OrderItem, 'customDesignRef'>): boolean {
  return Boolean(item.customDesignRef && item.customDesignRef.trim().startsWith('{'));
}

// ---------- legacy VDM 3.0.0 ----------

interface LegacyLayer {
  type?: string;
  visible?: boolean;
  camLayer?: string;
  transform?: { xMm?: number; yMm?: number };
  diameterMm?: number;
  derivedPathData?: string;
  pathData?: string;
}

interface LegacyDesign {
  version?: string;
  boundary: { widthMm: number; heightMm: number; pathData?: string; shapeTemplateId?: string; shapeId?: string };
  material: { substrate?: string; thicknessMm?: number; finish?: string };
  layers: LegacyLayer[];
}

function isLegacyDesign(value: unknown): value is LegacyDesign {
  const v = value as Partial<LegacyDesign> | null;
  return Boolean(
    v && typeof v === 'object' && v.boundary && typeof v.boundary.widthMm === 'number' &&
      typeof v.boundary.heightMm === 'number' && Array.isArray(v.layers) && v.material,
  );
}

const LEGACY_TOLERANCE = 0.03;

/** Converts a VDM 3.0.0 design into production geometry, reproducing the old exporter's output. */
export function migrateLegacyDesign(design: LegacyDesign): ProductionGeometry {
  const { boundary, material } = design;
  const outlinePath = boundary.pathData && boundary.pathData.length > 4
    ? boundary.pathData
    : studioShapePath(boundary.shapeTemplateId ?? boundary.shapeId ?? 'rectangle', boundary.widthMm, boundary.heightMm);
  const outline = normaliseEvenOdd(pathToRings(outlinePath, LEGACY_TOLERANCE));

  const cuts: Rings = [];
  const adds: Rings = [];
  const score: Rings = [];
  for (const layer of design.layers) {
    if (layer.visible === false) continue;
    const dx = layer.transform?.xMm ?? 0;
    const dy = layer.transform?.yMm ?? 0;
    if (layer.type === 'mounting_hole' && typeof layer.diameterMm === 'number') {
      cuts.push(circleRing(dx, dy, layer.diameterMm / 2));
      continue;
    }
    const d = layer.type === 'typography' ? layer.derivedPathData : layer.type === 'vector_path' ? layer.pathData : undefined;
    if (!d) continue;
    const rings = pathToRings(d, LEGACY_TOLERANCE, [1, 0, 0, 1, dx, dy]);
    if (layer.camLayer === '2_VECTOR_SCORE') score.push(...rings);
    else if (layer.camLayer === '1_CUT_PERIMETER') adds.push(...normaliseEvenOdd(rings));
    else cuts.push(...normaliseEvenOdd(rings));
  }
  const region = difference(union(outline, adds), cuts);
  const substrate: Substrate = isSubstrate(material.substrate) ? material.substrate : 'mild_steel';
  const rules = resolveSubstrateRules(substrate, material.thicknessMm ?? 3);
  const bounds = ringsBounds(region.length ? region : score);
  if (!bounds) throw new Error('The stored customer design has no cuttable geometry.');
  return buildProduction(
    { material: region, score, bounds, pieces: [], bridges: [], mountingHoles: [], mountingDropped: 0, pendingText: [] },
    rules,
    material.finish ?? 'unknown',
  );
}

// ---------- entry point ----------

function customerDesign(item: OrderItem): Pick<CamDocument, 'production' | 'designFormat'> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(item.customDesignRef as string);
  } catch {
    throw new Error('The stored customer design is not valid JSON and cannot be exported.');
  }
  if ((parsed as { schemaVersion?: unknown })?.schemaVersion === STUDIO_SCHEMA_VERSION) {
    const result = studioDocumentSchema.safeParse(parsed);
    if (!result.success) throw new Error('The stored customer design is incomplete or corrupt and cannot be exported.');
    const doc = result.data;
    if (doc.production) return { production: doc.production, designFormat: 'studio-v4' };
    const rules = resolveCutRules(doc.material.finish, doc.material.thicknessMm);
    const composition = composeDocument(doc, rules);
    if (!composition.bounds) throw new Error('The stored customer design has no cuttable geometry.');
    return { production: buildProduction(composition, rules, doc.material.finish), designFormat: 'studio-v4' };
  }
  if (!isLegacyDesign(parsed)) {
    throw new Error('The stored customer design is incomplete (missing boundary, material or layers).');
  }
  return { production: migrateLegacyDesign(parsed), designFormat: 'legacy-vdm3' };
}

export function buildCamDocument(orderId: string, item: OrderItem): CamDocument {
  const documentId = `cam-${orderId}-${item.id}`;
  const title = `${orderId} - ${item.productName}`;
  if (hasCustomDesign(item)) {
    return { ...customerDesign(item), source: 'customer-design', documentId, title };
  }

  const width = item.widthMm;
  const height = item.heightMm;
  if (!(width > 0 && height > 0)) throw new Error('This item has no dimensions recorded.');
  const shapeId = item.shapeId || 'rectangle';
  if (!STUDIO_SHAPES.some(s => s.id === shapeId)) throw new Error(`Unknown catalog shape "${item.shapeId}"; cannot build a cutting outline.`);
  const outline = normaliseEvenOdd(pathToRings(studioShapePath(shapeId, width, height), LEGACY_TOLERANCE));
  const finish = item.finish ?? '';
  const rules = resolveCutRules(finish, 3);
  return {
    source: 'catalog-shape',
    documentId,
    title,
    production: buildProduction(
      { material: outline, score: [], bounds: ringsBounds(outline), pieces: [], bridges: [], mountingHoles: [], mountingDropped: 0, pendingText: [] },
      rules,
      finish,
    ),
  };
}
