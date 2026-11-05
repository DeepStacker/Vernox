// @vitest-environment node
import type { DecodedIdToken } from 'firebase-admin/auth';
import { describe, expect, it } from 'vitest';
import { authoriseStaff } from '../../api/_lib/auth';
import { ApiError } from '../../api/_lib/errors';
import { ROLE_PERMISSIONS, STAFF_ROLES, roleHasPermission } from '../types/admin';

const token = (claims: Record<string, unknown>): DecodedIdToken =>
  ({ uid: 'u1', email: 'staff@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...claims }) as unknown as DecodedIdToken;

const forbidden = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as ApiError).code === 'FORBIDDEN';
  }
  return false;
};

describe('staff authorisation', () => {
  it('accepts a staff role with the required permission', () => {
    expect(authoriseStaff(token({ role: 'order_manager' }), 'orders.update_status').role).toBe('order_manager');
  });

  it('rejects accounts without a staff role claim', () => {
    expect(forbidden(() => authoriseStaff(token({}), null))).toBe(true);
    expect(forbidden(() => authoriseStaff(token({ role: 'customer' }), null))).toBe(true);
  });

  it('rejects password accounts with an unverified email', () => {
    expect(forbidden(() => authoriseStaff(token({ role: 'super_admin', email_verified: false, firebase: { sign_in_provider: 'password' } }), null))).toBe(true);
  });

  it('enforces the permission map', () => {
    expect(forbidden(() => authoriseStaff(token({ role: 'support' }), 'coupons.write'))).toBe(true);
    expect(forbidden(() => authoriseStaff(token({ role: 'admin' }), 'staff.manage'))).toBe(true);
    expect(authoriseStaff(token({ role: 'super_admin' }), 'staff.manage').role).toBe('super_admin');
  });

  it('derives the legacy boolean matrix from the permission map', () => {
    for (const role of STAFF_ROLES) {
      expect(ROLE_PERMISSIONS[role].canManageCoupons).toBe(roleHasPermission(role, 'coupons.write'));
    }
    expect(Object.values(ROLE_PERMISSIONS.manager).some(Boolean)).toBe(false);
  });
});
