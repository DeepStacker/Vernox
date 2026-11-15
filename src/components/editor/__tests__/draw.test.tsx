/**
 * Drawing flows through the real stores and keyboard table (the Konva layers themselves need
 * a 2-D canvas, which jsdom lacks; they only forward pointer events to the same functions).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { createDocument, createShape } from '@/lib/studio/document';
import { penDown, penMove, penUp } from '@/lib/studio/draw/pen';
import { parsePathData } from '@/lib/studio/draw/pathModel';
import { undo, useStudio } from '@/lib/studio/store';
import { commitDrawnSubPath, convertSelectionToPath } from '../drawActions';
import { useDrawStore } from '../drawStore';
import { STUDIO_SHORTCUTS } from '../shortcuts';

const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key, ...init });
const history = () => useStudio.temporal.getState().pastStates.length;
const pen = (x: number, y: number, dragTo?: { x: number; y: number }) => {
  const d = useDrawStore.getState();
  const step = penDown(d.pen, { x, y }, 2);
  let draft = step.draft;
  if (dragTo) draft = penMove(draft, dragTo, 1);
  d.setPen(penUp(draft));
  if (step.result) commitDrawnSubPath(step.result);
};

describe('studio drawing flows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStudio.getState().loadDocument(createDocument());
    useDrawStore.getState().setTool('select');
    renderHook(() => useKeyboardShortcuts(STUDIO_SHORTCUTS));
  });
  afterEach(() => vi.useRealTimers());

  it('pen: P, click / drag points, Backspace, Enter → one engraved line, one undo step', () => {
    press('p');
    expect(useDrawStore.getState().tool).toBe('pen');
    pen(50, 50);
    pen(100, 50, { x: 120, y: 80 });
    pen(150, 100);
    press('Backspace');
    expect(useDrawStore.getState().pen.nodes).toHaveLength(2);
    expect(useStudio.getState().doc.objects).toHaveLength(0);
    press('Enter');
    const objects = useStudio.getState().doc.objects;
    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatchObject({ kind: 'path', source: 'draw', op: 'score' });
    expect(history()).toBe(1);
    expect(useDrawStore.getState().tool).toBe('pen'); // keeps drawing
    undo();
    expect(useStudio.getState().doc.objects).toHaveLength(0);
  });

  it('pen: clicking the first point closes the shape (cut from a solid plate); Esc leaves the tool', () => {
    press('p');
    pen(50, 50);
    pen(120, 50);
    pen(90, 120);
    pen(50.5, 50.5);
    expect(useStudio.getState().doc.objects[0]).toMatchObject({ kind: 'path', op: 'cut' });
    press('Escape');
    expect(useDrawStore.getState().tool).toBe('select');
  });

  it('points: A edits the selected path; Delete removes a point, arrows move it, Esc ends', () => {
    press('p');
    pen(50, 50); pen(120, 50); pen(90, 120); pen(50.5, 50.5);
    press('Escape');
    const id = useStudio.getState().doc.objects[0].id;
    useStudio.getState().select([id]);
    press('a');
    expect(useDrawStore.getState().nodeEdit?.objectId).toBe(id);
    useDrawStore.getState().selectNode({ sub: 0, index: 1 });
    vi.advanceTimersByTime(1000);
    const x0 = useStudio.getState().doc.objects[0].x;
    press('ArrowRight', { shiftKey: true });
    expect(useStudio.getState().doc.objects[0].x).toBeCloseTo(x0 + 5, 3); // the bounding box grew by 10 mm to the right
    vi.advanceTimersByTime(1000);
    const before = history();
    press('Delete');
    const obj = useStudio.getState().doc.objects[0];
    expect(obj.kind === 'path' && parsePathData(obj.d)[0].nodes).toHaveLength(2);
    expect(history()).toBe(before + 1);
    expect(useStudio.getState().doc.objects).toHaveLength(1); // Delete removed a point, not the object
    press('Escape');
    expect(useDrawStore.getState().nodeEdit).toBeNull();
  });

  it('convert to path: a shape becomes an editable path in one undo step', async () => {
    const shape = createShape({ shapeId: 'circle', x: 100, y: 100, widthMm: 60, heightMm: 60 });
    useStudio.getState().addObjects([shape]);
    vi.advanceTimersByTime(1000);
    await convertSelectionToPath();
    const [obj] = useStudio.getState().doc.objects;
    expect(obj.kind).toBe('path');
    expect(obj.x).toBeCloseTo(100, 3);
    expect(useDrawStore.getState().nodeEdit?.objectId).toBe(obj.id);
    undo();
    expect(useStudio.getState().doc.objects[0].kind).toBe('shape');
  });

  it('B selects the pencil, V returns to select', () => {
    press('b');
    expect(useDrawStore.getState().tool).toBe('pencil');
    press('v');
    expect(useDrawStore.getState().tool).toBe('select');
  });
});
