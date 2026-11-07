/**
 * GET /api/catalog — the public storefront data (api/_lib/publicCatalog.ts) as one JSON document.
 *
 * Cached at Vercel's CDN for 60 s and served stale for up to 10 minutes while it revalidates, so the
 * storefront costs about one Firestore rebuild per minute per CDN region however many people browse.
 * Browsers keep it for 60 s too (the app's own staleTime), which also lets the app's fetch reuse the
 * <link rel="preload"> response from index.html instead of downloading it twice. Within one warm
 * instance, concurrent misses share a single build, and a build is reused for MEMO_MS.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendError } from './_lib/errors';
import { getStore } from './_lib/firebaseAdmin';
import { assertMethod } from './_lib/http';
import { buildPublicCatalog, type PublicCatalog } from './_lib/publicCatalog';

const MEMO_MS = 15_000;
let memo: { at: number; body: string } | null = null;
let inFlight: Promise<string> | null = null;

async function catalogBody(): Promise<string> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.body;
  inFlight ??= buildPublicCatalog(getStore())
    .then((catalog: PublicCatalog) => {
      memo = { at: catalog.generatedAt, body: JSON.stringify(catalog) };
      return memo.body;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Test hook: forget the per-instance copy. */
export function resetCatalogMemo() {
  memo = null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['GET', 'HEAD']);
    const body = await catalogBody();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=600');
    res.status(200);
    return res.end(body);
  } catch (err) {
    return sendError(res, err, 'catalog');
  }
}
