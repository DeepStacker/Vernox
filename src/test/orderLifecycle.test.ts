// @vitest-environment node
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import * as server from '../../api/_lib/orderLifecycle';
import * as client from '@/lib/orders/orderStateMachine';
import { LEGACY_ORDER_STATUS_MAP, STAFF_WORKSHOP_MOVES, type OrderStatus } from '@/types/orderStatus';

/** Parses the `staffWorkshopMoves()` map literal out of firestore.rules. */
function rulesWorkshopMoves(): Record<string, string[]> {
  const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
  const body = rules.match(/function staffWorkshopMoves\(\)\s*\{\s*return\s*\{([\s\S]*?)\};\s*\}/)?.[1];
  if (!body) throw new Error('staffWorkshopMoves() not found in firestore.rules');
  const out: Record<string, string[]> = {};
  for (const m of body.matchAll(/'([A-Za-z_]+)'\s*:\s*\[([^\]]*)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/'([A-Za-z_]+)'/g)].map(x => x[1]);
  }
  return out;
}

describe('order state machine: one definition everywhere', () => {
  it('server and client use the same statuses and transitions', () => {
    expect(server.ORDER_STATUSES).toBe(client.ORDER_STATUSES);
    for (const from of client.ORDER_STATUSES) {
      for (const to of client.ORDER_STATUSES) {
        expect([from, to, client.isTransitionAllowed(from, to)]).toEqual([from, to, server.canTransition(from, to)]);
      }
    }
  });

  it('firestore.rules staff moves equal STAFF_WORKSHOP_MOVES (legacy statuses move like their mapping)', () => {
    const expected: Record<string, string[]> = { ...(STAFF_WORKSHOP_MOVES as Record<string, string[]>) };
    for (const [legacy, current] of Object.entries(LEGACY_ORDER_STATUS_MAP)) {
      const moves = STAFF_WORKSHOP_MOVES[current as OrderStatus];
      if (moves) expected[legacy] = [...moves];
    }
    const actual = rulesWorkshopMoves();
    const sorted = (m: Record<string, string[]>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v].sort()]).sort());
    expect(sorted(actual)).toEqual(sorted(expected));
  });

  it('lets staff write directly only the workshop stages, including QC rework', () => {
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
