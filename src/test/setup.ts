import "@testing-library/jest-dom";

/**
 * In-memory Web Storage. Recent Node versions expose a broken `localStorage` global (it warns
 * and is undefined without --localstorage-file), which shadows jsdom's implementation.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(key) ? (this.store.get(key) as string) : null; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  const storage = new MemoryStorage();
  Object.defineProperty(window, name, { configurable: true, value: storage });
  Object.defineProperty(globalThis, name, { configurable: true, value: storage });
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
