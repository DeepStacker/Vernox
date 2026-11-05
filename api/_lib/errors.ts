/**
 * Error contract shared by every API handler.
 *
 * Expected domain failures are thrown as ApiError and serialised as
 * `{ success: false, code, message }`. Anything else is an unexpected system
 * failure: it is logged with context and returned as a generic 500 so internals
 * (stack traces, Firestore paths, provider responses) never reach the client.
 */
import type { VercelResponse } from '@vercel/node';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_ITEM'
  | 'INVALID_COUPON'
  | 'INSUFFICIENT_STOCK'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'SHIPPING_PROVIDER_ERROR'
  | 'COD_NOT_AVAILABLE'
  | 'NOT_SERVICEABLE'
  | 'SIGNATURE_INVALID'
  | 'CONFIG_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'METHOD_NOT_ALLOWED'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    /** Server-side only context; logged, never sent to the client. */
    readonly internalDetail?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message: string) => new ApiError(400, 'VALIDATION_ERROR', message);
export const configError = (reason: string) =>
  new ApiError(500, 'CONFIG_ERROR', 'The server is not configured correctly. Please try again later.', reason);

export interface ErrorBody {
  success: false;
  code: ApiErrorCode;
  message: string;
}

export function toErrorBody(err: unknown, context: string): { status: number; body: ErrorBody } {
  if (err instanceof ApiError) {
    if (err.status >= 500 || err.internalDetail) {
      console.error(`[${context}] ${err.code}: ${err.message}${err.internalDetail ? ` (${err.internalDetail})` : ''}`);
    }
    return { status: err.status, body: { success: false, code: err.code, message: err.message } };
  }
  console.error(`[${context}] unexpected error`, err);
  return {
    status: 500,
    body: { success: false, code: 'INTERNAL_ERROR', message: 'An internal error occurred. Please try again.' },
  };
}

export function sendError(res: VercelResponse, err: unknown, context: string) {
  const { status, body } = toErrorBody(err, context);
  return res.status(status).json(body);
}
