/**
 * Editable Bezier path model for the pen tool, the pencil and node editing.
 *
 * A path object stores plain SVG path data (`d`, the schema's single source of truth); this
 * module converts it to anchors with absolute handles and back, and implements the node
 * operations (move, add on a segment, delete, corner/smooth). Pure and immutable: every
 * operation returns a new path, so each edit maps to one store update and one undo step.
 */
import svgpath from 'svgpath';
import { applyMatrix, formatCoord, type Matrix, type Pt } from '../geometry/path';

export type NodeType = 'corner' | 'smooth';

export interface PathNode {
  x: number;
  y: number;
  /** Handle of the segment arriving at this anchor (absolute); absent = straight. */
  in?: Pt;
  /** Handle of the segment leaving this anchor (absolute); absent = straight. */
  out?: Pt;
  /** Smooth anchors keep their two handles collinear when one is dragged. */
  type: NodeType;
}

export interface SubPath {
  nodes: PathNode[];
  closed: boolean;
}

export type EditablePath = SubPath[];

export interface NodeRef {
  sub: number;
  index: number;
}

export type Cubic = [Pt, Pt, Pt, Pt];

const EPS = 1e-6;
const samePt = (a: Pt, b: Pt, eps = EPS) => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/** A handle that coincides with its anchor is no handle at all. */
const handle = (h: Pt, anchor: Pt): Pt | undefined => (samePt(h, anchor) ? undefined : { x: h.x, y: h.y });

/** Two handles pointing in opposite directions (within ~2°) make a smooth anchor. */
function classify(n: PathNode): NodeType {
  if (!n.in || !n.out) return 'corner';
  const ax = n.in.x - n.x, ay = n.in.y - n.y, bx = n.out.x - n.x, by = n.out.y - n.y;
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < EPS || lb < EPS) return 'corner';
  const cross = Math.abs(ax * by - ay * bx) / (la * lb);
  const dot = (ax * bx + ay * by) / (la * lb);
  return dot < 0 && cross < 0.035 ? 'smooth' : 'corner';
}

/** Parses SVG path data (any commands; arcs and quadratics become cubics) into an editable path. */
export function parsePathData(d: string): EditablePath {
  const out: EditablePath = [];
  let cur: SubPath | null = null;
  const flush = () => {
    if (cur && cur.nodes.length > 0) out.push(cur);
    cur = null;
  };
  const ensure = (x: number, y: number): SubPath => {
    cur ??= { nodes: [{ x, y, type: 'corner' }], closed: false };
    return cur;
  };
  const curveTo = (x: number, y: number, c1: Pt, c2: Pt, end: Pt) => {
    const sub = ensure(x, y);
    const last = sub.nodes[sub.nodes.length - 1];
    last.out = handle(c1, last);
    sub.nodes.push({ x: end.x, y: end.y, in: handle(c2, end), type: 'corner' });
  };
  svgpath(d).abs().unarc().unshort().iterate((seg, _i, x, y) => {
    switch (seg[0]) {
      case 'M':
        flush();
        cur = { nodes: [{ x: seg[1], y: seg[2], type: 'corner' }], closed: false };
        break;
      case 'L':
        ensure(x, y).nodes.push({ x: seg[1], y: seg[2], type: 'corner' });
        break;
      case 'H':
        ensure(x, y).nodes.push({ x: seg[1], y, type: 'corner' });
        break;
      case 'V':
        ensure(x, y).nodes.push({ x, y: seg[1], type: 'corner' });
        break;
      case 'C':
        curveTo(x, y, { x: seg[1], y: seg[2] }, { x: seg[3], y: seg[4] }, { x: seg[5], y: seg[6] });
        break;
      case 'Q': {
        // Degree elevation: exact.
        const q = { x: seg[1], y: seg[2] }, e = { x: seg[3], y: seg[4] };
        curveTo(x, y, lerp({ x, y }, q, 2 / 3), lerp(e, q, 2 / 3), e);
        break;
      }
      case 'Z':
      case 'z': {
        const sub = cur as SubPath | null;
        if (sub) {
          const first = sub.nodes[0];
          const last = sub.nodes[sub.nodes.length - 1];
          // A closing segment drawn explicitly back to the start: merge the duplicate anchor.
          if (sub.nodes.length > 1 && samePt(first, last, 1e-4)) {
            if (last.in) first.in = last.in;
            sub.nodes.pop();
          }
          sub.closed = true;
        }
        flush();
        break;
      }
      default:
        break;
    }
  });
  flush();
  for (const sub of out) for (const n of sub.nodes) n.type = classify(n);
  return out;
}

