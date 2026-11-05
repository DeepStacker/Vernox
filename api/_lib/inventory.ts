/**
 * Stock reservation bookkeeping inside transactions.
 *
 * Stock is changed only with atomic increments, never by writing back a
 * previously read value, so concurrent reservations and releases compose.
 * Firestore transactions require every read before the first write, hence the
 * split into plan* (reads) and apply* (writes) steps.
 */
import type { OrderDoc, StockReservation } from './orders';
import { increment, type StoreTransaction } from './store';

export interface StockPlan {
  /** Items whose product document still exists (deleted products are skipped). */
  items: StockReservation['items'];
  /** Products whose stock would go negative (only meaningful for commits). */
  shortfalls: string[];
}

async function planFor(tx: StoreTransaction, items: StockReservation['items'], checkShortfall: boolean): Promise<StockPlan> {
  const docs = await Promise.all(items.map(i => tx.get(`products/${i.productId}`)));
  const plan: StockPlan = { items: [], shortfalls: [] };
  items.forEach((item, idx) => {
    const doc = docs[idx];
    if (!doc) {
      console.error(`[inventory] product ${item.productId} no longer exists; skipping stock adjustment`);
      return;
    }
    if (doc.trackInventory === false) return;
    plan.items.push(item);
    if (checkShortfall && (typeof doc.stock === 'number' ? doc.stock : 0) < item.quantity) {
      plan.shortfalls.push(item.productId);
    }
  });
  return plan;
}

/** Reads needed to give back a held reservation. Empty plan if nothing is held. */
export function planRelease(tx: StoreTransaction, order: OrderDoc): Promise<StockPlan> {
  if (order.stockReservation?.status !== 'held') return Promise.resolve({ items: [], shortfalls: [] });
  return planFor(tx, order.stockReservation.items, false);
}

/** Reads needed to take stock again for an order whose reservation was already released (late payment). */
export function planRecommit(tx: StoreTransaction, order: OrderDoc): Promise<StockPlan> {
  if (order.stockReservation?.status !== 'released') return Promise.resolve({ items: [], shortfalls: [] });
  return planFor(tx, order.stockReservation.items, true);
}

export function applyStockDelta(tx: StoreTransaction, plan: StockPlan, sign: 1 | -1, now: number) {
  for (const item of plan.items) {
    tx.update(`products/${item.productId}`, { stock: increment(sign * item.quantity), updatedAt: now });
  }
}
