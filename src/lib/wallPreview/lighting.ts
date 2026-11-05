import type { LightConfig } from './types';

export interface LightEstimate {
  /** Mean luminance 0..1. */
  luminance: number;
  /** Red/blue balance: -1 cool, 0 neutral, +1 warm. */
  warmth: number;
  /** -1 (brighter on the left) to +1 (brighter on the right). */
  sideBias: number;
}

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Estimates the room's light from RGBA pixels (a small downscaled copy is plenty). Pure so it can be unit-tested. */
export function estimateLightFromPixels(data: ArrayLike<number>, width: number, height: number): LightEstimate {
  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  let left = 0, right = 0, leftN = 0, rightN = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      sumR += r; sumG += g; sumB += b; count++;
      if (x < width / 2) { left += lum; leftN++; } else { right += lum; rightN++; }
    }
  }
  if (count === 0) return { luminance: 0.6, warmth: 0, sideBias: 0 };
  const r = sumR / count, g = sumG / count, b = sumB / count;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const warmth = Math.max(-1, Math.min(1, (r - b) / 80));
  const l = left / Math.max(1, leftN), rr = right / Math.max(1, rightN);
  const sideBias = Math.max(-1, Math.min(1, (rr - l) / Math.max(0.05, l + rr) * 4));
  return { luminance, warmth, sideBias };
}

/** Turns an estimate into the same light description scenes use. Dim rooms get softer, weaker ambient tint. */
export function lightFromEstimate(e: LightEstimate): LightConfig {
  const warm = e.warmth;
  return {
    fromX: e.sideBias === 0 ? -0.3 : e.sideBias,
    fromY: -0.45,
    softness: 0.55 + (1 - e.luminance) * 0.3,
    colour: toHex(255, 250 - Math.max(0, -warm) * 10 - warm * 8, 245 - warm * 40 + Math.max(0, -warm) * 10),
    ambient: toHex(235 + warm * 15, 228, 215 - warm * 40),
    ambientStrength: 0.06 + (1 - e.luminance) * 0.14,
  };
}
