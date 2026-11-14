// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { orderReferenceSchema, resolveOrderReference } from '../../api/_lib/orderAccess';
import { paidOrder, seededStore } from './support/serverFixtures';

describe('order lookup by the number customers see', () => {
  it('resolves VX numbers in any case and spacing, passes ids through, and misses unknown numbers', async () => {
    const store = seededStore();
    const { orderId } = await paidOrder(store);
    const number = (store.read(`orders/${orderId}`) as { orderNumber: string }).orderNumber;
    expect(await resolveOrderReference(store, number.toLowerCase())).toBe(orderId);
    expect(await resolveOrderReference(store, ` ${number} `)).toBe(orderId);
    expect(await resolveOrderReference(store, orderId)).toBe(orderId);
    expect(await resolveOrderReference(store, 'VX-20990101-ZZZZZZ')).toBeNull();
    expect(orderReferenceSchema.safeParse(number.toLowerCase()).success).toBe(true);
    expect(orderReferenceSchema.safeParse('VX-1').success).toBe(false);
  });
});
