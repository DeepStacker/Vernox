/**
 * Image → cut outline. Pure and synchronous: runs inside the trace worker (and in tests).
 *
 *  1. luminance (transparent pixels count as background), threshold (Otsu when "auto"), invert
 *  2. vectorise the binary bitmap with imagetracerjs (2-colour palette, no blur)
 *  3. clean up with Clipper: even-odd region, drop specks below the despeckle area, simplify
 */
import ImageTracer, { type ImageDataLike, type TracePath } from 'imagetracerjs';
import { normaliseEvenOdd, pieces, simplify } from '../geometry/clipper';
import { ringArea, ringsBounds, ringsToPathData, type Ring, type Rings } from '../geometry/path';
import { DEFAULT_TRACE_OPTIONS, type TraceOptions, type TraceResult } from './options';

function luminance(img: ImageDataLike): Uint8Array {
  const { data, width, height } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    const a = data[i + 3] / 255;
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    out[p] = Math.round(l * a + 255 * (1 - a));
  }
  return out;
}

export function otsuThreshold(lum: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of lum) hist[v]++;
  const total = lum.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

function pathToRing(path: TracePath): Ring {
  const ring: Ring = [];
  for (const s of path.segments) {
    if (s.type === 'L') ring.push({ x: s.x1, y: s.y1 });
    else {
      // Quadratic: sample a few points; Clipper simplification removes redundancy later.
      for (let i = 0; i < 4; i++) {
        const t = i / 4, mt = 1 - t;
        ring.push({
          x: mt * mt * s.x1 + 2 * mt * t * s.x2 + t * t * (s.x3 ?? s.x2),
          y: mt * mt * s.y1 + 2 * mt * t * s.y2 + t * t * (s.y3 ?? s.y2),
        });
      }
    }
  }
  return ring;
}

export function traceImage(img: ImageDataLike, options: TraceOptions = DEFAULT_TRACE_OPTIONS): TraceResult {
  const lum = luminance(img);
  const threshold = options.threshold ?? otsuThreshold(lum);
  const binary = new Uint8ClampedArray(img.width * img.height * 4);
  for (let p = 0; p < lum.length; p++) {
    // Otsu splits into ≤ t and > t, so the threshold value itself is ink.
    let ink = lum[p] <= threshold;
    if (options.invert) ink = !ink;
    const v = ink ? 0 : 255;
    binary[p * 4] = v; binary[p * 4 + 1] = v; binary[p * 4 + 2] = v; binary[p * 4 + 3] = 255;
  }
  const tol = 0.2 + options.smoothing * 2.8;
  const data = ImageTracer.imagedataToTracedata(
    { width: img.width, height: img.height, data: binary },
    {
      pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }],
      numberofcolors: 2,
      colorquantcycles: 1,
      colorsampling: 0,
      ltres: tol,
      qtres: tol,
      pathomit: Math.max(0, Math.round(Math.sqrt(options.despeckle))),
      rightangleenhance: options.smoothing < 0.5,
      blurradius: 0,
      linefilter: true,
      layering: 0,
    },
  );
  const inkLayer = data.palette.findIndex(c => c.r < 128);
  const raw: Rings = (data.layers[inkLayer] ?? []).map(pathToRing).filter(r => r.length > 2);
  const region = normaliseEvenOdd(raw);
  // Remove specks: small islands of ink and small pin-holes in it.
  const kept: Rings = [];
  for (const piece of pieces(region)) {
    if (piece.area < options.despeckle) continue;
    kept.push(piece.outer, ...piece.holes.filter(h => Math.abs(ringArea(h)) >= options.despeckle));
  }
  const cleaned = simplify(normaliseEvenOdd(kept), 0.15 + options.smoothing * 0.6);
  return { d: ringsToPathData(cleaned, true, 1), width: img.width, height: img.height, bounds: ringsBounds(cleaned), threshold };
}

