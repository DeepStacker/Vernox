/** Trace settings and result shape — dependency-free so UI code can import them without the tracer. */

export interface TraceOptions {
  /** 0–255, pixels at or below are ink; null = automatic (Otsu). */
  threshold: number | null;
  /** 0 (crisp corners) … 1 (smooth curves). */
  smoothing: number;
  /** Specks smaller than this many pixels (area) are removed. */
  despeckle: number;
  invert: boolean;
}

export const DEFAULT_TRACE_OPTIONS: TraceOptions = { threshold: null, smoothing: 0.5, despeckle: 16, invert: false };

export interface TraceResult {
  /** Outline in source pixels. */
  d: string;
  width: number;
  height: number;
  /** Bounds of the traced artwork in pixels (null when nothing was found). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  threshold: number;
}
