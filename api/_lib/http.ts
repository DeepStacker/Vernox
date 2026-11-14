/**
 * Request helpers shared by the API handlers (method guard, client IP, body parsing).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ZodType } from 'zod';
import type { $ZodIssue as ZodIssue } from 'zod/v4/core';
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

const FIELD_LABELS: Record<string, string> = {
  'customer.name': 'Name',
  'customer.email': 'Email',
  'customer.phone': 'Mobile number',
  'customer.address': 'Address',
  'customer.city': 'City',
  'customer.state': 'State',
  'customer.pincode': 'PIN code',
  'customer.country': 'Country',
  paymentMethod: 'Payment method',
  customDesignRef: 'Design reference',
  sizeLabel: 'Size',
  quantity: 'Quantity',
  finish: 'Finish',
  productId: 'Product',
};

function fieldLabel(path: ReadonlyArray<PropertyKey>): string | null {
  const dotted = path.filter((p): p is string => typeof p === 'string').join('.');
  if (FIELD_LABELS[dotted]) return FIELD_LABELS[dotted];
  const leaf = String(path[path.length - 1] ?? '');
  const inItem = path[0] === 'items' && typeof path[1] === 'number';
  if (inItem && FIELD_LABELS[leaf]) return `${FIELD_LABELS[leaf]} (item ${Number(path[1]) + 1})`;
  return null;
}

/** "customer.name" -> "customer name" for fields without a label. */
const humanPath = (path: ReadonlyArray<PropertyKey>) =>
  path.map(p => (typeof p === 'number' ? `#${p + 1}` : String(p).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())).join(' ');

function issueDetail(issue: ZodIssue): string {
  switch (issue.code) {
    case 'too_small':
      if (issue.origin === 'string') return issue.minimum === 1 ? 'is required' : `must be at least ${issue.minimum} characters`;
      if (issue.origin === 'array') return issue.minimum === 1 ? 'needs at least one entry' : `needs at least ${issue.minimum} entries`;
      return `must be at least ${issue.minimum}`;
    case 'too_big':
      if (issue.origin === 'string') return `must be at most ${issue.maximum} characters`;
      if (issue.origin === 'array') return `can have at most ${issue.maximum} entries`;
      return `must be at most ${issue.maximum}`;
    case 'invalid_type':
      // Needs `reportInput: true` when parsing; zod 4 no longer exposes the received type on the issue.
      return issue.input === undefined ? 'is required' : `has the wrong type (expected ${issue.expected})`;
    case 'invalid_format':
      // Built-in pattern failures read "Invalid string: must match ..."; custom messages already read as sentences.
      return issue.format === 'email' ? 'must be a valid email address' : issue.message.startsWith('Invalid ') ? 'is not in the expected format' : issue.message;
    case 'invalid_value':
      return 'is not one of the allowed options';
    default:
      return issue.message;
  }
}

/**
 * Turns the first zod issue into a sentence a person can act on, e.g. "Name must be at most 120
 * characters" instead of "customer.name String must contain at most 120 character(s)".
 */
export function friendlyIssueMessage(issue: ZodIssue | undefined, fallbackPath: string): string {
  if (!issue) return 'Invalid request.';
  const label = fieldLabel(issue.path);
  const subject = label ?? (issue.path.length ? humanPath(issue.path) : fallbackPath);
  const detail = issueDetail(issue);
  // Custom refinements already read as sentences (e.g. "must be a 6-digit Indian PIN code").
  const sentence = `${subject} ${detail}`.trim();
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/** Validates the parsed JSON body against a schema; failures become 400 VALIDATION_ERROR. */
export function parseBody<T>(req: VercelRequest, schema: ZodType<T>): T {
  const result = schema.safeParse(req.body ?? {}, { reportInput: true });
  if (!result.success) throw badRequest(friendlyIssueMessage(result.error.issues[0], 'request'));
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
