/**
 * POST /api/csp-report
 * Receives Content-Security-Policy-Report-Only violations (server/apiRouter.ts CSP_REPORT_ONLY) so the allow-list can
 * be checked against real traffic, including live Razorpay and Google sign-in, before it is enforced. Browsers send
 * `application/csp-report` (report-uri) bodies, which the router does not parse, so this reads the raw bytes.
 *
 * Nothing is stored: each distinct directive + blocked origin is logged once per hour per process, so a page that
 * violates on every load cannot flood the logs. Query strings and paths are dropped; they may carry tokens.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const LOG_EVERY_MS = 60 * 60 * 1000;
const MAX_KEYS = 200;
const lastLogged = new Map<string, number>();

/** Origin only (`https://host`), or the CSP keyword the browser reports (`inline`, `eval`, `data`, ...). */
export function blockedSource(uri: unknown): string {
  if (typeof uri !== 'string' || !uri) return 'unknown';
  try {
    const url = new URL(uri);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : url.protocol.replace(/:$/, '');
  } catch {
    return uri.slice(0, 40);
  }
}

/** Violations from a report-uri body or a Reporting API batch, reduced to the fields worth logging. */
export function violationsFrom(body: unknown): { directive: string; blocked: string; page: string }[] {
  const items = Array.isArray(body) ? body.map(r => (r as { body?: unknown })?.body) : [(body as { 'csp-report'?: unknown })?.['csp-report']];
  return items.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const r = item as Record<string, unknown>;
    const directive = String(r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'] ?? 'unknown').slice(0, 40);
    const page = blockedSource(r['document-uri'] ?? r.documentURL);
    return [{ directive, blocked: blockedSource(r['blocked-uri'] ?? r.blockedURL), page }];
  });
}

export function shouldLog(key: string, now: number): boolean {
  const last = lastLogged.get(key);
  if (last !== undefined && now - last < LOG_EVERY_MS) return false;
  if (last === undefined && lastLogged.size >= MAX_KEYS) return false;
  lastLogged.set(key, now);
  return true;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
    return;
  }
  const raw = (req as VercelRequest & { rawBody?: Buffer }).rawBody;
  let body: unknown = req.body;
  try {
    if (raw?.length) body = JSON.parse(raw.toString('utf8'));
  } catch {
    body = null;
  }
  const now = Date.now();
  for (const v of violationsFrom(body)) {
    if (shouldLog(`${v.directive} ${v.blocked}`, now)) console.warn(`[csp] ${v.directive} blocked ${v.blocked} on ${v.page}`);
  }
  res.status(204).end();
}
