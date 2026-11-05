/**
 * Pure queue logic for the workshop consoles: grouping orders by stage, oldest-first ordering,
 * lead-time SLA and stage moves. Statuses come from orderStateMachine so new statuses added there
 * flow through without edits here.
 */
import type { RolePermissions } from '@/lib/auth/permissions';
import type { Order, Product } from '@/types/store';
import { nextClientStatuses, type OrderStatus } from './orderStateMachine';

/** Workshop stages in order. `Paid` is "waiting to start". */
export const PRODUCTION_STAGES = ['Paid', 'In_Design', 'Cutting', 'Finishing', 'Quality_Check'] as const satisfies readonly OrderStatus[];
export const QC_STAGES = ['Quality_Check', 'Packed'] as const satisfies readonly OrderStatus[];

/**
 * COD orders are confirmed (`Confirmed_COD`) rather than `Paid` at checkout; for the workshop both
 * are "waiting to start", so the queue loads and groups them together.
 */
export const workshopStage = (status: OrderStatus): OrderStatus => (status === 'Confirmed_COD' ? 'Paid' : status);

/** Statuses to query for the given workshop stages (adds Confirmed_COD wherever Paid is listed). */
export const workshopQueryStatuses = (stages: readonly OrderStatus[]): OrderStatus[] =>
  stages.includes('Paid') ? [...stages, 'Confirmed_COD'] : [...stages];

export const DEFAULT_LEAD_TIME_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;

/** The happy-path next stage for each workshop stage. */
const FORWARD: Partial<Record<OrderStatus, OrderStatus>> = {
  Paid: 'In_Design', Confirmed_COD: 'In_Design', In_Design: 'Cutting', Cutting: 'Finishing', Finishing: 'Quality_Check', Quality_Check: 'Packed',
};

/** Where a failed QC may send an order back to. */
export const REWORK_TARGETS = ['Cutting', 'Finishing'] as const satisfies readonly OrderStatus[];

export const oldestFirst = (a: Order, b: Order): number => a.placedAt - b.placedAt;

export function groupByStage<S extends OrderStatus>(orders: readonly Order[], stages: readonly S[]): Record<S, Order[]> {
  const groups = Object.fromEntries(stages.map(s => [s, [] as Order[]])) as Record<S, Order[]>;
  for (const order of [...orders].sort(oldestFirst)) {
    const stage = workshopStage(order.status);
    if ((stages as readonly OrderStatus[]).includes(stage)) groups[stage as S].push(order);
  }
  return groups;
}

export function stageCounts<S extends OrderStatus>(orders: readonly Order[], stages: readonly S[]): Record<S, number> {
  const groups = groupByStage(orders, stages);
  return Object.fromEntries(stages.map(s => [s, groups[s].length])) as Record<S, number>;
}

/** The next stage this role may move the order to, or null when there is none (or not permitted). */
export function nextStageFor(status: OrderStatus, perms: RolePermissions): OrderStatus | null {
  const target = FORWARD[status];
  return target && nextClientStatuses(status, perms).includes(target) ? target : null;
}

/** Rework targets this role may use from the current status. */
export function reworkTargetsFor(status: OrderStatus, perms: RolePermissions): OrderStatus[] {
  const allowed = nextClientStatuses(status, perms);
  return REWORK_TARGETS.filter(t => allowed.includes(t));
}

/** Lead time for an order: the longest product lead time among its items, else the store default. */
export function orderLeadTimeDays(order: Pick<Order, 'items'>, products: readonly Pick<Product, 'id' | 'leadTimeDays'>[], defaultDays: number): number {
  const byId = new Map(products.map(p => [p.id, p.leadTimeDays]));
  const days = order.items.map(i => byId.get(i.productId)).filter((d): d is number => typeof d === 'number' && d > 0);
  return days.length ? Math.max(...days) : defaultDays;
}

export type SlaLevel = 'ok' | 'due_soon' | 'overdue';

export interface SlaState {
  level: SlaLevel;
  ageDays: number;
  leadTimeDays: number;
  /** Whole days left before the lead time is used up; negative when overdue. */
  daysLeft: number;
}

/** Age is measured from the order date; "due soon" is the final day of the lead time. */
export function slaState(placedAt: number, leadTimeDays: number, now: number): SlaState {
  const ageDays = Math.max(0, Math.floor((now - placedAt) / DAY_MS));
  const daysLeft = leadTimeDays - ageDays;
  const level: SlaLevel = daysLeft < 0 ? 'overdue' : daysLeft <= 1 ? 'due_soon' : 'ok';
  return { level, ageDays, leadTimeDays, daysLeft };
}

export function defaultLeadTimeDays(storeConfig: object): number {
  const value = (storeConfig as { defaultLeadTimeDays?: unknown }).defaultLeadTimeDays;
  return typeof value === 'number' && value > 0 ? value : DEFAULT_LEAD_TIME_DAYS;
}

export const isAssignedTo = (order: Pick<Order, 'assignedTo'>, who: string): boolean =>
  Boolean(order.assignedTo) && order.assignedTo?.toLowerCase() === who.toLowerCase();
