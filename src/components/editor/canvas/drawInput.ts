/** Pointer helpers shared by the canvas drawing tools. */
import type { MutableRefObject } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Pt } from '@/lib/studio/geometry/path';

export const coarsePointer = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);

/** Pointer position in plate millimetres (the stage is scaled so one unit is one mm). */
export function worldPointer(e: KonvaEventObject<PointerEvent>): Pt | null {
  return e.target.getStage()?.getRelativePointerPosition() ?? null;
}

/** Middle button or Space held: the stage pans instead of the tool drawing. */
export function wantsPan(e: KonvaEventObject<PointerEvent>, spaceDown: MutableRefObject<boolean>): boolean {
  return e.evt.button === 1 || spaceDown.current;
}

/** A transparent rectangle far larger than any plate that receives the drawing tools' pointer events. */
export const CAPTURE_RECT = { x: -1e5, y: -1e5, width: 2e5, height: 2e5, fill: 'rgba(0,0,0,0)' } as const;

export const DRAW_COLOUR = '#2563eb';
