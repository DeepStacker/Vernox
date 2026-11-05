/**
 * Unit tests for Image-to-Vector Pipeline
 * Validates Otsu binarization, contour tracing, RDP, and Bezier curve fitting
 */

import { describe, it, expect } from 'vitest';
import { 
  computeOtsuThreshold, 
  rgbaToGrayscale, 
  traceContours, 
  rdpSimplify, 
  fitCurveToBeziers,
  traceImageToVector, 
  type ImageBitmapData 
} from '../imageTracer';

describe('Image-to-Vector Pipeline', () => {
  it('computes Otsu optimal threshold for bimodal distribution', () => {
    // 50 dark pixels (intensity 20) and 50 light pixels (intensity 220)
    const gray = new Uint8Array(100);
    for (let i = 0; i < 50; i++) gray[i] = 20;
    for (let i = 50; i < 100; i++) gray[i] = 220;

    const threshold = computeOtsuThreshold(gray);
    // Ideal threshold splits between 20 and 220
    expect(threshold).toBeGreaterThanOrEqual(20);
    expect(threshold).toBeLessThanOrEqual(220);
  });

  it('converts RGBA bitmap to 8-bit grayscale respecting transparency', () => {
    // 2x2 image: Red, Green, Blue, Transparent
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,   // Red -> Y ~ 76
      0, 255, 0, 255,   // Green -> Y ~ 150
      0, 0, 255, 255,   // Blue -> Y ~ 29
      0, 0, 0, 0        // Transparent -> 255 (background)
    ]);
    // Auto-contrast is disabled here to assert the raw BT.601 luma weights.
    const gray = rgbaToGrayscale({ data: rgba, width: 2, height: 2 }, false);
    expect(gray.length).toBe(4);
    expect(gray[0]).toBeCloseTo(76, 0);
    expect(gray[1]).toBeCloseTo(150, 0);
    expect(gray[2]).toBeCloseTo(29, 0);
    expect(gray[3]).toBe(255); // Background
  });

  it('traces closed loop contour of a solid rectangle', () => {
    // 30x30 image with a 10x10 solid rectangle in the center
    const width = 30;
    const height = 30;
    const binary = new Uint8Array(width * height);

    for (let y = 10; y < 20; y++) {
      for (let x = 10; x < 20; x++) {
        binary[y * width + x] = 1; // Foreground
      }
    }

    const contours = traceContours(binary, width, height);
    expect(contours.length).toBe(1);
    const loop = contours[0];
    expect(loop.length).toBeGreaterThan(6);

    // Verify all points lie within the bounding rectangle [10..20, 10..20]
    for (const pt of loop) {
      expect(pt.x).toBeGreaterThanOrEqual(9);
      expect(pt.x).toBeLessThanOrEqual(21);
      expect(pt.y).toBeGreaterThanOrEqual(9);
      expect(pt.y).toBeLessThanOrEqual(21);
    }
  });

  it('simplifies vertices using Ramer-Douglas-Peucker', () => {
    // Line segment with intermediate collinear noise
    const pts = [
      { x: 0, y: 0 },
      { x: 2, y: 0.1 },
      { x: 5, y: 0.05 },
      { x: 8, y: -0.05 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    ];
    const simplified = rdpSimplify(pts, 0.5);
    // Should eliminate intermediate points along (0,0) -> (10,0)
    expect(simplified.length).toBeLessThan(pts.length);
    expect(simplified[0]).toEqual({ x: 0, y: 0 });
    expect(simplified[simplified.length - 1]).toEqual({ x: 10, y: 10 });
  });

  it('preserves crisp straight lines for sharp corners and fits Beziers for curves', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 50 }
    ];
    const squarePath = fitCurveToBeziers(square);
    expect(squarePath).toMatch(/^M \d+ \d+/);
    expect(squarePath).toContain('L ');
    expect(squarePath).toMatch(/Z$/);

    // Smooth arc should use Beziers
    const circlePts = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI * 2) / 16;
      circlePts.push({ x: 50 + Math.cos(angle) * 30, y: 50 + Math.sin(angle) * 30 });
    }
    const arcPath = fitCurveToBeziers(circlePts);
    expect(arcPath).toContain('C ');
  });

  it('end-to-end traces a synthetic logo image to vector path', () => {
    // 40x40 image with dark circle in center
    const width = 40;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill background with white (255)
    data.fill(255);

    // Draw dark disk in center: radius 10 at (20, 20)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dist = Math.hypot(x - 20, y - 20);
        if (dist <= 10) {
          const idx = (y * width + x) * 4;
          data[idx] = 20;     // R
          data[idx + 1] = 20; // G
          data[idx + 2] = 20; // B
          data[idx + 3] = 255;// A
        }
      }
    }

    const result = traceImageToVector({ data, width, height }, { targetWidthMm: 100 });
    expect(result.pathData).toBeTruthy();
    expect(result.pathData.startsWith('M')).toBe(true);
    expect(result.contours.length).toBeGreaterThan(0);
    expect(result.boundsMm.widthMm).toBeCloseTo(100, 0);
  });
});
