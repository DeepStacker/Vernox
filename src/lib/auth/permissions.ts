/**
 * Staff roles and the permission map.
 *
 * TEMPORARY COPY: the backend branch is extending src/types/admin.ts with the same
 * `StaffRole` and `ROLE_PERMISSIONS` exports. At merge, delete the definitions below and
 * re-export them from '@/types/admin' so there is a single source of truth.
 */
export type StaffRole =
  | 'super_admin'
  | 'admin'
  | 'catalog_manager'
  | 'order_manager'
  | 'production'
  | 'shipping'
  | 'finance'
  | 'support';

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
}

const NONE: RolePermissions = {
  canManageProducts: false,
  canManageOrders: false,
  canManageProduction: false,
  canManageShipping: false,
  canManageFinance: false,
  canManageCoupons: false,
  canModerateReviews: false,
  canManageStaff: false,
  canViewAuditLogs: false,
  canManageSettings: false,
  canManageSupport: false,
};

export const ROLE_PERMISSIONS: Record<StaffRole, RolePermissions> = {
  super_admin: {
    canManageProducts: true, canManageOrders: true, canManageProduction: true,
    canManageShipping: true, canManageFinance: true, canManageCoupons: true,
    canModerateReviews: true, canManageStaff: true, canViewAuditLogs: true,
    canManageSettings: true, canManageSupport: true,
  },
  admin: {
    canManageProducts: true, canManageOrders: true, canManageProduction: true,
    canManageShipping: true, canManageFinance: true, canManageCoupons: true,
    canModerateReviews: true, canManageStaff: false, canViewAuditLogs: false,
    canManageSettings: true, canManageSupport: true,
  },
  catalog_manager: { ...NONE, canManageProducts: true, canModerateReviews: true },
  order_manager: { ...NONE, canManageOrders: true, canManageSupport: true },
  production: { ...NONE, canManageProduction: true },
  shipping: { ...NONE, canManageShipping: true },
  finance: { ...NONE, canManageFinance: true, canManageCoupons: true },
  support: { ...NONE, canManageSupport: true, canModerateReviews: true },
};

export const STAFF_ROLES = Object.keys(ROLE_PERMISSIONS) as StaffRole[];

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && value in ROLE_PERMISSIONS;
}

export function formatRole(role: StaffRole): string {
  return role.replace(/_/g, ' ');
}

export type AdminTabId =
  | 'home' | 'orders' | 'products' | 'customers' | 'analytics' | 'marketing' | 'coupons'
  | 'custom-orders' | 'hero-slider' | 'reviews' | 'notifications' | 'roles' | 'audit' | 'settings';

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
