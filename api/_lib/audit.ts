/**
 * Server-side audit log. Clients cannot write `audit_logs` (firestore.rules);
 * every entry is created here with the actor taken from the verified token.
 */
import type { AuditLog, AuditTargetType } from '../../src/types/admin';
import type { StaffUser } from './auth';
import type { DocStore, StoreTransaction } from './store';

export type AuditEntry = Omit<AuditLog, 'id'>;

export const SYSTEM_ACTOR = { uid: 'system', email: 'system@vernox', role: 'system' as const };

export function buildAuditEntry(params: {
  actor: Pick<StaffUser, 'uid' | 'email'> & { role: StaffUser['role'] | 'system' };
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  details?: Record<string, unknown>;
  ip?: string;
  source?: AuditLog['source'];
  now?: number;
}): AuditEntry {
  const email = params.actor.email ?? 'unknown';
  return {
    timestamp: params.now ?? Date.now(),
    actorUid: params.actor.uid,
    adminEmail: email,
    adminName: email.split('@')[0],
    adminRole: params.actor.role,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    details: params.details ?? {},
    ...(params.ip ? { ip: params.ip } : {}),
    source: params.source ?? 'server',
  };
}

export function auditInTransaction(store: DocStore, tx: StoreTransaction, entry: AuditEntry) {
  tx.create(`audit_logs/${store.newId('audit_logs')}`, entry as unknown as Record<string, unknown>);
}

/**
 * Writes an audit entry outside a transaction. The audited action has already
 * succeeded, so a logging failure is reported loudly but does not undo it.
 */
export async function recordAudit(store: DocStore, entry: AuditEntry): Promise<void> {
  try {
    await store.create(`audit_logs/${store.newId('audit_logs')}`, entry as unknown as Record<string, unknown>);
  } catch (err) {
    console.error(`[audit] FAILED to record ${entry.action} on ${entry.targetType}/${entry.targetId}`, err);
  }
}
