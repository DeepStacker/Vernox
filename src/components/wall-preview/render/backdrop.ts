import { estimateLightFromPixels, lightFromEstimate } from '@/lib/wallPreview/lighting';
import type { LightConfig } from '@/lib/wallPreview/types';

export interface Backdrop {
  /** Pixel-accurate bitmap the compositor draws from. */
  source: HTMLCanvasElement;
  width: number;
  height: number;
}

const MAX_PHOTO_EDGE = 1600;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function toBackdrop(image: CanvasImageSource, w: number, h: number, maxEdge: number): Backdrop {
  const k = Math.min(1, maxEdge / Math.max(w, h));
  const source = document.createElement('canvas');
  source.width = Math.round(w * k);
  source.height = Math.round(h * k);
  // Read back later (patch sampling, light estimate), so ask for a CPU-backed canvas up front.
  source.getContext('2d', { willReadFrequently: true })!.drawImage(image, 0, 0, source.width, source.height);
  return { source, width: source.width, height: source.height };
}

export async function backdropFromUrl(src: string): Promise<Backdrop> {
  const img = await loadImage(src);
  return toBackdrop(img, img.naturalWidth, img.naturalHeight, 4000);
}

/**
 * Decodes a customer's photo entirely in the browser and downsizes it. `createImageBitmap` honours EXIF
 * orientation and decodes off the main thread; the fallback uses an object URL that is revoked immediately.
 */
export async function backdropFromFile(file: File): Promise<Backdrop> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      try {
        return toBackdrop(bitmap, bitmap.width, bitmap.height, MAX_PHOTO_EDGE);
      } finally {
        bitmap.close();
      }
    } catch {
      // Fall through to the <img> decoder (older Safari rejects some options).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return toBackdrop(img, img.naturalWidth, img.naturalHeight, MAX_PHOTO_EDGE);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Light estimate from a 48 px copy of the backdrop. */
export function estimateBackdropLight(backdrop: Backdrop): LightConfig {
  const w = 48, h = Math.max(1, Math.round((48 * backdrop.height) / backdrop.width));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(backdrop.source, 0, 0, w, h);
  return lightFromEstimate(estimateLightFromPixels(ctx.getImageData(0, 0, w, h).data, w, h));
}

export interface Patch {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
}

function smooth(values: number[][], radius: number): number[][] {
  return values.map((_, i) => {
    const out = [0, 0, 0];
    let n = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(values.length - 1, i + radius); k++) {
      for (let c = 0; c < 3; c++) out[c] += values[k][c];
      n++;
    }
    return out.map(v => v / n);
  });
}

/**
 * Paints over the photo's own artwork: the rectangle is filled from the wall colour sampled just outside each of
 * its four edges (blended across), with faint plaster noise and a soft fringe so no hard edge shows.
 */
export function makePatch(backdrop: Backdrop, area: { x: number; y: number; w: number; h: number }): Patch {
  // Grow the zone so the soft fringe starts outside the artwork's frame, which would otherwise show through it.
  const grow = 14;
  const x = Math.max(12, area.x - grow), y = Math.max(12, area.y - grow);
  const w = Math.min(backdrop.width - 12, area.x + area.w + grow) - x;
  const h = Math.min(backdrop.height - 12, area.y + area.h + grow) - y;
  const ctx = backdrop.source.getContext('2d', { willReadFrequently: true })!;
  const strip = (sx: number, sy: number, sw: number, sh: number) => ctx.getImageData(sx, sy, sw, sh).data;
  const off = 8;
  const top = strip(x, y - off - 3, w, 3), bottom = strip(x, y + h + off, w, 3);
  const left = strip(x - off - 3, y, 3, h), right = strip(x + w + off, y, 3, h);
  const avg = (data: Uint8ClampedArray, index: (i: number) => number[], count: number) => {
    const out: number[][] = [];
    for (let i = 0; i < count; i++) {
      const acc = [0, 0, 0];
      for (const p of index(i)) for (let c = 0; c < 3; c++) acc[c] += data[p + c];
      out.push(acc.map(v => v / 3));
    }
    return out;
  };
  const R = 14;
  const tp = smooth(avg(top, i => [i * 4, (w + i) * 4, (2 * w + i) * 4], w), R);
  const bt = smooth(avg(bottom, i => [i * 4, (w + i) * 4, (2 * w + i) * 4], w), R);
  const lf = smooth(avg(left, i => [i * 12, i * 12 + 4, i * 12 + 8], h), R);
  const rt = smooth(avg(right, i => [i * 12, i * 12 + 4, i * 12 + 8], h), R);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const pctx = canvas.getContext('2d')!;
  const img = pctx.createImageData(w, h);
  const fringe = Math.max(14, Math.min(w, h) * 0.1);
  let seed = 12345;
  for (let j = 0; j < h; j++) {
    const v = j / (h - 1);
    for (let i = 0; i < w; i++) {
      const u = i / (w - 1);
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = ((seed >>> 24) / 255 - 0.5) * 4;
      const p = (j * w + i) * 4;
      for (let c = 0; c < 3; c++) {
        const vertical = tp[i][c] * (1 - v) + bt[i][c] * v;
        const horizontal = lf[j][c] * (1 - u) + rt[j][c] * u;
        img.data[p + c] = Math.max(0, Math.min(255, (vertical + horizontal) / 2 + noise));
      }
      img.data[p + 3] = Math.round(255 * Math.min(1, Math.min(i, j, w - 1 - i, h - 1 - j) / fringe));
    }
  }
  pctx.putImageData(img, 0, 0);
  return { canvas, x, y };
}
