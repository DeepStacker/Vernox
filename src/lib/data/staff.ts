/** Staff directory and audit log. Both are served by /api/admin (role-checked server side). */
import { useQuery } from '@tanstack/react-query';
import type { AuditEntry, StaffMember } from '@/types/store';
import type { StaffRole } from '@/lib/auth/permissions';
import { adminAction } from './adminApi';
import { useOptimisticMutation } from './optimistic';

export const STAFF_KEY = ['admin', 'staff'] as const;
export const AUDIT_KEY = ['admin', 'audit'] as const;

export async function fetchStaff(): Promise<StaffMember[]> {
  const res = await adminAction<{ staff?: StaffMember[] }>('LIST_STAFF');
  return res.staff ?? [];
}

export async function fetchAuditLogs(targetType?: string): Promise<AuditEntry[]> {
  const res = await adminAction<{ logs?: AuditEntry[] }>('GET_AUDIT_LOGS', targetType ? { targetType } : {});
  return res.logs ?? [];
}

export function useStaff(enabled: boolean) {
  return useQuery({ queryKey: STAFF_KEY, queryFn: fetchStaff, enabled, staleTime: 30_000 });
}

export function useAuditLogs(enabled: boolean, targetType?: string) {
  return useQuery({
    queryKey: [...AUDIT_KEY, targetType ?? 'all'],
    queryFn: () => fetchAuditLogs(targetType),
    enabled,
    staleTime: 15_000,
  });
}

/** `role: null` revokes staff access. The server also invalidates the user's tokens. */
export function useStaffMutations() {
  const setRole = useOptimisticMutation<StaffMember[], { email: string; uid?: string; role: StaffRole | null }>({
    queryKey: STAFF_KEY,
    mutationFn: vars => adminAction('SET_STAFF_ROLE', vars),
    failureMessage: 'Could not update staff role',
    successMessage: 'Role saved. The person must sign out and back in for a new role to apply.',
  });
  return { setStaffRole: setRole.run };
}
