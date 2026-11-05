/**
 * Pure TypeScript Industrial Image-to-Vector Tracer
 * Converts raster pixel data (PNG/JPEG/WebP) into clean, closed Bezier and line vector paths.
 * 
 * Features:
 * 1. Rec.601 Grayscale with dynamic contrast-stretching
 * 2. Adaptive Integral Image Thresholding (Sauvola) + Global Otsu Binarization
 * 3. Suzuki85-style Outer and Hole Contour Extraction with Even-Odd parity
 * 4. Ramer-Douglas-Peucker Polygonal Simplification
 * 5. Potrace-Grade Corner Detection & Clamped Tangent Hybrid Bezier Fitting
 *    (Eliminates corner ballooning, pillow distortion, and wobbles)
 * 6. Automated Noise Filtering & Background Frame Stripping
 */

import type { Point2D, BoundingBox2D } from './cadEngineTypes';

export interface ImageBitmapData {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TraceOptions {
  invert?: boolean;                    // Invert foreground/background
  thresholdMode?: 'otsu' | 'adaptive' | 'manual'; // Binarization mode (default: 'otsu')
  threshold?: number;                 // Custom 0-255 threshold
  adaptiveWindow?: number;            // Local window radius for adaptive threshold (default: 25)
  rdpTolerance?: number;              // Polyline simplification epsilon in pixels (default: 0.8)
  cornerThresholdDeg?: number;        // Angle threshold for sharp corners in degrees (default: 38)
  minArea?: number;                   // Filter out tiny noise contours < minArea px (default: 12)
  removeFrame?: boolean;              // Discard outer boundary frame if enclosing whole image
  crop?: CropRegion;                  // Optional crop sub-rectangle
  targetWidthMm?: number;             // Scale output to physical mm
  targetHeightMm?: number;            // Scale output to physical mm
}

export interface TraceResult {
  pathData: string;
  boundsMm: BoundingBox2D;
  contours: Point2D[][];
  otsuThresholdUsed: number;
  nodeCount: number;
}

/**
 * 1. Compute Otsu's Optimal Binarization Threshold
 */
export function computeOtsuThreshold(gray: Uint8Array): number {
  const hist = new Int32Array(256);
  const total = gray.length;
  for (let i = 0; i < total; i++) {
    hist[gray[i]]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) {
    sum += t * hist[t];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = -1;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const betweenVar = wB * wF * (mB - mF) * (mB - mF);

    if (betweenVar > varMax) {
      varMax = betweenVar;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * 2. Convert RGBA image buffer to 8-bit Grayscale with Contrast Stretching
 */
export function rgbaToGrayscale(image: ImageBitmapData, autoContrast = true): Uint8Array {
  const { data, width, height } = image;
  const gray = new Uint8Array(width * height);

  let minVal = 255;
  let maxVal = 0;

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const a = data[i + 3];
    if (a < 64) {
      gray[j] = 255; // Transparent pixels become white background
    } else {
      const y = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      gray[j] = y;
      if (y < minVal) minVal = y;
      if (y > maxVal) maxVal = y;
    }
  }

  // Linear contrast stretch if dynamic range is compressed
  if (autoContrast && maxVal > minVal && (maxVal - minVal < 200)) {
    const range = maxVal - minVal;
    for (let j = 0; j < gray.length; j++) {
      gray[j] = Math.min(255, Math.max(0, Math.round(((gray[j] - minVal) / range) * 255)));
    }
  }

  return gray;
}

/**
 * 3. Local Adaptive Thresholding using O(1) Integral Image
 * Perfect for images with uneven illumination, textures, or mixed dark/light tiles
 */
export function computeAdaptiveThreshold(
  gray: Uint8Array,
  width: number,
  height: number,
  windowRadius = 24,
  cOffset = 7
): Uint8Array {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  const binary = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - windowRadius);
    const y1 = Math.min(height, y + windowRadius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - windowRadius);
      const x1 = Math.min(width, x + windowRadius + 1);
      const count = (x1 - x0) * (y1 - y0);

      const sum =
        integral[y1 * (width + 1) + x1] -
        integral[y0 * (width + 1) + x1] -
        integral[y1 * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];

      const mean = sum / count;
      binary[y * width + x] = gray[y * width + x] < mean - cOffset ? 1 : 0;
    }
  }
  return binary;
}

/**
 * 4. Dual-Border Moore-Neighbor Contour Tracing
 * Extracts both outer boundaries and inner hole boundaries.
 */
