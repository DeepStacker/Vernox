import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument, createShape, createText } from '../document';
import { redo, undo, useStudio, HISTORY_LIMIT } from '../store';

const history = () => useStudio.temporal.getState();

describe('editor store history', () => {
  afterEach(() => vi.useRealTimers());

  it('undoes and redoes edits; separate actions are separate steps', () => {
    vi.useFakeTimers();
    useStudio.getState().loadDocument(createDocument());
    const shape = createShape({ x: 10, y: 10 });
    useStudio.getState().addObjects([shape]);
    vi.advanceTimersByTime(1000);
    useStudio.getState().updateObjects({ [shape.id]: { x: 50 } });
    expect(useStudio.getState().doc.objects[0].x).toBe(50);
    undo();
    expect(useStudio.getState().doc.objects[0].x).toBe(10);
    undo();
    expect(useStudio.getState().doc.objects).toHaveLength(0);
    redo();
    redo();
    expect(useStudio.getState().doc.objects[0].x).toBe(50);
  });

  it('coalesces a burst of edits (typing, nudges) into one undo step', () => {
    vi.useFakeTimers();
    useStudio.getState().loadDocument(createDocument({ objects: [createShape({ x: 0, y: 0 })] }));
    const id = useStudio.getState().doc.objects[0].id;
    for (let i = 1; i <= 5; i++) {
      useStudio.getState().updateObjects({ [id]: { x: i } });
      vi.advanceTimersByTime(50);
    }
    expect(history().pastStates).toHaveLength(1);
    undo();
    expect(useStudio.getState().doc.objects[0].x).toBe(0);
  });

  it('keeps derived outlines out of history and clears stale outlines on text edits', () => {
    vi.useFakeTimers();
    const text = { ...createText({ text: 'A' }), outline: 'M0 0L1 0L1 1Z' };
    useStudio.getState().loadDocument(createDocument({ objects: [text] }));
    useStudio.getState().updateObjects({ [text.id]: { text: 'AB' } });
    const edited = useStudio.getState().doc.objects[0];
    expect(edited.kind === 'text' && edited.outline).toBeUndefined();
    const before = history().pastStates.length;
    useStudio.getState().applyDerived({ [text.id]: { outline: 'M0 0L2 0L2 1Z' } });
    expect(history().pastStates.length).toBe(before);
    undo();
    const restored = useStudio.getState().doc.objects[0];
    expect(restored.kind === 'text' && restored.text).toBe('A');
    expect(restored.kind === 'text' && restored.outline).toBe('M0 0L1 0L1 1Z');
  });

  it('bounds history', () => {
    vi.useFakeTimers();
    useStudio.getState().loadDocument(createDocument({ objects: [createShape({ x: 0, y: 0 })] }));
    const id = useStudio.getState().doc.objects[0].id;
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      useStudio.getState().updateObjects({ [id]: { x: i } });
      vi.advanceTimersByTime(1000);
    }
    expect(history().pastStates.length).toBe(HISTORY_LIMIT);
  });
});
