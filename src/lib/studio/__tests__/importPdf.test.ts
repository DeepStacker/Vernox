// @vitest-environment node
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { importPdf, PdfImportError } from '../import/importPdf';
import { pathBounds, pathToRings, ringsBounds } from '../geometry/path';

const PT = 25.4 / 72;

async function pdfBytes(draw: (page: ReturnType<PDFDocument['addPage']>, doc: PDFDocument) => Promise<void> | void, size: [number, number] = [400, 300]) {
  const doc = await PDFDocument.create();
  const page = doc.addPage(size);
  await draw(page, doc);
  return doc.save();
}

describe('PDF / Illustrator import', () => {
  it('extracts rectangles and circles in millimetres with the page transform applied', async () => {
    const bytes = await pdfBytes(page => {
      page.drawRectangle({ x: 50, y: 40, width: 100, height: 50, color: rgb(0, 0, 0) });
      page.drawCircle({ x: 300, y: 200, size: 40, color: rgb(0, 0, 0) });
    });
    const v = await importPdf(bytes);
    // Overall extent: x 50 → 340 pt, y 40 → 240 pt (the circle's radius is 40 pt).
    expect(v.widthMm).toBeCloseTo(290 * PT, 1);
    expect(v.heightMm).toBeCloseTo(200 * PT, 1);
    expect((v.d.match(/M/g) ?? []).length).toBe(2);
    const b = pathBounds(v.d)!;
    // Centred on the origin.
    expect((b.minX + b.maxX) / 2).toBeCloseTo(0, 1);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(0, 1);
  });

  it('keeps y pointing down (a shape drawn higher on the page ends up above)', async () => {
    const bytes = await pdfBytes(page => {
      page.drawRectangle({ x: 20, y: 20, width: 100, height: 60, color: rgb(0, 0, 0) });
      page.drawRectangle({ x: 20, y: 220, width: 40, height: 30, color: rgb(0, 0, 0) });
    });
    const rings = pathToRings((await importPdf(bytes)).d, 0.05);
    const [lower, upper] = rings.map(r => ringsBounds([r])!);
    expect(lower.maxX - lower.minX).toBeGreaterThan(upper.maxX - upper.minX);
    expect(upper.maxY).toBeLessThan(lower.minY);
  });

  it('applies nested transforms (scaled content stream)', async () => {
    const bytes = await pdfBytes(page => {
      page.drawRectangle({ x: 0, y: 0, width: 50, height: 20, color: rgb(0, 0, 0) });
      page.drawSvgPath('M 0 0 L 100 0 L 100 40 Z', { x: 200, y: 200, scale: 2, color: rgb(0, 0, 0) });
    });
    const v = await importPdf(bytes);
    // The scaled triangle is 200 x 80 pt, the rectangle sits at the origin: extent from x 0 to 400 pt.
    expect(v.widthMm).toBeCloseTo(400 * PT, 0);
  });

  it('ignores a page-sized background rectangle when there is artwork on it', async () => {
    const bytes = await pdfBytes(page => {
      page.drawRectangle({ x: 0, y: 0, width: 400, height: 300, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: 100, y: 100, width: 80, height: 60, color: rgb(0, 0, 0) });
    });
    const v = await importPdf(bytes);
    expect(v.widthMm).toBeCloseTo(80 * PT, 1);
    expect(v.heightMm).toBeCloseTo(60 * PT, 1);
  });

  it('explains a raster-only PDF and suggests image tracing', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
    const bytes = await pdfBytes(async (page, doc) => {
      const img = await doc.embedPng(png);
      page.drawImage(img, { x: 10, y: 10, width: 100, height: 100 });
    });
    await expect(importPdf(bytes)).rejects.toThrow(/picture.*tracing/i);
  });

  it('explains a PDF with live text only', async () => {
    const bytes = await pdfBytes(async (page, doc) => {
      page.drawText('Hello', { x: 20, y: 100, size: 30, font: await doc.embedFont(StandardFonts.Helvetica) });
    });
    await expect(importPdf(bytes)).rejects.toThrow(/outlines/i);
  });

  it('rejects EPS/PostScript and non-PDF data with a clear message', async () => {
    await expect(importPdf(new TextEncoder().encode('%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 10 10'))).rejects.toThrow(/PostScript.*SVG or PDF/);
    await expect(importPdf(new TextEncoder().encode('hello'))).rejects.toBeInstanceOf(PdfImportError);
  });
});