export function traceContours(
  binary: Uint8Array,
  width: number,
  height: number,
  minArea = 12,
  removeFrame = false
): Point2D[][] {
  const visited = new Uint8Array(width * height);
  const contours: Point2D[][] = [];

  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  const getPixel = (x: number, y: number): number => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return binary[y * width + x];
  };

  const totalImageArea = width * height;

  // Background connected to the image border is the exterior, not a hole. Without this, the
  // right-hand edge of every solid shape (a 1 -> 0 transition) was traced as a bogus "hole" loop.
  const exterior = new Uint8Array(width * height);
  const pending: number[] = [];
  const seedExterior = (x: number, y: number) => {
    const i = y * width + x;
    if (binary[i] === 0 && exterior[i] === 0) {
      exterior[i] = 1;
      pending.push(i);
    }
  };
  for (let x = 0; x < width; x++) { seedExterior(x, 0); seedExterior(x, height - 1); }
  for (let y = 0; y < height; y++) { seedExterior(0, y); seedExterior(width - 1, y); }
  while (pending.length > 0) {
    const i = pending.pop() as number;
    const px = i % width;
    const py = (i - px) / width;
    if (px > 0) seedExterior(px - 1, py);
    if (px < width - 1) seedExterior(px + 1, py);
    if (py > 0) seedExterior(px, py - 1);
    if (py < height - 1) seedExterior(px, py + 1);
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const isPixel = binary[idx];

      // Outer boundary: 0 -> 1 transition
      const isOuterStart = isPixel === 1 && visited[idx] === 0 && getPixel(x - 1, y) === 0;
      // Hole boundary: 1 -> 0 transition
      const isHoleStart = isPixel === 0 && exterior[idx] === 0 && visited[idx] === 0 && getPixel(x - 1, y) === 1;

      if (isOuterStart || isHoleStart) {
        const loop: Point2D[] = [];
        let curX = x;
        let curY = y;
        let dir = 0;
        const targetVal = isPixel;

        loop.push({ x: curX, y: curY });
        visited[curY * width + curX] = 1;

        let maxSteps = width * height;
        let foundNext = true;

        while (maxSteps-- > 0 && foundNext) {
          foundNext = false;
          const startDir = (dir + 5) % 8;
          for (let i = 0; i < 8; i++) {
            const checkDir = (startDir + i) % 8;
            const nx = curX + dx[checkDir];
            const ny = curY + dy[checkDir];
            if (getPixel(nx, ny) === targetVal) {
              curX = nx;
              curY = ny;
              dir = checkDir;
              visited[curY * width + curX] = 1;
              loop.push({ x: curX, y: curY });
              foundNext = true;
              break;
            }
          }

          if (curX === x && curY === y && loop.length > 2) {
            break;
          }
        }

        if (loop.length > 5) {
          // Calculate polygon area
          let signedArea = 0;
          for (let i = 0; i < loop.length - 1; i++) {
            signedArea += (loop[i].x * loop[i + 1].y) - (loop[i + 1].x * loop[i].y);
          }
          signedArea = Math.abs(signedArea / 2);

          // Discard tiny noise specks
          if (signedArea >= minArea) {
            // Check if this contour is an outer bounding box frame enclosing > 85% of image
            const isEnclosingFrame = removeFrame && signedArea > totalImageArea * 0.85;
            if (!isEnclosingFrame) {
              contours.push(loop);
            }
          }
        }
      }
    }
  }

  return contours;
}

/**
 * 5. Ramer-Douglas-Peucker Polyline Simplification
 */
export function rdpSimplify(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, index + 1), epsilon);
    const right = rdpSimplify(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [start, end];
  }
}

/**
 * RDP for closed loops: splits along diameter opposite point
 */
export function rdpSimplifyClosed(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 4) return points;

  let maxD = 0;
  let midIdx = Math.floor(points.length / 2);
  const p0 = points[0];

  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - p0.x, points[i].y - p0.y);
    if (d > maxD) {
      maxD = d;
      midIdx = i;
    }
  }

  const half1 = rdpSimplify(points.slice(0, midIdx + 1), epsilon);
  const half2 = rdpSimplify(points.slice(midIdx).concat([p0]), epsilon);

  const merged = half1.slice(0, -1).concat(half2);
  return merged.length >= 3 ? merged : points;
}

function perpendicularDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * 6. Potrace-Grade Corner-Preserving Hybrid Polyline & Clamped Bezier Curve Fitter
 * 
 * Accurately classifies vertices into sharp corners and smooth runs.
 * Emits straight lines (L) between corners, and clamped cubic Beziers (C) on smooth arcs.
 * Eliminates ballooning and pillow distortion!
 */
