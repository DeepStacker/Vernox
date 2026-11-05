import type { Product, ProductSize } from '@/lib/catalog';
import { getShapeById, shapeDefinitions } from '@/lib/shapes';
import type { Outline } from './types';

/** The flat outline (SVG path in mm) of a catalogue product at a given size. */
export function outlineForProduct(product: Pick<Product, 'shapeId'>, size: Pick<ProductSize, 'widthMm' | 'heightMm'>): Outline {
  const shape = getShapeById(product.shapeId) ?? shapeDefinitions[0];
  return { svgPath: shape.getPath(size.widthMm, size.heightMm), widthMm: size.widthMm, heightMm: size.heightMm };
}

/** Standard spacer length: pieces sit 2.5 cm off the wall on standoffs. */
export const STANDOFF_MM = 25;
export const DEFAULT_THICKNESS_MM = 2;

export interface MountingHole {
  /** Position in mm from the top-left of the bounding box. */
  x: number;
  y: number;
}

export interface MountingLayout {
  holes: MountingHole[];
  holeDiameterMm: number;
  spacerMm: number;
  note: string;
}

/**
 * Indicative standoff positions: four corners inset from the bounding box, plus two mid-points on pieces
 * wider than 60 cm so large sheets do not bow. Round shapes use points on the inscribed ellipse instead
 * of box corners. Final positions are confirmed on the order proof.
 */
export function mountingLayout(widthMm: number, heightMm: number, round = false): MountingLayout {
  const inset = Math.max(20, Math.min(widthMm, heightMm) * 0.08);
  const holes: MountingHole[] = [];
  if (round) {
    const cx = widthMm / 2, cy = heightMm / 2;
    const rx = widthMm / 2 - inset, ry = heightMm / 2 - inset;
    for (const a of [-Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.25, Math.PI * 0.75]) {
      holes.push({ x: cx + rx * Math.cos(a) * 0.95, y: cy + ry * Math.sin(a) * 0.95 });
    }
  } else {
    holes.push({ x: inset, y: inset }, { x: widthMm - inset, y: inset }, { x: widthMm - inset, y: heightMm - inset }, { x: inset, y: heightMm - inset });
    if (widthMm > 600) holes.push({ x: widthMm / 2, y: inset }, { x: widthMm / 2, y: heightMm - inset });
  }
  return {
    holes: holes.map(h => ({ x: Math.round(h.x), y: Math.round(h.y) })),
    holeDiameterMm: 6,
    spacerMm: STANDOFF_MM,
    note: 'Indicative positions. We confirm exact standoff points on your proof.',
  };
}

export const isRoundShape = (shapeId: string) => shapeId === 'circle' || shapeId === 'ellipse';