const pt = (p: Pt, precision: number) => `${formatCoord(p.x, precision)} ${formatCoord(p.y, precision)}`;

/** Serialises an editable path to compact SVG path data (absolute M / L / C / Z). */
export function serializePath(path: EditablePath, precision = 3): string {
  const parts: string[] = [];
  for (const sub of path) {
    const n = sub.nodes.length;
    if (n === 0) continue;
    parts.push(`M${pt(sub.nodes[0], precision)}`);
    const segments = sub.closed ? n : n - 1;
    for (let i = 0; i < segments; i++) {
      const a = sub.nodes[i], b = sub.nodes[(i + 1) % n];
      const closing = sub.closed && i === n - 1;
      if (!a.out && !b.in) {
        if (!closing) parts.push(`L${pt(b, precision)}`);
      } else {
        parts.push(`C${pt(a.out ?? a, precision)} ${pt(b.in ?? b, precision)} ${pt(b, precision)}`);
      }
    }
    if (sub.closed) parts.push('Z');
  }
  return parts.join('');
}

export function segmentCount(sub: SubPath): number {
  return sub.closed ? sub.nodes.length : Math.max(0, sub.nodes.length - 1);
}

/** Segment `i` of a sub-path as a cubic. */
export function segmentCubic(sub: SubPath, i: number): Cubic {
  const a = sub.nodes[i], b = sub.nodes[(i + 1) % sub.nodes.length];
  // A straight segment gets handles at its thirds so t is proportional to length (matches insertNode's lerp).
  if (!a.out && !b.in) return [{ x: a.x, y: a.y }, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), { x: b.x, y: b.y }];
  return [{ x: a.x, y: a.y }, a.out ?? { x: a.x, y: a.y }, b.in ?? { x: b.x, y: b.y }, { x: b.x, y: b.y }];
}

export function cubicAt(c: Cubic, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
  return { x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x, y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y };
}

const cloneNode = (n: PathNode): PathNode => ({ ...n, ...(n.in ? { in: { ...n.in } } : {}), ...(n.out ? { out: { ...n.out } } : {}) });
const clonePath = (p: EditablePath): EditablePath => p.map(s => ({ closed: s.closed, nodes: s.nodes.map(cloneNode) }));

export function getNode(path: EditablePath, ref: NodeRef): PathNode | undefined {
  return path[ref.sub]?.nodes[ref.index];
}

/** Applies an affine matrix to every anchor and handle (local ⇄ plate coordinates). */
export function transformPath(path: EditablePath, m: Matrix): EditablePath {
  return path.map(s => ({
    closed: s.closed,
    nodes: s.nodes.map(n => ({
      ...applyMatrix(m, n),
      type: n.type,
      ...(n.in ? { in: applyMatrix(m, n.in) } : {}),
      ...(n.out ? { out: applyMatrix(m, n.out) } : {}),
    })),
  }));
}

/** Moves an anchor together with its handles. */
export function moveNode(path: EditablePath, ref: NodeRef, dx: number, dy: number): EditablePath {
  const next = clonePath(path);
  const n = getNode(next, ref);
  if (!n) return path;
  n.x += dx; n.y += dy;
  if (n.in) { n.in.x += dx; n.in.y += dy; }
  if (n.out) { n.out.x += dx; n.out.y += dy; }
  return next;
}

/** Places one handle; on a smooth anchor the opposite handle turns to stay collinear (its length is kept). */
export function moveHandle(path: EditablePath, ref: NodeRef, which: 'in' | 'out', to: Pt): EditablePath {
  const next = clonePath(path);
  const n = getNode(next, ref);
  if (!n) return path;
  n[which] = handle(to, n);
  const other = which === 'in' ? 'out' : 'in';
  const o = n[other];
  if (n.type === 'smooth' && o && n[which]) {
    const len = Math.hypot(o.x - n.x, o.y - n.y);
    const dx = to.x - n.x, dy = to.y - n.y;
    const l = Math.hypot(dx, dy);
    n[other] = { x: n.x - (dx / l) * len, y: n.y - (dy / l) * len };
  }
  return next;
}

