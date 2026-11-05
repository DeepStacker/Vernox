/**
 * Which tools and panels each mode exposes. Simple is the shopper default (templates +
 * essentials, auto-fix on); Pro adds precise numeric editing, layers, booleans, import and
 * export. Both edit the same document — switching never changes or loses data.
 */
import { safeLocal } from '@/lib/safeStorage';

export type StudioMode = 'simple' | 'pro';

export type ToolId = 'select' | 'text' | 'shape' | 'upload' | 'templates' | 'plate' | 'layers' | 'import';

export type FeatureId =
  | 'transform-fields'
  | 'align'
  | 'booleans'
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
  simple: ['select', 'templates', 'text', 'shape', 'upload', 'plate'],
  pro: ['select', 'templates', 'text', 'shape', 'upload', 'import', 'plate', 'layers'],
};

const FEATURES: Record<StudioMode, ReadonlySet<FeatureId>> = {
  simple: new Set<FeatureId>([]),
  pro: new Set<FeatureId>(['transform-fields', 'align', 'booleans', 'offset', 'layers', 'rulers', 'grid', 'object-op', 'export', 'all-finishes', 'all-shapes', 'manual-bridges-toggle']),
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
