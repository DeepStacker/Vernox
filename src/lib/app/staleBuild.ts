/**
 * After a deploy, a tab opened on the previous build asks for code-split chunks whose hashed names no longer exist.
 * Reloading once fetches the new index.html and its chunks. The timestamp guard stops a reload loop when the chunk
 * is missing for another reason (offline, a broken deploy): the error screen shows instead.
 */
const KEY = 'vernox:stale-build-reload';
const GUARD_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload CSS/i.test(text);
}

/** Reloads the page unless it already did so in the last minute; returns whether it reloaded. */
export function reloadForNewBuild(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (now - last < GUARD_MS) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch {
    // Storage blocked (private mode): reload at most once per page load, guarded by the error screen.
    return false;
  }
  window.location.reload();
  return true;
}
