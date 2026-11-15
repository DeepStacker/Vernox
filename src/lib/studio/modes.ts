/**
 * Which tools and panels each mode exposes. Simple is the shopper default: it can design
 * complex pieces (templates, elements, patterns, shapes, drawing, repeat and symmetry, combine,
 * flip, centre, group) with plain-language labels and auto-fix on. Pro adds precise numeric
 * editing, layers, rulers, offset, the full align/boolean set, import and export. Both edit the
 * same document — switching never changes or loses data.
 */
import { safeLocal } from '@/lib/safeStorage';

export type StudioMode = 'simple' | 'pro';

export type ToolId = 'select' | 'text' | 'shape' | 'elements' | 'patterns' | 'pen' | 'pencil' | 'upload' | 'templates' | 'plate' | 'layers' | 'import';

export type FeatureId =
  | 'transform-fields'
  /** Align edges and distribute (Pro); Simple has 'centre'. */
  | 'align'
  | 'centre'
  /** All four boolean operations (Pro); Simple has 'combine' (Combine / Cut out of). */
  | 'booleans'
  | 'combine'
  | 'flip'
  | 'group'
  | 'repeat'
  | 'offset'
  | 'layers'
  | 'rulers'
  | 'grid'
  | 'object-op'
  | 'export'
  | 'all-finishes'
  | 'all-shapes'
  | 'manual-bridges-toggle';

const TOOLS: Record<StudioMode, readonly ToolId[]> = {
  // Drawing (pen, pencil) is in both modes: Simple shows friendlier labels (ToolRail).
  simple: ['select', 'templates', 'text', 'elements', 'shape', 'pen', 'pencil', 'patterns', 'upload', 'plate'],
  pro: ['select', 'templates', 'text', 'elements', 'shape', 'pen', 'pencil', 'patterns', 'upload', 'import', 'plate', 'layers'],
};

const SHARED_FEATURES: readonly FeatureId[] = ['centre', 'combine', 'flip', 'group', 'repeat'];

const FEATURES: Record<StudioMode, ReadonlySet<FeatureId>> = {
  simple: new Set<FeatureId>(SHARED_FEATURES),
  pro: new Set<FeatureId>([...SHARED_FEATURES, 'transform-fields', 'align', 'booleans', 'offset', 'layers', 'rulers', 'grid', 'object-op', 'export', 'all-finishes', 'all-shapes', 'manual-bridges-toggle']),
};

export const toolsFor = (mode: StudioMode) => TOOLS[mode];
export const hasFeature = (mode: StudioMode, feature: FeatureId) => FEATURES[mode].has(feature);

const MODE_KEY = 'vernox-studio-mode';

export function readSavedMode(): StudioMode {
  return safeLocal.get(MODE_KEY) === 'pro' ? 'pro' : 'simple';
}

export function saveMode(mode: StudioMode) {
  safeLocal.set(MODE_KEY, mode);
}
