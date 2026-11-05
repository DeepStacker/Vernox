/**
 * Client for the privileged /api/admin endpoint. The caller is identified solely by their
 * Firebase ID token; the server verifies the `role` custom claim and writes the audit log.
 */
import { auth } from '@/lib/firebase';

export type AdminAction =
  | 'SAVE_COUPON' | 'DELETE_COUPON'
  | 'SAVE_REVIEW' | 'DELETE_REVIEW'
  | 'SET_STAFF_ROLE' | 'LIST_STAFF'
  | 'GET_AUDIT_LOGS' | 'LOG_AUDIT';

export class AdminApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export async function adminAction<T = Record<string, unknown>>(
  action: AdminAction,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new AdminApiError('You are signed out. Please sign in again.', 401);

  const token = await user.getIdToken();
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, payload }),
  });

  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  if (!res.ok || (body && body.success === false)) {
    const message = (body?.message as string) || (body?.error as string) || `Request failed (${res.status})`;
    throw new AdminApiError(message, res.status);
  }
  return (body ?? {}) as T;
}

/**
 * Best-effort audit entry for actions the client performs directly on Firestore. The primary
 * write has already succeeded, so a failure here is logged for operators, not shown as a save error.
 */
export function logAudit(eventAction: string, targetType: string, targetId: string, details?: Record<string, unknown>): void {
  adminAction('LOG_AUDIT', { eventAction, targetType, targetId, details }).catch(err => {
    console.warn(`[audit] could not record "${eventAction}" for ${targetType}/${targetId}:`, err);
  });
}
