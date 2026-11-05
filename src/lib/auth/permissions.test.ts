import { describe, expect, it } from 'vitest';
import { STAFF_ROLES } from '@/types/admin';
import { canAccessTab, ROLE_PERMISSIONS, type AdminTabId } from './permissions';

const roles = (tab: AdminTabId) => STAFF_ROLES.filter(r => canAccessTab(r, tab));

describe('console tab access', () => {
  it('shows workshop consoles to production and order managers (and admins), not to others', () => {
    for (const tab of ['production', 'qc'] as const) {
      expect(roles(tab)).toEqual(['super_admin', 'admin', 'order_manager', 'production']);
    }
  });

  it('shows support to roles that can read customers', () => {
    expect(roles('support')).toEqual(['super_admin', 'admin', 'order_manager', 'support']);
  });

  it('shows trade enquiries to b2b.read roles only', () => {
    expect(roles('b2b')).toEqual(['super_admin', 'admin', 'order_manager', 'support']);
    expect(canAccessTab('production', 'b2b')).toBe(false);
    expect(canAccessTab('finance', 'b2b')).toBe(false);
  });

  it('shows shipping, returns and finance consoles by permission', () => {
    expect(roles('shipping')).toEqual(['super_admin', 'admin', 'order_manager', 'shipping']);
    expect(roles('returns')).toEqual(['super_admin', 'admin', 'order_manager', 'production', 'shipping']);
    expect(roles('finance')).toEqual(['super_admin', 'admin', 'finance']);
    expect(ROLE_PERMISSIONS.finance.canRefund).toBe(true);
    expect(ROLE_PERMISSIONS.shipping.canRefund).toBe(false);
    expect(ROLE_PERMISSIONS.shipping.canTrackShipments).toBe(true);
  });

  it('keeps catalog and staff management on their own permissions', () => {
    expect(roles('products')).toEqual(['super_admin', 'admin', 'catalog_manager']);
    expect(roles('roles')).toEqual(['super_admin']);
  });

  it('lets support read orders but not write them', () => {
    expect(ROLE_PERMISSIONS.support.canUpdateOrders).toBe(false);
    expect(ROLE_PERMISSIONS.production.canUpdateOrders).toBe(true);
    expect(ROLE_PERMISSIONS.finance.canUpdateOrders).toBe(false);
  });
});
