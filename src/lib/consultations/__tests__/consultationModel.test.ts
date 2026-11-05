import { describe, expect, it } from 'vitest';
import { products } from '@/lib/catalog';
import type { ProposalItem } from '@/types/consultation';
import { canRequestRevision, catalogueCartLine, consultationSla, creditState, customerStatus, isCreditCode } from '../consultationModel';

const DAY = 24 * 3600_000;
const NOW = Date.parse('2026-11-10T10:00:00Z');

describe('turnaround clock', () => {
  it('counts down, flags the last day and overdue, and stops once proposed', () => {
    expect(consultationSla({ status: 'new', dueAt: NOW + 3 * DAY }, NOW)).toEqual({ level: 'ok', daysLeft: 3 });
    expect(consultationSla({ status: 'in_progress', dueAt: NOW + DAY / 2 }, NOW).level).toBe('due_soon');
    expect(consultationSla({ status: 'new', dueAt: NOW - 2 * DAY }, NOW)).toEqual({ level: 'overdue', daysLeft: -2 });
    expect(consultationSla({ status: 'proposed', dueAt: NOW - 5 * DAY }, NOW).level).toBe('done');
  });
});

describe('credit', () => {
  const credit = { code: 'DESIGN-ABCDEFGH', amountInr: 999, expiresAt: NOW + DAY };
  it('is available until it is used or expires', () => {
    expect(creditState({ credit: null, creditRedeemedAt: null }, NOW)).toBe('none');
    expect(creditState({ credit, creditRedeemedAt: null }, NOW)).toBe('available');
    expect(creditState({ credit, creditRedeemedAt: NOW }, NOW)).toBe('redeemed');
    expect(creditState({ credit, creditRedeemedAt: null }, NOW + 2 * DAY)).toBe('expired');
  });

  it('recognises credit codes', () => {
    expect(isCreditCode('design-abc')).toBe(true);
    expect(isCreditCode('WELCOME10')).toBe(false);
    expect(isCreditCode(undefined)).toBe(false);
  });
});

describe('revision and status wording', () => {
  it('allows one revision, only on a sent proposal', () => {
    expect(canRequestRevision({ status: 'proposed', revisionsUsed: 0 })).toBe(true);
    expect(canRequestRevision({ status: 'proposed', revisionsUsed: 1 })).toBe(false);
    expect(canRequestRevision({ status: 'in_progress', revisionsUsed: 0 })).toBe(false);
  });

  it('describes the state to the customer', () => {
    expect(customerStatus({ status: 'proposed', outcome: null, revisionsUsed: 0 })).toBe('Proposal ready');
    expect(customerStatus({ status: 'in_progress', outcome: null, revisionsUsed: 1 })).toBe('Revising your proposal');
    expect(customerStatus({ status: 'closed', outcome: 'accepted', revisionsUsed: 0 })).toBe('Accepted');
  });
});

describe('proposal items as cart lines', () => {
  const product = products.find(p => p.sizes.length > 1)!;
  const size = product.sizes[1];
  const item = (overrides: Partial<ProposalItem> = {}): ProposalItem => ({
    id: 'i1', wallId: 'w1', kind: 'catalogue', productId: product.id, productName: product.name, sizeLabel: size.label,
    widthMm: size.widthMm, heightMm: size.heightMm, finish: product.finishes[0], designRef: null,
    pose: { cx: 0, cy: 0, rotationDeg: 0 }, previewPath: null, note: '', ...overrides,
  });

  it('builds the catalogue cart line with the size price', () => {
    expect(catalogueCartLine(item(), products)).toMatchObject({
      productId: product.id, sizeLabel: size.label, widthMm: size.widthMm, unitPrice: product.price + size.priceDelta, quantity: 1,
    });
  });

  it('is null when the product, size or finish is no longer offered', () => {
    expect(catalogueCartLine(item({ productId: 'gone' }), products)).toBeNull();
    expect(catalogueCartLine(item({ sizeLabel: 'Huge', widthMm: 1, heightMm: 1 }), products)).toBeNull();
    expect(catalogueCartLine(item({ finish: 'unobtainium' }), products)).toBeNull();
  });
});
