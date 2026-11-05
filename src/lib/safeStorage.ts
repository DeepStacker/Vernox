/**
 * Defensive wrappers around Web Storage. Storage can be missing (SSR, tests),
 * blocked (private mode) or full; callers only get a best-effort cache, never a throw.
 */
type StorageKind = 'localStorage' | 'sessionStorage';

function resolveStorage(kind: StorageKind): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window[kind] ?? null;
  } catch {
    // Reading the property itself throws when site data is blocked.
    return null;
  }
}

function makeStore(kind: StorageKind) {
  const get = (key: string): string | null => {
    try {
      return resolveStorage(kind)?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const set = (key: string, value: string): boolean => {
    try {
      const s = resolveStorage(kind);
      if (!s) return false;
      s.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };
  return {
    get,
    set,
    remove(key: string): void {
      try {
        resolveStorage(kind)?.removeItem(key);
      } catch {
        // Nothing to clean up when storage is unavailable.
      }
    },
    getJson<T>(key: string, fallback: T): T {
      const raw = get(key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    setJson(key: string, value: unknown): boolean {
      try {
        return set(key, JSON.stringify(value));
      } catch {
        return false;
      }
    },
  };
}

export const safeLocal = makeStore('localStorage');
export const safeSession = makeStore('sessionStorage');
