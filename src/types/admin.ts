/**
 * Vernox staff roles, permissions and audit-log types.
 *
 * SINGLE SOURCE OF TRUTH for role-based access control. It is imported by the
 * frontend (to show/hide admin UI) and by the serverless API (api/_lib/auth.ts),
 * which is what actually enforces it. firestore.rules cannot import TypeScript,
 * so its role helpers mirror STAFF_ROLE_PERMISSIONS by hand; when you change this
 * map, update the matching helper in firestore.rules and its rules tests.
 *
 * A staff member's role is a Firebase Auth custom claim (`role`) set only by the
 * server (`SET_STAFF_ROLE` admin action or scripts/grant-super-admin.ts). It is
 * mirrored in `staff/{uid}` for listing; the claim is authoritative.
 */

export const STAFF_ROLES = [
  'super_admin',
  'admin',
  'catalog_manager',
  'order_manager',
  'production',
  'shipping',
  'finance',
  'support',
  'designer',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
  'catalog.write', // products, categories, topics
  'inventory.write', // stock adjustments
  'settings.write', // settings/* incl. tax, shipping and custom-piece rates
  'orders.read',
  'orders.create', // staff-entered orders: counter sale, phone, WhatsApp, email, trade (CREATE_STAFF_ORDER)
  'orders.update_status', // fulfilment status, notes, assignment
  'orders.tracking', // carrier tracking
  'orders.refund',
  'coupons.read',
  'coupons.write',
  'reviews.moderate',
  'customers.read',
  'b2b.read',
  'tickets.read', // contact-form support tickets
  'tickets.write', // reply notes and status changes (server-side only)
  'consultations.read', // design consultations: walls, photos, proposals
  'consultations.manage', // claim, draft and send proposals
  'reports.export',
  'staff.read',
  'staff.manage', // grant/revoke roles
  'audit.read',
  'integrations.manage', // third-party keys entered in the app (Settings > Integrations); super admin only
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

export const STAFF_ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter(p => p !== 'staff.manage' && p !== 'audit.read' && p !== 'integrations.manage'),
  catalog_manager: ['catalog.write', 'inventory.write', 'reviews.moderate'],
  order_manager: ['orders.read', 'orders.create', 'orders.update_status', 'orders.tracking', 'customers.read', 'b2b.read', 'tickets.read', 'tickets.write'],
  production: ['orders.read', 'orders.update_status'],
  shipping: ['orders.read', 'orders.update_status', 'orders.tracking'],
  finance: ['orders.read', 'orders.refund', 'coupons.read', 'reports.export'],
  support: ['orders.read', 'orders.create', 'customers.read', 'reviews.moderate', 'b2b.read', 'coupons.read', 'tickets.read', 'tickets.write'],
  // The catalogue is world-readable, so a designer needs no catalogue permission to pick products.
  designer: ['consultations.read', 'consultations.manage'],
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

export function roleHasPermission(role: unknown, permission: Permission): boolean {
  return isStaffRole(role) && STAFF_ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * `manager` is a legacy role from the previous shared-password admin login. The
 * server never grants it and grants it no permissions; it remains in the union
 * only until the admin UI migrates to STAFF_ROLES.
 */
export type AdminRole = StaffRole | 'manager';

/** Mirror of a staff member's role claim, stored at `staff/{uid}` (server-written). */
export interface StaffMember {
  uid: string;
  email: string;
  name?: string;
  role: StaffRole | null; // null = access revoked
  updatedAt: number;
  updatedBy: string; // uid of the super_admin who made the change, or 'bootstrap-script'
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  status: 'active' | 'suspended';
  createdAt: number;
  lastLoginAt?: number;
  assignedBy?: string;
}

export type AuditTargetType =
  | 'coupon'
  | 'order'
  | 'product'
  | 'category'
  | 'customer'
  | 'settings'
  | 'auth'
  | 'admin'
  | 'staff'
  | 'review'
  | 'ticket'
  | 'inventory'
  | 'consultation'
  | 'config';

export interface AuditLog {
  id: string;
  timestamp: number;
  actorUid?: string;
  adminEmail: string;
  adminName: string;
  adminRole: AdminRole | 'system';
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  details?: Record<string, unknown>;
  ip?: string;
  /** 'server' = recorded by the API itself; 'client_reported' = LOG_AUDIT from a staff UI. */
  source?: 'server' | 'client_reported';
}

/** Legacy boolean view of the permission map, kept for the existing admin UI matrix. */
export interface PermissionDefinition {
  canManageProducts: boolean;
  canManageInventory: boolean;
  canManageOrders: boolean;
  canManageCoupons: boolean;
  canManageCustomers: boolean;
  canManageReviews: boolean;
  canManageAdmins: boolean;
  canManageSettings: boolean;
  canViewAuditLogs: boolean;
  canExportData: boolean;
  canResetDatabase: boolean;
}

function toLegacyDefinition(role: AdminRole): PermissionDefinition {
  const has = (p: Permission) => roleHasPermission(role, p);
  return {
    canManageProducts: has('catalog.write'),
    canManageInventory: has('inventory.write'),
    canManageOrders: has('orders.update_status'),
    canManageCoupons: has('coupons.write'),
    canManageCustomers: has('customers.read'),
    canManageReviews: has('reviews.moderate'),
    canManageAdmins: has('staff.manage'),
    canManageSettings: has('settings.write'),
    canViewAuditLogs: has('audit.read'),
    canExportData: has('reports.export'),
    canResetDatabase: false, // no such operation exists server-side
  };
}

/** Derived from STAFF_ROLE_PERMISSIONS; do not edit by hand. */
export const ROLE_PERMISSIONS: Record<AdminRole, PermissionDefinition> = Object.fromEntries(
  [...STAFF_ROLES, 'manager' as const].map(role => [role, toLegacyDefinition(role)]),
) as Record<AdminRole, PermissionDefinition>;
