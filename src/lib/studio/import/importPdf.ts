/**
 * Vector import from PDF and Adobe Illustrator (.ai, which is a PDF when saved "PDF
 * compatible"). pdf.js interprets the first page into an operator list; this module walks it
 * keeping the current transformation matrix (CTM), collects the path operators (moveTo,
 * lineTo, curveTo, rectangle, closePath), maps them into the studio's y-down millimetre frame
 * and returns one centred path, like the SVG and DXF importers.
 *
 * pdf.js is ~1 MB: this file is only ever loaded with a dynamic import() from the studio
 * (never from the storefront bundle), and pdf.js itself is imported inside `loadPdfjs`.
 * The path data layout of `constructPath` is that of the pinned pdfjs-dist version
 * ([op, [drawOps], minMax]); an unexpected layout fails with a clear error, not silently.
 */
import { centrePathData } from '../geometry/path';
import type { ImportedVector } from './importVector';

const PT_TO_MM = 25.4 / 72;

/** Drawing-path opcodes inside a constructPath operand (pdf.js DrawOPS, not exported by the package). */
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

/** Page operator codes used here (pdf.js OPS), passed in so tests can run without the library. */
export interface PdfOps {
  save: number; restore: number; transform: number; constructPath: number;
  fill: number; eoFill: number; fillStroke: number; eoFillStroke: number; closeFillStroke: number; closeEOFillStroke: number;
  stroke: number; closeStroke: number;
  paintImageXObject: number; paintInlineImageXObject: number; paintImageMaskXObject: number; paintImageXObjectRepeat: number;
  showText: number;
}

export interface OperatorList { fnArray: number[]; argsArray: unknown[] }

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** a × b: apply b first, then a (PDF concatenation order for `cm`: new CTM = m × CTM). */
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export class PdfImportError extends Error {}

export interface PdfPaths {
  /** Path data in millimetres (y down, not yet centred). */
  d: string;
  pathCount: number;
  /** True when the page paints raster images (a scan or a placed photo). */
  hasImages: boolean;
  /** True when the page shows live text (fonts are not outlines). */
  hasText: boolean;
}

const PAINTING = (ops: PdfOps) => new Set([ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke, ops.stroke, ops.closeStroke]);

/**
 * Collects the painted paths of one page. `viewTransform` maps default user space to the
 * page's y-down point space (pdf.js `viewport.transform`: handles the y flip, MediaBox
 * origin and /Rotate). Paths used only as clips are skipped; so is a rectangle that is the
 * whole page (a background fill) when other artwork exists.
 */
export function collectPaths(list: OperatorList, ops: PdfOps, viewTransform: Matrix, pageSizePt: { width: number; height: number }): PdfPaths {
  const painting = PAINTING(ops);
  const images = new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject, ops.paintImageXObjectRepeat]);
  let ctm = viewTransform;
  const stack: Matrix[] = [];
  const paths: { d: string; fullPage: boolean }[] = [];
  let hasImages = false;
  let hasText = false;

  list.fnArray.forEach((fn, i) => {
    const args = list.argsArray[i] as unknown[] | null;
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() ?? ctm;
    else if (fn === ops.transform && args) ctm = multiply(ctm, args as unknown as Matrix);
    else if (images.has(fn)) hasImages = true;
    else if (fn === ops.showText) hasText = true;
    else if (fn === ops.constructPath) {
      if (!Array.isArray(args) || typeof args[0] !== 'number' || !Array.isArray(args[1])) throw new PdfImportError('This PDF uses a drawing format that the importer does not understand. Export it as SVG instead.');
      const [op, [data]] = args as [number, [ArrayLike<number> | null]];
      if (!painting.has(op) || !data) return;
      let d = '';
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const pt = (x: number, y: number) => {
        const px = ctm[0] * x + ctm[2] * y + ctm[4];
        const py = ctm[1] * x + ctm[3] * y + ctm[5];
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        return `${round(px * PT_TO_MM)} ${round(py * PT_TO_MM)}`;
      };
      for (let k = 0; k < data.length;) {
        switch (data[k++]) {
          case DRAW.moveTo: d += `M${pt(data[k], data[k + 1])}`; k += 2; break;
          case DRAW.lineTo: d += `L${pt(data[k], data[k + 1])}`; k += 2; break;
          case DRAW.curveTo: d += `C${pt(data[k], data[k + 1])} ${pt(data[k + 2], data[k + 3])} ${pt(data[k + 4], data[k + 5])}`; k += 6; break;
          case DRAW.quadraticCurveTo: d += `Q${pt(data[k], data[k + 1])} ${pt(data[k + 2], data[k + 3])}`; k += 4; break;
          case DRAW.closePath: d += 'Z'; break;
          default: throw new PdfImportError('This PDF contains a path operator the importer does not support. Export it as SVG instead.');
        }
      }
      if (!d) return;
      const tol = 0.01 * Math.max(pageSizePt.width, pageSizePt.height);
      const fullPage = minX <= tol && minY <= tol && maxX >= pageSizePt.width - tol && maxY >= pageSizePt.height - tol;
      paths.push({ d, fullPage });
    }
  });

  const artwork = paths.filter(p => !p.fullPage);
  const used = artwork.length > 0 ? artwork : paths;
  return { d: used.map(p => p.d).join(''), pathCount: used.length, hasImages, hasText };
}

