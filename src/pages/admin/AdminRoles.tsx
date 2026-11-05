/**
 * Staff roles. Roles are Firebase custom claims set by the server (SET_STAFF_ROLE); this screen
 * lists staff, assigns a role to an existing account by email, and revokes access. Only
 * super_admin reaches it (see canAccessTab).
 */

import { useState } from 'react';
import { Check, Lock, Shield, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { AtelierSelect } from '@/components/ui/select';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ROLE_PERMISSIONS, STAFF_ROLES, formatRole, isStaffRole, type RolePermissions, type StaffRole } from '@/lib/auth/permissions';
import { useStaff, useStaffMutations } from '@/lib/data/staff';

const CAPABILITIES: Array<{ name: string; key: keyof RolePermissions }> = [
  { name: 'Products, categories and stock', key: 'canManageProducts' },
  { name: 'Orders (all stages)', key: 'canManageOrders' },
  { name: 'Production stages', key: 'canManageProduction' },
  { name: 'Shipping and tracking', key: 'canManageShipping' },
  { name: 'Finance and analytics', key: 'canManageFinance' },
  { name: 'Coupons', key: 'canManageCoupons' },
  { name: 'Review moderation', key: 'canModerateReviews' },
  { name: 'Customer support', key: 'canManageSupport' },
  { name: 'Order status and notes', key: 'canUpdateOrders' },
  { name: 'Trade enquiries', key: 'canReadB2b' },
  { name: 'Design consultations', key: 'canManageConsultations' },
  { name: 'Store settings', key: 'canManageSettings' },
  { name: 'Staff and roles', key: 'canManageStaff' },
  { name: 'Audit logs', key: 'canViewAuditLogs' },
];

const roleOptions = STAFF_ROLES.map(r => ({ value: r, label: formatRole(r) }));

export function AdminRoles() {
  const { permissions, staffRole, user } = useAuth();
  const canManage = Boolean(permissions?.canManageStaff);
  const { data: staff = [], isLoading, error } = useStaff(canManage);
  const { setStaffRole } = useStaffMutations();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('support');
  const [busy, setBusy] = useState(false);

  const assign = async (targetEmail: string, nextRole: StaffRole | null, uid?: string) => {
    setBusy(true);
    const ok = await setStaffRole({ email: targetEmail.trim().toLowerCase(), uid, role: nextRole });
    setBusy(false);
    return ok;
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (await assign(email, role)) setEmail('');
  };

  if (!canManage) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3 text-amber-700 text-xs">
        <Lock className="w-4 h-4 shrink-0" />
        <span>Only a super admin can manage staff roles. Your role: <strong>{staffRole ? formatRole(staffRole) : 'none'}</strong>.</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl">Team</h2>
        <p className="text-muted-foreground text-sm">Give a person a staff role, change it, or revoke it.</p>
      </div>

      <ol className="bg-muted/30 border border-border/70 rounded-xl p-4 text-xs text-muted-foreground list-decimal list-inside space-y-1">
        <li><strong>Invite:</strong> ask the person to create an account on the storefront with their work email first. A role can only be given to an email that already exists; otherwise the server answers "No account exists for that user".</li>
        <li><strong>Assign:</strong> enter that email and pick a role below. Change a role from the list; revoke removes all staff access.</li>
        <li><strong>Apply:</strong> the person must <strong>sign out and sign in again</strong> before a new role takes effect. Demotions and revocations apply immediately because their sessions are ended.</li>
        <li>You cannot change your own role; ask another super admin.</li>
      </ol>

      <form onSubmit={handleInvite} className="bg-card border border-border/70 rounded-xl p-5 shadow-soft flex flex-col md:flex-row gap-3 md:items-end">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="staff-email">Account email</label>
          <input id="staff-email" type="email" required placeholder="person@example.com" value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition" />
        </div>
        <div className="md:w-64 space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</label>
          <AtelierSelect value={role} onValueChange={v => isStaffRole(v) && setRole(v)}
            className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
            options={roleOptions} />
        </div>
        <button type="submit" disabled={busy}
          className="inline-flex items-center justify-center gap-2 bg-oxblood text-ivory hover:bg-oxblood-deep px-4 py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50">
          <UserPlus className="w-4 h-4" /> Assign role
        </button>
      </form>

      <div className="bg-card border border-border/70 rounded-xl overflow-hidden shadow-soft">
        <div className="p-4 border-b border-border/60">
          <h3 className="font-display text-base text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-oxblood" /> Staff ({staff.length})
          </h3>
        </div>
        {error && <div role="alert" className="p-4 text-xs text-destructive">Could not load staff: {error.message}</div>}
        {isLoading && <div className="p-4 text-xs text-muted-foreground">Loading…</div>}
        {!isLoading && !error && staff.length === 0 && <div className="p-4 text-xs text-muted-foreground">No staff accounts yet.</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-border/60">
              {staff.map(member => {
                const isSelf = member.uid === user?.uid;
                return (
                  <tr key={member.uid} className="hover:bg-muted/20 transition">
                    <td className="p-4">
                      <div className="font-semibold text-foreground text-xs">{member.name || member.email}</div>
                      <div className="font-mono text-xs text-muted-foreground">{member.email}</div>
                    </td>
                    <td className="p-4 w-56">
                      <AtelierSelect value={member.role} disabled={isSelf || busy}
                        onValueChange={v => isStaffRole(v) && v !== member.role && assign(member.email, v, member.uid)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-oxblood transition"
                        options={roleOptions} />
                    </td>
                    <td className="p-4 text-right">
                      {isSelf ? (
                        <span className="text-xs text-muted-foreground">You</span>
                      ) : (
                        <button disabled={busy}
                          onClick={() => confirm(`Remove all staff access for ${member.email}?`) && assign(member.email, null, member.uid)}
                          className="px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 rounded transition disabled:opacity-50">
                          Revoke access
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border border-border/70 rounded-xl overflow-hidden shadow-soft space-y-4 p-5">
        <div>
          <h3 className="font-display text-lg text-oxblood-deep flex items-center gap-2"><Shield className="w-4 h-4" /> Role privileges</h3>
          <p className="text-xs text-muted-foreground mt-0.5">What each role can do in the admin panel. Firestore rules and the admin API enforce the same boundaries.</p>
        </div>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-muted/40 uppercase font-semibold text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3">Capability</th>
                {STAFF_ROLES.map(r => <th key={r} className="p-3 text-center">{formatRole(r)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {CAPABILITIES.map(row => (
                <tr key={row.key} className="hover:bg-muted/10">
                  <td className="p-3 font-medium text-foreground">{row.name}</td>
                  {STAFF_ROLES.map(r => (
                    <td key={r} className="p-3 text-center">
                      {ROLE_PERMISSIONS[r][row.key]
                        ? <Check className="w-4 h-4 text-emerald-600 mx-auto" aria-label="allowed" />
                        : <X className="w-4 h-4 text-muted-foreground/30 mx-auto" aria-label="not allowed" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