/** Splits segment `seg` of sub-path `sub` at parameter t, inserting an anchor that keeps the curve's shape. */
export function insertNode(path: EditablePath, sub: number, seg: number, t: number): { path: EditablePath; ref: NodeRef } {
  const next = clonePath(path);
  const s = next[sub];
  const n = s.nodes.length;
  const a = s.nodes[seg], b = s.nodes[(seg + 1) % n];
  let node: PathNode;
  if (!a.out && !b.in) {
    node = { ...lerp(a, b, t), type: 'corner' };
  } else {
    // de Casteljau split.
    const [p0, p1, p2, p3] = segmentCubic(s, seg);
    const p01 = lerp(p0, p1, t), p12 = lerp(p1, p2, t), p23 = lerp(p2, p3, t);
    const p012 = lerp(p01, p12, t), p123 = lerp(p12, p23, t);
    const mid = lerp(p012, p123, t);
    a.out = handle(p01, a);
    b.in = handle(p23, b);
    node = { ...mid, in: handle(p012, mid), out: handle(p123, mid), type: 'smooth' };
    node.type = classify(node);
  }
  s.nodes.splice(seg + 1, 0, node);
  return { path: next, ref: { sub, index: seg + 1 } };
}

/** Removes an anchor; a sub-path left with fewer than two anchors is removed too. */
export function deleteNode(path: EditablePath, ref: NodeRef): EditablePath {
  const next = clonePath(path);
  const s = next[ref.sub];
  if (!s || !s.nodes[ref.index]) return path;
  s.nodes.splice(ref.index, 1);
  if (s.nodes.length < 2) next.splice(ref.sub, 1);
  else if (s.closed && s.nodes.length === 2 && s.nodes.every(n => !n.in && !n.out)) s.closed = false;
  return next;
}

/**
 * Corner → smooth: handles along the line between the neighbours, a third of the way to each.
 * Smooth → corner: handles removed, so both adjoining segments become straight.
 */
export function setNodeType(path: EditablePath, ref: NodeRef, type: NodeType): EditablePath {
  const next = clonePath(path);
  const s = next[ref.sub];
  const n = s?.nodes[ref.index];
  if (!s || !n) return path;
  n.type = type;
  if (type === 'corner') {
    delete n.in;
    delete n.out;
    return next;
  }
  const count = s.nodes.length;
  const prev = ref.index > 0 ? s.nodes[ref.index - 1] : s.closed ? s.nodes[count - 1] : undefined;
  const after = ref.index < count - 1 ? s.nodes[ref.index + 1] : s.closed ? s.nodes[0] : undefined;
  const from = prev ?? n, to = after ?? n;
  let dx = to.x - from.x, dy = to.y - from.y;
  let len = Math.hypot(dx, dy);
  if (len < EPS) { dx = 1; dy = 0; len = 1; }
  const ux = dx / len, uy = dy / len;
  if (prev) {
    const l = Math.hypot(prev.x - n.x, prev.y - n.y) / 3;
    n.in = { x: n.x - ux * l, y: n.y - uy * l };
  }
  if (after) {
    const l = Math.hypot(after.x - n.x, after.y - n.y) / 3;
    n.out = { x: n.x + ux * l, y: n.y + uy * l };
  }
  return next;
}

export interface SegmentHit {
  sub: number;
  seg: number;
  t: number;
  point: Pt;
  dist: number;
}

/** Closest point on any segment (sampling, then refinement around the best sample). */
export function nearestSegment(path: EditablePath, p: Pt): SegmentHit | null {
  let best: SegmentHit | null = null;
  const consider = (sub: number, seg: number, c: Cubic, t: number) => {
    const q = cubicAt(c, t);
    const dist = Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || dist < best.dist) best = { sub, seg, t, point: q, dist };
  };
  path.forEach((s, si) => {
    for (let i = 0; i < segmentCount(s); i++) {
      const c = segmentCubic(s, i);
      const SAMPLES = 32;
      let localBest = 0, localDist = Infinity;
      for (let k = 0; k <= SAMPLES; k++) {
        const q = cubicAt(c, k / SAMPLES);
        const dist = Math.hypot(q.x - p.x, q.y - p.y);
        if (dist < localDist) { localDist = dist; localBest = k / SAMPLES; }
      }
      let lo = Math.max(0, localBest - 1 / SAMPLES), hi = Math.min(1, localBest + 1 / SAMPLES);
      for (let it = 0; it < 30; it++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        const q1 = cubicAt(c, m1), q2 = cubicAt(c, m2);
        if (Math.hypot(q1.x - p.x, q1.y - p.y) < Math.hypot(q2.x - p.x, q2.y - p.y)) hi = m2; else lo = m1;
      }
      consider(si, i, c, (lo + hi) / 2);
    }
  });
  return best;
}

export function nodeCount(path: EditablePath): number {
  return path.reduce((n, s) => n + s.nodes.length, 0);
}
