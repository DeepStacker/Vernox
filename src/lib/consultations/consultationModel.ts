/**
 * Design consultation: pure helpers shared by the customer view and the designer queue (no Firebase,
 * no React). Document shapes: src/types/consultation.ts; workflow: api/_lib/proposals.ts.
 */
import type { CartItem } from '@/lib/cartContext';
import type { Product } from '@/lib/catalog';
import {
  CONSULTATION_CREDIT_PREFIX,
  FREE_REVISIONS,
  type ConsultationDoc,
  type ConsultationSettings,
  type ConsultationStatus,
  type ProposalItem,
} from '@/types/consultation';
import { DEFAULT_CONSULTATION_SETTINGS } from '@/types/consultation';

const DAY_MS = 24 * 3600_000;

export const STATUS_LABEL: Record<ConsultationStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  proposed: 'Proposed',
  closed: 'Closed',
};

/** Customer-facing wording of a consultation's state. */
export function customerStatus(c: Pick<ConsultationDoc, 'status' | 'outcome' | 'revisionsUsed'>): string {
  if (c.status === 'closed') return c.outcome === 'accepted' ? 'Accepted' : 'Closed';
  if (c.status === 'proposed') return 'Proposal ready';
  return c.revisionsUsed > 0 ? 'Revising your proposal' : 'Designer at work';
}

export type SlaLevel = 'ok' | 'due_soon' | 'overdue' | 'done';

export interface ConsultationSla {
  level: SlaLevel;
  /** Whole days left; negative when overdue. */
  daysLeft: number;
}

/** Turnaround clock for the designer queue: due soon is the last day, nothing is due once proposed or closed. */
export function consultationSla(c: Pick<ConsultationDoc, 'status' | 'dueAt'>, now: number): ConsultationSla {
  if (c.status === 'proposed' || c.status === 'closed') return { level: 'done', daysLeft: 0 };
  const daysLeft = Math.ceil((c.dueAt - now) / DAY_MS);
  return { level: now > c.dueAt ? 'overdue' : c.dueAt - now <= DAY_MS ? 'due_soon' : 'ok', daysLeft };
}

export type CreditState = 'none' | 'available' | 'redeemed' | 'expired';

export function creditState(c: Pick<ConsultationDoc, 'credit' | 'creditRedeemedAt'>, now: number): CreditState {
  if (!c.credit) return 'none';
  if (c.creditRedeemedAt) return 'redeemed';
  return now > c.credit.expiresAt ? 'expired' : 'available';
}

export const canRequestRevision = (c: Pick<ConsultationDoc, 'status' | 'revisionsUsed'>) =>
  c.status === 'proposed' && c.revisionsUsed < FREE_REVISIONS;

export const isCreditCode = (code: string | undefined | null) => !!code && code.toUpperCase().startsWith(CONSULTATION_CREDIT_PREFIX);

/** Settings as shown to customers: stored overrides over the defaults (the server applies the same defaults). */
export function consultationSettings(stored: Partial<ConsultationSettings> | undefined): ConsultationSettings {
  return { ...DEFAULT_CONSULTATION_SETTINGS, ...(stored ?? {}) };
}

export type ProposalCartLine = Omit<CartItem, 'id' | 'quantity'> & { quantity: number };

/**
 * Cart line for a catalogue item of a proposal. Null when the product is no longer in the catalogue or no
 * longer offers that size and finish; the cart price shown is the catalogue's, and checkout re-prices on the server.
 */
export function catalogueCartLine(item: ProposalItem, products: readonly Product[]): ProposalCartLine | null {
  const product = products.find(p => p.id === item.productId);
  if (!product) return null;
  const size = product.sizes.find(s => s.label === item.sizeLabel) ?? product.sizes.find(s => s.widthMm === item.widthMm && s.heightMm === item.heightMm);
  if (product.sizes.length > 0 && !size) return null;
  if (product.finishes.length > 0 && !product.finishes.includes(item.finish as Product['finishes'][number])) return null;
  return {
    productId: product.id,
    productName: product.name,
    productSlug: product.slug,
    shapeId: product.shapeId,
    sizeLabel: size?.label ?? '',
    widthMm: size?.widthMm ?? item.widthMm,
    heightMm: size?.heightMm ?? item.heightMm,
    finish: item.finish,
    unitPrice: product.price + (size?.priceDelta ?? 0),
    quantity: 1,
  };
}
