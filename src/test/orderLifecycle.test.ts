// @vitest-environment node
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import * as server from '../../api/_lib/orderLifecycle';
import * as client from '@/lib/orders/orderStateMachine';
import { STAFF_WORKSHOP_MOVES } from '@/types/orderStatus';

describe('order state machine: one definition everywhere', () => {
  it('server and client use the same statuses and transitions', () => {
    expect(server.ORDER_STATUSES).toBe(client.ORDER_STATUSES);
    for (const from of client.ORDER_STATUSES) {
      for (const to of client.ORDER_STATUSES) {
        expect([from, to, client.isTransitionAllowed(from, to)]).toEqual([from, to, server.canTransition(from, to)]);
      }
    }
  });

  it('firestore.rules let clients write no order status: moves go through UPDATE_ORDER_STATUS', () => {
    const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
    const orders = rules.slice(rules.indexOf('match /orders/{orderId}'), rules.indexOf('// ---------- B2B'));
    expect(orders).toContain("changedKeys().hasOnly(['assignedTo', 'notes', 'updatedAt'])");
    expect(orders).not.toMatch(/'status'|statusHistory|'tracking'/);
  });

  it('staff move orders only through the workshop stages, including QC rework', () => {
    expect([...server.STAFF_SETTABLE_STATUSES].sort()).toEqual(['Cutting', 'Finishing', 'In_Design', 'Packed', 'Quality_Check']);
    expect(STAFF_WORKSHOP_MOVES.Quality_Check).toEqual(['Packed', 'Finishing', 'Cutting']);
  });

  it('lets customers cancel only before production', () => {
    expect(server.CUSTOMER_CANCELLABLE_STATUSES).toEqual(['Paid', 'Confirmed_COD']);
    expect(server.canTransition('In_Design', 'Cancelled')).toBe(true); // staff may still cancel
    expect(server.canTransition('Shipped', 'Cancelled')).toBe(false);
    expect(server.canTransition('Confirmed_COD', 'Refunded')).toBe(false); // nothing collected yet
  });

  it('reads legacy Phase 1 statuses as their current equivalents', () => {
    expect(server.canTransition('Designing', 'Cutting')).toBe(true);
    expect(server.canTransition('Finished', 'Quality_Check')).toBe(true);
    expect(server.isPaidStatus('Finished')).toBe(true);
    expect(client.normalizeOrderStatus('Finished')).toBe('Finishing');
    expect(server.ORDER_STATUSES).not.toContain('Designing');
  });
});
