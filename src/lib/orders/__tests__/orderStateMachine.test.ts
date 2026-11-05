import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@/lib/auth/permissions';
import {
  ORDER_STATUSES, ORDER_TRANSITIONS, assertClientTransition, isRevenueStatus, nextClientStatuses, normalizeOrderStatus,
} from '../orderStateMachine';

describe('order state machine', () => {
  it('maps legacy statuses onto the current set', () => {
    expect(normalizeOrderStatus('Pending')).toBe('Pending_Payment');
    expect(normalizeOrderStatus('Designing')).toBe('In_Design');
    expect(normalizeOrderStatus('Finished')).toBe('Finishing');
    expect(normalizeOrderStatus('Shipped')).toBe('Shipped');
    expect(normalizeOrderStatus('nonsense')).toBe('Pending_Payment');
  });

  it('only references known statuses in the transition map', () => {
    for (const status of ORDER_STATUSES) {
      for (const next of ORDER_TRANSITIONS[status]) expect(ORDER_STATUSES).toContain(next);
    }
  });

  it('never lets the client set payment or refund outcomes', () => {
    const perms = ROLE_PERMISSIONS.super_admin;
    expect(nextClientStatuses('Pending_Payment', perms)).toEqual(['Cancelled']);
    expect(() => assertClientTransition('Pending_Payment', 'Paid', perms)).toThrow();
    expect(() => assertClientTransition('Paid', 'Refunded', perms)).toThrow();
  });

  it('rejects skipped steps and applies role limits', () => {
    expect(() => assertClientTransition('Paid', 'Shipped', ROLE_PERMISSIONS.super_admin)).toThrow();
    expect(nextClientStatuses('Paid', ROLE_PERMISSIONS.production)).toEqual(['In_Design', 'Cutting']);
    expect(nextClientStatuses('Packed', ROLE_PERMISSIONS.production)).toEqual([]);
    expect(nextClientStatuses('Packed', ROLE_PERMISSIONS.shipping)).toEqual(['Shipped']);
    expect(nextClientStatuses('Paid', ROLE_PERMISSIONS.support)).toEqual([]);
  });

  it('counts only paid, retained orders as revenue', () => {
    expect(isRevenueStatus('Pending_Payment')).toBe(false);
    expect(isRevenueStatus('Cancelled')).toBe(false);
    expect(isRevenueStatus('Delivered')).toBe(true);
  });
});
