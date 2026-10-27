/**
 * Vernox Enterprise Admin Roles, Permissions & Audit Log Types
 */

export type AdminRole = 'super_admin' | 'admin' | 'manager' | 'support';

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
  | 'review'
  | 'inventory'
  | 'config';

export interface AuditLog {
  id: string;
  timestamp: number;
  adminEmail: string;
  adminName: string;
  adminRole: AdminRole;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  details?: Record<string, any>;
  ip?: string;
}

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

export const ROLE_PERMISSIONS: Record<AdminRole, PermissionDefinition> = {
  super_admin: {
    canManageProducts: true,
    canManageInventory: true,
    canManageOrders: true,
    canManageCoupons: true,
    canManageCustomers: true,
    canManageReviews: true,
    canManageAdmins: true,
    canManageSettings: true,
    canViewAuditLogs: true,
    canExportData: true,
    canResetDatabase: true,
  },
  admin: {
    canManageProducts: true,
    canManageInventory: true,
    canManageOrders: true,
    canManageCoupons: true,
    canManageCustomers: true,
    canManageReviews: true,
    canManageAdmins: false,
    canManageSettings: false,
    canViewAuditLogs: true,
    canExportData: true,
    canResetDatabase: false,
  },
  manager: {
    canManageProducts: true,
    canManageInventory: true,
    canManageOrders: true,
    canManageCoupons: true,
    canManageCustomers: false,
    canManageReviews: true,
    canManageAdmins: false,
    canManageSettings: false,
    canViewAuditLogs: false,
    canExportData: false,
    canResetDatabase: false,
  },
  support: {
    canManageProducts: false,
    canManageInventory: false,
    canManageOrders: true, // can update shipping/notes and view orders
    canManageCoupons: false,
    canManageCustomers: false,
    canManageReviews: true,
    canManageAdmins: false,
    canManageSettings: false,
    canViewAuditLogs: false,
    canExportData: false,
    canResetDatabase: false,
  },
};
