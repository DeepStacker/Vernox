/**
 * Vector import: SVG (paths and basic shapes, nested transforms, real-world units) and DXF
 * (LINE, LWPOLYLINE/POLYLINE with bulges, ARC, CIRCLE, ELLIPSE, SPLINE; $INSUNITS). Both
 * produce one path in millimetres, centred on (0,0), ready to become a `path` object.
 * dxf-parser is loaded only when a DXF is imported. PDF-vector import is not supported
 * (no small, maintained parser; see docs/adr/0001-studio-engine.md).
 */
import svgpath from 'svgpath';
import { centrePathData, ringsToPathData, type Pt, type Ring, type Rings } from '../geometry/path';

export interface ImportedVector {
  d: string;
  widthMm: number;
  heightMm: number;
}

const PX_TO_MM = 25.4 / 96;

function lengthToMm(value: string | null): number | null {
  if (!value) return null;
  const m = /^\s*([\d.]+)\s*(mm|cm|in|pt|pc|px)?\s*$/.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'mm': return n;
    case 'cm': return n * 10;
    case 'in': return n * 25.4;
    case 'pt': return (n * 25.4) / 72;
    case 'pc': return (n * 25.4) / 6;
    default: return n * PX_TO_MM;
  }
}

function elementPath(el: Element): string | null {
  const num = (name: string) => Number(el.getAttribute(name) ?? 0);
  switch (el.tagName.toLowerCase()) {
    case 'path': return el.getAttribute('d');
    case 'rect': {
      const x = num('x'), y = num('y'), w = num('width'), h = num('height');
      return w > 0 && h > 0 ? `M${x} ${y}H${x + w}V${y + h}H${x}Z` : null;
    }
    case 'circle': {
      const cx = num('cx'), cy = num('cy'), r = num('r');
      return r > 0 ? `M${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}Z` : null;
    }
    case 'ellipse': {
      const cx = num('cx'), cy = num('cy'), rx = num('rx'), ry = num('ry');
      return rx > 0 && ry > 0 ? `M${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}Z` : null;
    }
    case 'polygon':
    case 'polyline': {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4) return null;
      let d = `M${pts[0]} ${pts[1]}`;
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
      return el.tagName.toLowerCase() === 'polygon' ? `${d}Z` : d;
    }
    case 'line':
      return `M${num('x1')} ${num('y1')}L${num('x2')} ${num('y2')}`;
    default:
      return null;
  }
}

export function importSvg(text: string): ImportedVector {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) throw new Error('This file is not a valid SVG.');
  const viewBox = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const widthMm = lengthToMm(svg.getAttribute('width'));
  // Scale user units to mm: from width/viewBox when both exist, else CSS px.
  const unit = viewBox.length === 4 && viewBox[2] > 0 && widthMm ? widthMm / viewBox[2] : PX_TO_MM;

  const parts: string[] = [];
  svg.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line').forEach(el => {
    if (el.closest('defs, clipPath, mask, symbol')) return;
    const d = elementPath(el);
    if (!d) return;
    let p = svgpath(d);
    // Apply transforms from the element up to the root (innermost first).
    for (let node: Element | null = el; node && node !== svg.parentElement; node = node.parentElement) {
      const tf = node.getAttribute('transform');
      if (tf) p = svgpath(svgpath(p.toString()).transform(tf).toString());
    }
    parts.push(p.scale(unit).toString());
  });
  if (parts.length === 0) throw new Error('No shapes found in this SVG.');
  const c = centrePathData(parts.join(''));
  return { d: c.d, widthMm: c.width, heightMm: c.height };
}

// ---------- DXF ----------

const INSUNITS_TO_MM: Record<number, number> = { 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };

function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, ccw = true): Ring {
  let sweep = a1 - a0;
  if (ccw && sweep <= 0) sweep += 2 * Math.PI;
  if (!ccw && sweep >= 0) sweep -= 2 * Math.PI;
  const n = Math.max(8, Math.ceil((Math.abs(sweep) * Math.max(r, 1)) / 1.5));
  const pts: Ring = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/** Points along a polyline with DXF bulges (bulge = tan(θ/4) of the arc to the next vertex). */
function bulgePolyline(vertices: { x: number; y: number; bulge?: number }[], closed: boolean): Ring {
  const pts: Ring = [];
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    pts.push({ x: a.x, y: a.y });
    if (!closed && i === n - 1) break;
    const bulge = a.bulge ?? 0;
    if (Math.abs(bulge) < 1e-9) continue;
    // Sagitta form: the arc's midpoint sits `bulge × chord/2` to the right of the chord (CCW for bulge > 0).
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    const half = chord / 2;
    const sagitta = bulge * half;
    const radius = (half * half + sagitta * sagitta) / (2 * sagitta);
    const nx = -(b.y - a.y) / chord, ny = (b.x - a.x) / chord;
    const cx = (a.x + b.x) / 2 + nx * (radius - sagitta);
    const cy = (a.y + b.y) / 2 + ny * (radius - sagitta);
    const r = Math.abs(radius);
    const arc = arcPoints(cx, cy, r, Math.atan2(a.y - cy, a.x - cx), Math.atan2(b.y - cy, b.x - cx), bulge > 0);
    pts.push(...arc.slice(1, -1));
  }
  return pts;
}

