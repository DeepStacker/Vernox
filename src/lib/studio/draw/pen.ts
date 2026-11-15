/**
 * Pen tool state machine (pure; the canvas only forwards pointer events and renders the draft).
 *
 *  - press and release            → corner anchor
 *  - press and drag               → smooth anchor; the drag sets the outgoing handle (mirrored)
 *  - press on the first anchor    → closes the path (needs two or more anchors)
 *  - press on the last anchor     → finishes an open path (so a double-click finishes too)
 *  - finish (Enter) / undo point (Backspace) / cancel (Esc) are separate calls.
 *
 * Coordinates are plate millimetres; hit radii come from the caller in mm (screen px / zoom).
 */
import type { Pt } from '../geometry/path';
import type { PathNode, SubPath } from './pathModel';

export interface PenDraft {
  nodes: PathNode[];
  /** The pointer is down on the newest anchor; moving it pulls out handles. */
  dragging: boolean;
  /** Last pointer position (rubber-band preview). */
  hover: Pt | null;
}

export const EMPTY_PEN: PenDraft = { nodes: [], dragging: false, hover: null };

export interface PenStep {
  draft: PenDraft;
  /** Set when the gesture completed a path. */
  result?: SubPath;
}

const near = (a: Pt, b: Pt, r: number) => Math.hypot(a.x - b.x, a.y - b.y) <= r;

export function penDown(draft: PenDraft, p: Pt, hitRadius: number): PenStep {
  const { nodes } = draft;
  if (nodes.length >= 2 && near(p, nodes[0], hitRadius)) {
    return { draft: EMPTY_PEN, result: penClose(draft) ?? undefined };
  }
  if (nodes.length >= 1 && near(p, nodes[nodes.length - 1], hitRadius)) {
    const result = penFinish(draft);
    return result ? { draft: EMPTY_PEN, result } : { draft: { ...draft, dragging: false } };
  }
  return { draft: { nodes: [...nodes, { x: p.x, y: p.y, type: 'corner' }], dragging: true, hover: p } };
}

export function penMove(draft: PenDraft, p: Pt, dragThreshold: number): PenDraft {
  if (!draft.dragging || draft.nodes.length === 0) return { ...draft, hover: p };
  const last = draft.nodes[draft.nodes.length - 1];
  if (!near(p, last, dragThreshold)) {
    const node: PathNode = { x: last.x, y: last.y, out: { x: p.x, y: p.y }, in: { x: 2 * last.x - p.x, y: 2 * last.y - p.y }, type: 'smooth' };
    return { ...draft, hover: p, nodes: [...draft.nodes.slice(0, -1), node] };
  }
  return { ...draft, hover: p };
}

export function penUp(draft: PenDraft): PenDraft {
  return draft.dragging ? { ...draft, dragging: false } : draft;
}

/** Removes the newest anchor (Backspace). */
export function penUndoPoint(draft: PenDraft): PenDraft {
  return { ...draft, dragging: false, nodes: draft.nodes.slice(0, -1) };
}

/** Ends the draft as an open path (score line); null when there is not enough to keep. */
export function penFinish(draft: PenDraft): SubPath | null {
  if (draft.nodes.length < 2) return null;
  const nodes = draft.nodes.map(n => ({ ...n }));
  // The first anchor of an open path has no incoming segment, the last none outgoing.
  delete nodes[0].in;
  delete nodes[nodes.length - 1].out;
  for (const n of [nodes[0], nodes[nodes.length - 1]]) n.type = 'corner';
  return { nodes, closed: false };
}

/** Ends the draft as a closed shape; two straight anchors cannot enclose anything and stay open. */
export function penClose(draft: PenDraft): SubPath | null {
  if (draft.nodes.length < 2) return null;
  const curved = draft.nodes.some(n => n.in || n.out);
  if (draft.nodes.length === 2 && !curved) return penFinish(draft);
  return { nodes: draft.nodes.map(n => ({ ...n })), closed: true };
}
