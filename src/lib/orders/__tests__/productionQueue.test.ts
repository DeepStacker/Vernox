import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@/lib/auth/permissions';
import type { Order, OrderItem } from '@/types/store';
import type { OrderStatus } from '../orderStateMachine';
import {
  DEFAULT_LEAD_TIME_DAYS, PRODUCTION_STAGES, defaultLeadTimeDays, groupByStage, isAssignedTo, nextStageFor, orderLeadTimeDays,
  reworkTargetsFor, slaState, stageCounts,
} from '../productionQueue';

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 10, 10);
const item = (productId: string): OrderItem => ({
  id: productId, productId, productName: productId, productSlug: '', shapeId: '', sizeLabel: '', widthMm: 0, heightMm: 0, finish: '', unitPrice: 1, quantity: 1, lineTotal: 1,
});
const order = (id: string, status: OrderStatus, ageDays: number, items: OrderItem[] = [item('p1')]): Order => ({
  id, email: 'a@b.in', status, placedAt: NOW - ageDays * DAY, items, subtotal: 0, discountTotal: 0, shippingTotal: 0, taxTotal: 0, total: 0, statusHistory: [],
});

describe('production queue', () => {
  it('groups by stage, oldest first, ignoring other statuses', () => {
    const groups = groupByStage([order('new', 'Cutting', 1), order('old', 'Cutting', 5), order('x', 'Shipped', 9), order('p', 'Paid', 2)], PRODUCTION_STAGES);
    expect(groups.Cutting.map(o => o.id)).toEqual(['old', 'new']);
    expect(groups.Paid.map(o => o.id)).toEqual(['p']);
    expect(Object.values(groups).flat()).toHaveLength(3);
  });

  it('counts per stage including empty ones', () => {
    expect(stageCounts([order('a', 'Finishing', 1)], PRODUCTION_STAGES)).toEqual({ Paid: 0, In_Design: 0, Cutting: 0, Finishing: 1, Quality_Check: 0 });
  });

  it('offers the next stage only when the role may move there', () => {
    expect(nextStageFor('Paid', ROLE_PERMISSIONS.production)).toBe('In_Design');
    expect(nextStageFor('Quality_Check', ROLE_PERMISSIONS.production)).toBe('Packed');
    expect(nextStageFor('Packed', ROLE_PERMISSIONS.production)).toBeNull();
    expect(nextStageFor('Paid', ROLE_PERMISSIONS.support)).toBeNull();
    expect(nextStageFor('Paid', ROLE_PERMISSIONS.finance)).toBeNull();
  });

  it('limits rework targets by the state machine and role', () => {
    expect(reworkTargetsFor('Quality_Check', ROLE_PERMISSIONS.production)).toEqual(['Finishing']);
    expect(reworkTargetsFor('Quality_Check', ROLE_PERMISSIONS.support)).toEqual([]);
  });

  it('uses the longest product lead time, else the default', () => {
    const products = [{ id: 'p1', leadTimeDays: 5 }, { id: 'p2', leadTimeDays: 12 }, { id: 'p3' }];
    expect(orderLeadTimeDays(order('o', 'Paid', 0, [item('p1'), item('p2')]), products, 7)).toBe(12);
    expect(orderLeadTimeDays(order('o', 'Paid', 0, [item('p3'), item('custom')]), products, 7)).toBe(7);
  });

  it('computes SLA levels', () => {
    expect(slaState(NOW - 2 * DAY, 7, NOW)).toMatchObject({ level: 'ok', daysLeft: 5, ageDays: 2 });
    expect(slaState(NOW - 6 * DAY, 7, NOW).level).toBe('due_soon');
    expect(slaState(NOW - 7 * DAY, 7, NOW)).toMatchObject({ level: 'due_soon', daysLeft: 0 });
    expect(slaState(NOW - 9 * DAY, 7, NOW)).toMatchObject({ level: 'overdue', daysLeft: -2 });
    expect(slaState(NOW + DAY, 7, NOW).ageDays).toBe(0);
  });

  it('reads the default lead time from settings or falls back to 7', () => {
    expect(defaultLeadTimeDays({ defaultLeadTimeDays: 10 })).toBe(10);
    expect(defaultLeadTimeDays({ defaultLeadTimeDays: 'x' })).toBe(DEFAULT_LEAD_TIME_DAYS);
    expect(defaultLeadTimeDays({})).toBe(7);
  });

  it('matches assignment case-insensitively and never matches an empty assignee', () => {
    expect(isAssignedTo({ assignedTo: 'A@Vernox.in' }, 'a@vernox.in')).toBe(true);
    expect(isAssignedTo({ assignedTo: '' }, '')).toBe(false);
  });
});
