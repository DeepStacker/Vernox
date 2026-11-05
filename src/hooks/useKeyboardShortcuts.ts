/**
 * Studio keyboard shortcuts. The table below is the single source for both the handler
 * and the "?" overlay. Shortcuts are ignored while typing in a field.
 */
import { useEffect } from 'react';

export interface Shortcut {
  keys: string;
  label: string;
  /** Matcher on the KeyboardEvent; `mod` = Ctrl on Windows/Linux, ⌘ on macOS. */
  match: (e: KeyboardEvent, mod: boolean) => boolean;
  run: (e: KeyboardEvent) => void;
}

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));
};

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const hit = shortcuts.find(s => s.match(e, mod));
      if (!hit) return;
      e.preventDefault();
      hit.run(e);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts, enabled]);
}
