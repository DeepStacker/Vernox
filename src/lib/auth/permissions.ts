/**
 * UI view of staff permissions.
 *
 * The authoritative role -> permission map is STAFF_ROLE_PERMISSIONS in src/types/admin.ts,
 * enforced by /api/admin and mirrored in firestore.rules. The flags below are derived from it
 * so navigation can never offer more than the server allows. The server authorises any
 * fulfilment move with `orders.update_status`; the production/shipping flags only narrow which
 * stage buttons each role sees, to keep the workshop and dispatch views focused.
 */
import { STAFF_ROLES, isStaffRole, roleHasPermission, type StaffRole } from '@/types/admin';

export { STAFF_ROLES, isStaffRole, type StaffRole };

export interface RolePermissions {
  canManageProducts: boolean;
  canManageOrders: boolean;
  canManageProduction: boolean;
  canManageShipping: boolean;
  canManageFinance: boolean;
  canManageCoupons: boolean;
  canModerateReviews: boolean;
  canManageStaff: boolean;
  canViewAuditLogs: boolean;
  canManageSettings: boolean;
  canManageSupport: boolean;
  /** May write order status, assignment and notes (orders.update_status). Support is read-only. */
  canUpdateOrders: boolean;
  canReadB2b: boolean;
}

function derivePermissions(role: StaffRole): RolePermissions {
  const has = (permission: Parameters<typeof roleHasPermission>[1]) => roleHasPermission(role, permission);
  const updatesStatus = has('orders.update_status');
  const handlesTracking = has('orders.tracking');
  const seesCustomers = has('customers.read');
  return {
    canManageProducts: has('catalog.write'),
    canManageOrders: updatesStatus && seesCustomers,
    canManageProduction: updatesStatus && (seesCustomers || !handlesTracking),
    canManageShipping: updatesStatus && handlesTracking,
    canManageFinance: has('orders.refund') || has('reports.export'),
    canManageCoupons: has('coupons.write'),
    canModerateReviews: has('reviews.moderate'),
    canManageStaff: has('staff.manage'),
    canViewAuditLogs: has('audit.read'),
    canManageSettings: has('settings.write'),
    canManageSupport: seesCustomers,
    canUpdateOrders: updatesStatus,
    canReadB2b: has('b2b.read'),
  };
}

export const ROLE_PERMISSIONS = Object.fromEntries(
  STAFF_ROLES.map(role => [role, derivePermissions(role)]),
) as Record<StaffRole, RolePermissions>;

export function formatRole(role: StaffRole): string {
  return role.replace(/_/g, ' ');
}

export type AdminTabId =
  | 'home' | 'orders' | 'products' | 'customers' | 'analytics' | 'marketing' | 'coupons'
  | 'custom-orders' | 'hero-slider' | 'reviews' | 'notifications' | 'roles' | 'audit' | 'settings'
  | 'production' | 'qc' | 'support' | 'b2b';

/** Which admin tabs a role may open. Single source for navigation and the command palette. */
export function canAccessTab(role: StaffRole, tab: AdminTabId): boolean {
  const p = ROLE_PERMISSIONS[role];
  switch (tab) {
    case 'home':
    case 'notifications':
      return true;
    case 'orders':
    case 'custom-orders':
      return p.canManageOrders || p.canManageProduction || p.canManageShipping;
    case 'production':
    case 'qc':
      return p.canManageProduction;
    case 'support':
      return p.canManageSupport;
    case 'b2b':
      return p.canReadB2b;
    case 'customers':
      return p.canManageOrders || p.canManageSupport;
    case 'analytics':
      return p.canManageFinance || p.canManageOrders;
    case 'products':
      return p.canManageProducts;
    case 'marketing':
    case 'coupons':
      return p.canManageCoupons;
    case 'hero-slider':
    case 'settings':
      return p.canManageSettings;
    case 'reviews':
      return p.canModerateReviews;
    case 'roles':
      return p.canManageStaff;
    case 'audit':
      return p.canViewAuditLogs;
    default:
      return false;
  }
}
