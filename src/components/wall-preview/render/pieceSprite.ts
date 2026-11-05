import { materialForFinish } from '@/lib/wallPreview/materials';
import type { LightConfig, Outline } from '@/lib/wallPreview/types';

/** A flat, un-warped bitmap of the piece in wall space: `pxPerCm` pixels per cm, `padCm` of margin on every side. */
export interface Sprite {
  canvas: HTMLCanvasElement;
  pxPerCm: number;
  padCm: number;
  widthCm: number;
  heightCm: number;
}

const MAX_SPRITES = 14;
const cache = new Map<string, Sprite>();

function remember(key: string, build: () => Sprite): Sprite {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const sprite = build();
  cache.set(key, sprite);
  if (cache.size > MAX_SPRITES) cache.delete(cache.keys().next().value as string);
  return sprite;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Sprite resolution: sharp enough for a full-width piece on a phone, bounded so memory stays small. */
function resolution(widthCm: number, heightCm: number): number {
  return Math.max(1.5, Math.min(8, 1400 / Math.max(widthCm, heightCm)));
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grain: HTMLCanvasElement | null = null;
/** Fine horizontal streaks for brushed finishes; deterministic so the look never shimmers between renders. */
function brushedGrain(): HTMLCanvasElement {
  if (grain) return grain;
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d')!;
  const rand = mulberry32(7);
  for (let y = 0; y < 256; y++) {
    const v = rand();
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.9})` : `rgba(0,0,0,${(0.5 - v) * 0.8})`;
    g.fillRect(0, y, 256, 1);
  }
  grain = c;
  return c;
}

const lightKey = (l: LightConfig) => `${l.fromX.toFixed(2)},${l.fromY.toFixed(2)},${l.colour},${l.ambient},${l.ambientStrength.toFixed(2)}`;
const outlineKey = (o: Outline) => `${o.widthMm}x${o.heightMm}:${o.svgPath}`;

/** The metal piece itself: finish gradient, grain or sheen, bevel highlight on the lit edge, room tint. */
export function createPieceSprite(outline: Outline, finish: string, light: LightConfig): Sprite {
  return remember(`p|${outlineKey(outline)}|${finish}|${lightKey(light)}`, () => {
    const material = materialForFinish(finish);
    const widthCm = outline.widthMm / 10, heightCm = outline.heightMm / 10;
    const r = resolution(widthCm, heightCm);
    const padCm = 1;
    const canvas = makeCanvas((widthCm + padCm * 2) * r, (heightCm + padCm * 2) * r);
    const ctx = canvas.getContext('2d')!;
    const path = new Path2D(outline.svgPath);
    const len = Math.hypot(light.fromX, light.fromY) || 1;
    const lx = light.fromX / len, ly = light.fromY / len;

    ctx.save();
    ctx.translate(padCm * r, padCm * r);
    ctx.scale(r / 10, r / 10); // path units are mm

    // Sheet thickness seen as a dark rim on the side away from the light.
    ctx.save();
    ctx.translate(-lx * 2, -ly * 2);
    ctx.fillStyle = material.stops[3];
    ctx.fill(path);
    ctx.restore();

    // Gradient runs from the lit corner to the shaded one.
    const w = outline.widthMm, h = outline.heightMm;
    const gx = (w / 2) * (1 + lx), gy = (h / 2) * (1 + ly);
    const grad = ctx.createLinearGradient(gx, gy, w - gx, h - gy);
    material.stops.forEach((c, i) => grad.addColorStop(i / 3, c));
    ctx.fillStyle = grad;
    ctx.fill(path);
    ctx.restore();

    // Everything below only paints over existing metal pixels.
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    if (material.brushed) {
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = ctx.createPattern(brushedGrain(), 'repeat')!;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (material.sheen > 0) {
      const sheen = ctx.createLinearGradient(0, 0, canvas.width * (0.5 + lx * 0.5), canvas.height * (0.5 + ly * 0.5) + 1);
      sheen.addColorStop(0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.42, `rgba(255,255,255,${material.sheen * 0.32})`);
      sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();

    // Bevel: a thin stroke, bright on the lit side and dark opposite, clipped to the metal by source-atop.
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.translate(padCm * r, padCm * r);
    ctx.scale(r / 10, r / 10);
    const edge = ctx.createLinearGradient(gx, gy, w - gx, h - gy);
    edge.addColorStop(0, material.edge);
    edge.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    edge.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.strokeStyle = edge;
    ctx.lineWidth = 3.2;
    ctx.stroke(path);
    ctx.restore();

    // Subtle room tint: warm rooms warm the metal slightly.
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = light.ambientStrength;
    ctx.fillStyle = light.ambient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    return { canvas, pxPerCm: r, padCm, widthCm, heightCm };
  });
}

/**
 * A blurred black silhouette used for cast and contact shadows. Blur uses `shadowBlur` on an off-canvas copy
 * of the shape, which works in every browser (canvas `filter` is not available in Safari).
 */
export function createShadowSprite(outline: Outline, blurCm: number): Sprite {
  const blur = Math.round(blurCm * 10) / 10;
  return remember(`s|${outlineKey(outline)}|${blur}`, () => {
    const widthCm = outline.widthMm / 10, heightCm = outline.heightMm / 10;
    const r = Math.min(resolution(widthCm, heightCm), 4);
    const padCm = Math.ceil(blur * 2.5) + 1;
    const canvas = makeCanvas((widthCm + padCm * 2) * r, (heightCm + padCm * 2) * r);
    const ctx = canvas.getContext('2d')!;
    const FAR = 20000;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = blur * r * 2;
    ctx.shadowOffsetX = FAR;
    ctx.translate(padCm * r - FAR, padCm * r);
    ctx.scale(r / 10, r / 10);
    ctx.fill(new Path2D(outline.svgPath));
    return { canvas, pxPerCm: r, padCm, widthCm, heightCm };
  });
}
