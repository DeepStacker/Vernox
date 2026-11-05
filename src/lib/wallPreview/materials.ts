import type { FinishId } from '@/lib/catalog';

type CanonicalFinish = Exclude<FinishId, 'steel' | 'corten'>;

export interface FinishMaterial {
  /** Canonical id (legacy ids resolve to their modern equivalent). */
  id: CanonicalFinish;
  /** Base colour for PBR (sRGB hex). */
  colour: string;
  metalness: number;
  roughness: number;
  /** Brushed finishes show fine streaks; polished ones a smooth gradient. */
  brushed: boolean;
  /** Gradient stops from lit to shaded, matching the storefront swatches (see ShapeThumb). */
  stops: [string, string, string, string];
  /** Colour of the bevelled edge catching light. */
  edge: string;
  /** Strength 0..1 of the broad specular sheen. */
  sheen: number;
}

const MATERIALS: Record<CanonicalFinish, FinishMaterial> = {
  black_patina: { id: 'black_patina', colour: '#1a1a1a', metalness: 0.55, roughness: 0.62, brushed: false, stops: ['#5c5c5c', '#2c2c2c', '#151515', '#0c0c0c'], edge: '#8a8a8a', sheen: 0.18 },
  brass: { id: 'brass', colour: '#c9a24a', metalness: 1, roughness: 0.28, brushed: false, stops: ['#ffe79a', '#dca842', '#b27b16', '#664103'], edge: '#fff3c4', sheen: 0.55 },
  antique_brass: { id: 'antique_brass', colour: '#8a6a2e', metalness: 0.9, roughness: 0.5, brushed: true, stops: ['#d9b56a', '#a8803a', '#7a5a22', '#4a3410'], edge: '#e6cb8e', sheen: 0.25 },
  gold: { id: 'gold', colour: '#d9b441', metalness: 1, roughness: 0.2, brushed: false, stops: ['#fff6d1', '#e8c95e', '#bc9a24', '#755b0a'], edge: '#fffbe6', sheen: 0.65 },
  copper: { id: 'copper', colour: '#c4703f', metalness: 1, roughness: 0.3, brushed: false, stops: ['#ffc4a6', '#e0764c', '#b54b20', '#631e05'], edge: '#ffd9c2', sheen: 0.5 },
  corten_rust: { id: 'corten_rust', colour: '#8a3f1c', metalness: 0.35, roughness: 0.85, brushed: false, stops: ['#f29f63', '#d9653b', '#963c11', '#4d1902'], edge: '#e69a6b', sheen: 0.05 },
  stainless: { id: 'stainless', colour: '#b5b5b5', metalness: 1, roughness: 0.18, brushed: false, stops: ['#ffffff', '#dfdfdf', '#a8a8a8', '#686868'], edge: '#ffffff', sheen: 0.7 },
  brushed_hairline: { id: 'brushed_hairline', colour: '#a9a9a9', metalness: 1, roughness: 0.42, brushed: true, stops: ['#ffffff', '#dfdfdf', '#a8a8a8', '#686868'], edge: '#f4f4f4', sheen: 0.3 },
};

const LEGACY: Record<string, CanonicalFinish> = { steel: 'black_patina', corten: 'corten_rust' };

/** Unknown finishes fall back to brass, matching ShapeThumb, so a new finish id never breaks the preview. */
export function materialForFinish(finish: string): FinishMaterial {
  const key = LEGACY[finish] ?? (finish as CanonicalFinish);
  return MATERIALS[key] ?? MATERIALS.brass;
}
