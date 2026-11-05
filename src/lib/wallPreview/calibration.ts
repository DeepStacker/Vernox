import type { Point, Quad } from './types';
import { wallToImage, type Matrix3 } from './homography';

export interface CalibrationPreset {
  id: string;
  label: string;
  /** Length of the thing the user marks, in cm. `null` means the user types it. */
  lengthCm: number | null;
}

export const CALIBRATION_PRESETS: CalibrationPreset[] = [
  { id: 'a4-long', label: 'A4 sheet (long side)', lengthCm: 29.7 },
  { id: 'switchboard', label: 'Switchboard plate', lengthCm: 8.6 },
  { id: 'door', label: 'Door height', lengthCm: 210 },
  { id: 'custom', label: 'Other length', lengthCm: null },
];

/** Pixels per centimetre from two marked points that are `lengthCm` apart on the wall. Null when unusable. */
export function pxPerCmFromTwoPoints(a: Point, b: Point, lengthCm: number): number | null {
  const px = Math.hypot(b.x - a.x, b.y - a.y);
  if (!Number.isFinite(lengthCm) || lengthCm <= 0 || px < 2) return null;
  return px / lengthCm;
}

/** Pixels per centimetre when the photo shows a wall that is `wallWidthCm` wide edge to edge. */
export function pxPerCmFromWallWidth(imageWidthPx: number, wallWidthCm: number): number | null {
  if (!Number.isFinite(wallWidthCm) || wallWidthCm <= 0 || imageWidthPx <= 0) return null;
  return imageWidthPx / wallWidthCm;
}

/**
 * Real-world area a photo covers once its scale is known, in whole centimetres. Used by My Space to turn
 * "I marked a known object" into wall measurements. Null when the scale or the image size is unusable.
 */
export function wallSizeFromScale(imageWidthPx: number, imageHeightPx: number, pxPerCm: number): { widthCm: number; heightCm: number } | null {
  if (!(pxPerCm > 0) || !(imageWidthPx > 0) || !(imageHeightPx > 0)) return null;
  return { widthCm: Math.round(imageWidthPx / pxPerCm), heightCm: Math.round(imageHeightPx / pxPerCm) };
}

/** Wall-to-image mapping for a front-on photo: pure scale, wall origin at the image's top-left. */
export function scaleOnlyHomography(pxPerCm: number): Matrix3 {
  return [pxPerCm, 0, 0, 0, pxPerCm, 0, 0, 0, 1];
}

/**
 * Wall-to-image mapping for an angled photo: the user taps the four corners of a rectangle they know
 * the size of (a wall, a window frame, a door). Wall coordinates then start at that rectangle's top-left.
 */
export function perspectiveHomography(corners: Quad, widthCm: number, heightCm: number): Matrix3 | null {
  if (!(widthCm > 0) || !(heightCm > 0)) return null;
  return wallToImage(corners, widthCm, heightCm);
}