/** Turns collected paths into the importer result, or explains why there is nothing to cut. */
export function pathsToVector(paths: PdfPaths): ImportedVector {
  if (paths.pathCount === 0) {
    if (paths.hasImages) throw new PdfImportError('This PDF only contains a picture (a scan or photo), not vector shapes. Use the image tracing tool (Upload a logo) to turn a picture into cut lines.');
    if (paths.hasText) throw new PdfImportError('This PDF only contains live text. Convert the text to outlines in your design program (Create Outlines in Illustrator), or add the text here with the Text tool.');
    throw new PdfImportError('No vector shapes were found on the first page of this file.');
  }
  const c = centrePathData(paths.d);
  if (!(c.width > 0) || !(c.height > 0)) throw new PdfImportError('The shapes in this file have no size (only lines or points). Export a design with filled shapes.');
  return { d: c.d, widthMm: c.width, heightMm: c.height };
}

const MAX_PDF_BYTES = 30 * 1024 * 1024;

async function loadPdfjs() {
  // Node (tests, headless use) needs the legacy build and uses pdf.js's bundled fake worker.
  if (typeof window === 'undefined') return import('pdfjs-dist/legacy/build/pdf.mjs');
  // Browser: run the parser in a worker.
  const [pdfjs, { default: workerSrc }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  return pdfjs;
}

/** Imports the first page of a PDF (or PDF-compatible .ai) as one path in millimetres. */
export async function importPdf(data: ArrayBuffer | Uint8Array): Promise<ImportedVector> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length > MAX_PDF_BYTES) throw new PdfImportError('This file is too large to import (limit 30 MB). Simplify the artwork or export it as SVG.');
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!head.includes('%PDF-')) {
    throw new PdfImportError(head.startsWith('%!PS') || head.includes('%!PS-Adobe')
      ? 'This file is PostScript (EPS or an old Illustrator file), which is not supported. Export it as SVG or PDF and import that.'
      : 'This file is not a PDF. For Illustrator files, save with "Create PDF Compatible File" on, or export as SVG or PDF.');
  }

  const pdfjs = await loadPdfjs();
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const list = await page.getOperatorList();
    const paths = collectPaths(list as unknown as OperatorList, pdfjs.OPS as unknown as PdfOps, viewport.transform as Matrix, { width: viewport.width, height: viewport.height });
    return pathsToVector(paths);
  } catch (err) {
    if (err instanceof PdfImportError) throw err;
    const name = (err as { name?: string } | null)?.name;
    if (name === 'PasswordException') throw new PdfImportError('This PDF is password protected. Remove the password and try again.');
    if (name === 'InvalidPDFException') throw new PdfImportError('This PDF is damaged or not a valid PDF file.');
    throw err;
  } finally {
    await task.destroy();
  }
}