/** Uniform sampling of a B-spline by de Boor's algorithm. */
function splinePoints(ctrl: Pt[], degree: number, knots: number[]): Ring {
  if (ctrl.length < 2) return ctrl;
  if (knots.length !== ctrl.length + degree + 1) return ctrl;
  const lo = knots[degree], hi = knots[knots.length - degree - 1];
  const samples = Math.max(16, ctrl.length * 8);
  const out: Ring = [];
  for (let s = 0; s <= samples; s++) {
    const t = Math.min(lo + ((hi - lo) * s) / samples, hi - 1e-9);
    let k = degree;
    while (k < knots.length - degree - 2 && t >= knots[k + 1]) k++;
    const d = Array.from({ length: degree + 1 }, (_, j) => ({ ...ctrl[j + k - degree] }));
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const i = j + k - degree;
        const alpha = (t - knots[i]) / (knots[i + degree - r + 1] - knots[i] || 1);
        d[j] = { x: (1 - alpha) * d[j - 1].x + alpha * d[j].x, y: (1 - alpha) * d[j - 1].y + alpha * d[j].y };
      }
    }
    out.push(d[degree]);
  }
  return out;
}

/** Joins loose LINE/ARC segments whose endpoints touch into chains. */
function chainSegments(segments: Ring[], tol = 0.01): { rings: Rings; open: Rings } {
  const left = segments.slice();
  const rings: Rings = [];
  const open: Rings = [];
  const near = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;
  while (left.length) {
    let chain = left.shift() as Ring;
    let grown = true;
    while (grown && !near(chain[0], chain[chain.length - 1])) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const s = left[i];
        const end = chain[chain.length - 1];
        if (near(end, s[0])) chain = chain.concat(s.slice(1));
        else if (near(end, s[s.length - 1])) chain = chain.concat(s.slice(0, -1).reverse());
        else if (near(chain[0], s[s.length - 1])) chain = s.slice(0, -1).concat(chain);
        else if (near(chain[0], s[0])) chain = s.slice(1).reverse().concat(chain);
        else continue;
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (chain.length > 2 && near(chain[0], chain[chain.length - 1])) rings.push(chain.slice(0, -1));
    else open.push(chain);
  }
  return { rings, open };
}

interface DxfEntity {
  type: string;
  vertices?: { x: number; y: number; bulge?: number }[];
  shape?: boolean;
  closed?: boolean;
  center?: { x: number; y: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  majorAxisEndPoint?: { x: number; y: number };
  axisRatio?: number;
  controlPoints?: { x: number; y: number }[];
  fitPoints?: { x: number; y: number }[];
  degreeOfSplineCurve?: number;
  knotValues?: number[];
}

export async function importDxf(text: string): Promise<ImportedVector> {
  const { default: DxfParser } = await import('dxf-parser');
  const parsed = new DxfParser().parseSync(text) as unknown as { header?: Record<string, unknown>; entities: DxfEntity[] } | null;
  if (!parsed) throw new Error('This file is not a valid DXF.');
  const unit = INSUNITS_TO_MM[Number(parsed.header?.$INSUNITS ?? 4)] ?? 1;

  const closed: Rings = [];
  const segments: Ring[] = [];
  for (const e of parsed.entities) {
    switch (e.type) {
      case 'LINE':
        if (e.vertices && e.vertices.length >= 2) segments.push([e.vertices[0], e.vertices[1]].map(v => ({ x: v.x, y: v.y })));
        break;
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        if (!e.vertices || e.vertices.length < 2) break;
        const isClosed = Boolean(e.shape || e.closed);
        const pts = bulgePolyline(e.vertices, isClosed);
        (isClosed ? closed : segments).push(pts);
        break;
      }
      case 'CIRCLE':
        if (e.center && e.radius) closed.push(arcPoints(e.center.x, e.center.y, e.radius, 0, 2 * Math.PI).slice(0, -1));
        break;
      case 'ARC':
        if (e.center && e.radius !== undefined) segments.push(arcPoints(e.center.x, e.center.y, e.radius, e.startAngle ?? 0, e.endAngle ?? 0));
        break;
      case 'ELLIPSE': {
        if (!e.center || !e.majorAxisEndPoint) break;
        const a = Math.hypot(e.majorAxisEndPoint.x, e.majorAxisEndPoint.y);
        const rot = Math.atan2(e.majorAxisEndPoint.y, e.majorAxisEndPoint.x);
        const b = a * (e.axisRatio ?? 1);
        const t0 = e.startAngle ?? 0;
        let t1 = e.endAngle ?? 2 * Math.PI;
        if (t1 <= t0) t1 += 2 * Math.PI;
        const n = 96;
        const pts: Ring = [];
        for (let i = 0; i <= n; i++) {
          const t = t0 + ((t1 - t0) * i) / n;
          const x = a * Math.cos(t), y = b * Math.sin(t);
          pts.push({ x: e.center.x + x * Math.cos(rot) - y * Math.sin(rot), y: e.center.y + x * Math.sin(rot) + y * Math.cos(rot) });
        }
        (Math.abs(t1 - t0 - 2 * Math.PI) < 1e-6 ? closed : segments).push(pts);
        break;
      }
      case 'SPLINE': {
        const pts = e.controlPoints?.length && e.knotValues?.length
          ? splinePoints(e.controlPoints, e.degreeOfSplineCurve ?? 3, e.knotValues)
          : (e.fitPoints ?? []).map(p => ({ x: p.x, y: p.y }));
        if (pts.length > 1) segments.push(pts);
        break;
      }
      default:
        break;
    }
  }
  const chained = chainSegments(segments);
  const all = [...closed, ...chained.rings];
  if (all.length === 0 && chained.open.length === 0) throw new Error('No supported shapes found in this DXF.');
  // DXF is y-up; flip into the studio's y-down frame and convert units.
  const flip = (r: Ring) => r.map(p => ({ x: p.x * unit, y: -p.y * unit }));
  const d = ringsToPathData(all.map(flip), true, 3) + ringsToPathData(chained.open.map(flip), false, 3);
  const c = centrePathData(d);
  return { d: c.d, widthMm: c.width, heightMm: c.height };
}
