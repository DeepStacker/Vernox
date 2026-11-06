/**
 * Client for the privileged /api/admin endpoint. The caller is identified solely by their
 * Firebase ID token; the server verifies the `role` custom claim and writes the audit log.
 */
import { auth } from '@/lib/firebase';

export type AdminAction =
  | 'SAVE_COUPON' | 'DELETE_COUPON'
  | 'SAVE_REVIEW' | 'DELETE_REVIEW'
  | 'SET_STAFF_ROLE' | 'LIST_STAFF'
  | 'GET_AUDIT_LOGS' | 'LOG_AUDIT'
  | 'CREATE_SHIPMENT' | 'CANCEL_SHIPMENT' | 'GET_LABEL' | 'UPDATE_DELIVERY_STATUS'
  | 'CANCEL_ORDER' | 'CREATE_REFUND' | 'ISSUE_SERVICE_INVOICE' | 'GET_ORDER_DOCUMENTS'
  | 'CLAIM_CONSULTATION' | 'SAVE_PROPOSAL_DRAFT' | 'SEND_PROPOSAL'
  | 'APPROVE_RETURN' | 'REJECT_RETURN' | 'MARK_RETURN_RECEIVED' | 'ADD_ORDER_NOTE'
  | 'ADD_TICKET_MESSAGE' | 'SET_TICKET_STATUS' | 'SET_ORDER_HOLD' | 'RELEASE_ORDER_HOLD';

const READ_ACTIONS: ReadonlySet<AdminAction> = new Set(['LIST_STAFF', 'GET_AUDIT_LOGS', 'GET_LABEL', 'GET_ORDER_DOCUMENTS']);

function stringParams(payload: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]),
  );
}

export class AdminApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
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
  const headers = { Authorization: `Bearer ${token}` };
  // The server reads `{ action, ...params }` from the query for GET actions and from the body otherwise.
  const res = READ_ACTIONS.has(action)
    ? await fetch(`/api/admin?${new URLSearchParams({ action, ...stringParams(payload) })}`, { headers })
    : await fetch('/api/admin', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, action }),
      });

  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  if (!res.ok || (body && body.success === false)) {
    const message = (body?.message as string) || (body?.error as string) || `Request failed (${res.status})`;
    throw new AdminApiError(message, res.status, typeof body?.code === 'string' ? body.code : undefined);
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