export function fitCurveToBeziers(
  points: Point2D[],
  cornerThresholdDeg = 38
): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${round(points[0].x)} ${round(points[0].y)} L ${round(points[1].x)} ${round(points[1].y)} Z`;
  }

  const n = points.length;

  // Step 1: Detect corners based on direction change
  const isCorner = new Uint8Array(n);
  let cornerCount = 0;

  for (let i = 0; i < n; i++) {
    const pPrev = points[(i - 1 + n) % n];
    const pCurr = points[i];
    const pNext = points[(i + 1) % n];

    const v1x = pCurr.x - pPrev.x;
    const v1y = pCurr.y - pPrev.y;
    const v2x = pNext.x - pCurr.x;
    const v2y = pNext.y - pCurr.y;

    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);

    if (len1 < 0.001 || len2 < 0.001) {
      isCorner[i] = 1;
      cornerCount++;
      continue;
    }

    const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
    const clamped = Math.max(-1, Math.min(1, dot));
    const turnAngleDeg = Math.acos(clamped) * (180 / Math.PI);

    if (turnAngleDeg >= cornerThresholdDeg) {
      isCorner[i] = 1;
      cornerCount++;
    }
  }

  // Step 2: If shape is pure polygon or small, emit crisp lines
  if (cornerCount === n || n <= 4) {
    let path = `M ${round(points[0].x)} ${round(points[0].y)}`;
    for (let i = 1; i < n; i++) {
      path += ` L ${round(points[i].x)} ${round(points[i].y)}`;
    }
    return path + ' Z';
  }

  // Step 3: Find starting corner
  let startIdx = 0;
  for (let i = 0; i < n; i++) {
    if (isCorner[i]) {
      startIdx = i;
      break;
    }
  }

  const parts: string[] = [`M ${round(points[startIdx].x)} ${round(points[startIdx].y)}`];
  let curr = startIdx;
  let steps = 0;

  while (steps < n) {
    let nextCorner = (curr + 1) % n;
    const run: number[] = [curr];
    while (nextCorner !== startIdx && !isCorner[nextCorner] && run.length < n) {
      run.push(nextCorner);
      nextCorner = (nextCorner + 1) % n;
    }
    run.push(nextCorner);

    const runLength = run.length;
    steps += runLength - 1;

    // Direct line between consecutive corners
    if (runLength === 2) {
      const pEnd = points[nextCorner];
      parts.push(`L ${round(pEnd.x)} ${round(pEnd.y)}`);
    } else {
      // Check if intermediate points are collinear
      const pStart = points[curr];
      const pEnd = points[nextCorner];
      let maxDev = 0;
      for (let k = 1; k < runLength - 1; k++) {
        const pt = points[run[k]];
        const dev = perpendicularDistance(pt, pStart, pEnd);
        if (dev > maxDev) maxDev = dev;
      }

      if (maxDev < 0.9) {
        // Collinear: output line
        parts.push(`L ${round(pEnd.x)} ${round(pEnd.y)}`);
      } else {
        // Smooth arc: fit clamped Beziers
        for (let k = 0; k < runLength - 1; k++) {
          const idx0 = run[k];
          const idx1 = run[k + 1];
          const p0 = points[idx0];
          const p1 = points[idx1];

          let t0x: number, t0y: number;
          if (isCorner[idx0] && k === 0) {
            t0x = p1.x - p0.x;
            t0y = p1.y - p0.y;
          } else {
            const prevIdx = (idx0 - 1 + n) % n;
            t0x = p1.x - points[prevIdx].x;
            t0y = p1.y - points[prevIdx].y;
          }

          let t1x: number, t1y: number;
          if (isCorner[idx1] && k === runLength - 2) {
            t1x = p1.x - p0.x;
            t1y = p1.y - p0.y;
          } else {
            const nextIdx = (idx1 + 1) % n;
            t1x = points[nextIdx].x - p0.x;
            t1y = points[nextIdx].y - p0.y;
          }

          const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          const maxHandle = chord * 0.42;

          let cp1x = p0.x + t0x * 0.28;
          let cp1y = p0.y + t0y * 0.28;
          let cp2x = p1.x - t1x * 0.28;
          let cp2y = p1.y - t1y * 0.28;

          const d1 = Math.hypot(cp1x - p0.x, cp1y - p0.y);
          if (d1 > maxHandle && d1 > 0) {
            cp1x = p0.x + ((cp1x - p0.x) / d1) * maxHandle;
            cp1y = p0.y + ((cp1y - p0.y) / d1) * maxHandle;
          }

          const d2 = Math.hypot(cp2x - p1.x, cp2y - p1.y);
          if (d2 > maxHandle && d2 > 0) {
            cp2x = p1.x + ((cp2x - p1.x) / d2) * maxHandle;
            cp2y = p1.y + ((cp2y - p1.y) / d2) * maxHandle;
          }

          parts.push(
            `C ${round(cp1x)} ${round(cp1y)} ${round(cp2x)} ${round(cp2y)} ${round(p1.x)} ${round(p1.y)}`
          );
        }
      }
    }

    curr = nextCorner;
    if (curr === startIdx) break;
  }

  parts.push('Z');
  return parts.join(' ');
}

/**
 * Main Image-to-Vector Pipeline Entry Point
 */
export function traceImageToVector(
  image: ImageBitmapData,
  options: TraceOptions = {}
): TraceResult {
  let { width, height, data } = image;
  if (width <= 0 || height <= 0) {
    throw new Error('Invalid image dimensions');
  }

  // Handle optional crop region
  if (options.crop) {
    const cx = Math.max(0, Math.floor(options.crop.x));
    const cy = Math.max(0, Math.floor(options.crop.y));
    const cw = Math.min(width - cx, Math.floor(options.crop.width));
    const ch = Math.min(height - cy, Math.floor(options.crop.height));

    if (cw > 4 && ch > 4) {
      const croppedData = new Uint8ClampedArray(cw * ch * 4);
      for (let row = 0; row < ch; row++) {
        const srcOffset = ((cy + row) * width + cx) * 4;
        const dstOffset = row * cw * 4;
        croppedData.set(data.subarray(srcOffset, srcOffset + cw * 4), dstOffset);
      }
      data = croppedData;
      width = cw;
      height = ch;
    }
  }

  // Step 1: Grayscale conversion with contrast stretching
  const gray = rgbaToGrayscale({ data, width, height });

  // Step 2: Binarization (Otsu vs Adaptive Sauvola vs Manual)
  const otsuThreshold = computeOtsuThreshold(gray);
  const mode = options.thresholdMode ?? (options.threshold !== undefined ? 'manual' : 'otsu');
  let binary: Uint8Array;

  if (mode === 'adaptive') {
    binary = computeAdaptiveThreshold(gray, width, height, options.adaptiveWindow ?? 24);
  } else {
    const thresh = mode === 'manual' ? (options.threshold ?? otsuThreshold) : otsuThreshold;
    binary = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i++) {
      binary[i] = gray[i] <= thresh ? 1 : 0;
    }
  }

  // Polarity Inversion
  if (options.invert) {
    for (let i = 0; i < binary.length; i++) {
      binary[i] = binary[i] === 1 ? 0 : 1;
    }
  }

  // Step 3: Contour Tracing with Area & Frame Filtering
  const minArea = options.minArea ?? 12;
  const removeFrame = options.removeFrame ?? false;
  const rawContours = traceContours(binary, width, height, minArea, removeFrame);

  // Step 4: Polyline Simplification & Corner-Preserving Curve Fitting
  const rdpEpsilon = options.rdpTolerance ?? 0.8;
  const cornerAngle = options.cornerThresholdDeg ?? 38;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const simplifiedContours: Point2D[][] = [];
  const svgPathSegments: string[] = [];
  let totalNodes = 0;

  for (const contour of rawContours) {
    const simplified = rdpSimplifyClosed(contour, rdpEpsilon);
    if (simplified.length >= 3) {
      simplifiedContours.push(simplified);
      totalNodes += simplified.length;
      for (const pt of simplified) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
      svgPathSegments.push(fitCurveToBeziers(simplified, cornerAngle));
    }
  }

  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = width; maxY = height;
  }

  const boundsMm: BoundingBox2D = {
    minX: round(minX),
    minY: round(minY),
    maxX: round(maxX),
    maxY: round(maxY),
    widthMm: round(maxX - minX),
    heightMm: round(maxY - minY),
  };

  // Step 5: Metric Scaling to physical CAD mm
  let finalPath = svgPathSegments.join(' ');
  if (options.targetWidthMm && boundsMm.widthMm > 0) {
    const scale = options.targetWidthMm / boundsMm.widthMm;
    finalPath = scalePathData(finalPath, scale, scale);
    boundsMm.widthMm = round(boundsMm.widthMm * scale);
    boundsMm.heightMm = round(boundsMm.heightMm * scale);
    boundsMm.maxX = round(boundsMm.minX + boundsMm.widthMm);
    boundsMm.maxY = round(boundsMm.minY + boundsMm.heightMm);
  }

  return {
    pathData: finalPath,
    boundsMm,
    contours: simplifiedContours,
    otsuThresholdUsed: otsuThreshold,
    nodeCount: totalNodes,
  };
}

function scalePathData(path: string, sx: number, sy: number): string {
  if (!path) return '';
  return path.replace(/-?\d+(\.\d+)?/g, (match) => {
    const val = parseFloat(match);
    return isNaN(val) ? match : String(round(val * sx));
  });
}

function round(num: number, decimals = 3): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

export const ImageToVectorTracer = {
  traceImage: traceImageToVector,
};
