/**
 * Request helpers shared by the API handlers (method guard, client IP, body parsing).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ZodType, ZodTypeDef } from 'zod';
import { ApiError, badRequest } from './errors';

export function assertMethod(req: VercelRequest, res: VercelResponse, allowed: readonly string[]) {
  if (!allowed.includes(req.method || '')) {
    res.setHeader('Allow', allowed.join(', '));
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', `Use ${allowed.join(' or ')} for this endpoint.`);
  }
}

function header(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function getHeader(req: VercelRequest, name: string): string | undefined {
  return header(req, name);
}

/**
 * Client IP for rate limiting. Only headers set by our own edge are trusted:
 * Vercel sets `x-vercel-forwarded-for`; the Caddy proxy (deploy/Caddyfile) overwrites `x-real-ip`.
 * `x-forwarded-for` is deliberately ignored because a client can prepend to it.
 */
export function clientIp(req: VercelRequest): string {
  const candidate = header(req, 'x-vercel-forwarded-for') || header(req, 'x-real-ip');
  const firstHop = candidate?.split(',')[0]?.trim();
  return firstHop || req.socket?.remoteAddress || 'unknown';
}

/** Validates the parsed JSON body against a schema; failures become 400 VALIDATION_ERROR. */
export function parseBody<T>(req: VercelRequest, schema: ZodType<T, ZodTypeDef, unknown>): T {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join('.') || 'body';
    throw badRequest(`Invalid request: ${path} ${issue?.message ?? 'is invalid'}`.trim());
  }
  return result.data;
}

const MAX_RAW_BODY_BYTES = 1024 * 1024;

/**
 * Raw request body, needed for webhook HMAC verification (re-serialising parsed
 * JSON does not reproduce the bytes Razorpay signed).
 *  - Node adapter (server/index.ts) attaches `rawBody`.
 *  - Vercel: the handler exports `config.api.bodyParser = false`, so the stream is unread.
 * If neither is available we fail loudly instead of verifying against a re-serialisation.
 */
export async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const attached = (req as unknown as { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(attached)) return attached;
  if (typeof attached === 'string') return Buffer.from(attached, 'utf8');

  if (req.readable && !req.readableEnded) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > MAX_RAW_BODY_BYTES) throw badRequest('Request body too large');
      chunks.push(buf);
    }
    return Buffer.concat(chunks);
  }

  const body: unknown = req.body;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');

  throw new ApiError(
    500,
    'CONFIG_ERROR',
    'Raw request body is unavailable for signature verification.',
    'Body was already parsed; ensure bodyParser is disabled for this route',
  );
}
