/**
 * Volume (bulk) discount tiers — the definition shared by the server (api/_lib/storeConfig.ts reads
 * `settings/store.volumeDiscounts`, api/_lib/pricing.ts applies it) and the storefront (tier labels,
 * the "add N more pieces" nudge, the Trade page table, the Settings editor).
 *
 * Pure and dependency-free so both the Vite build and the Node API typecheck can import it. Only tier
 * *selection* lives here; the discount amount in paise is computed by the server alone
 * (api/_lib/pricing.ts `volumeDiscountFor`) and the browser shows the server's figure.
 *
 * Rule (ROADMAP.md "Business and tax decisions"): the tier is chosen by the total number of pieces in
 * the order (catalogue and studio lines together; a service line such as the design consultation does
 * not count), and its percent comes off the GST-inclusive merchandise subtotal, before the GST split.
 */

export interface VolumeDiscountTier {
  /** Pieces in the order at which this tier starts (inclusive). */
  minUnits: number;
  /** Discount on the merchandise subtotal, percent (at most 2 decimals). */
  percent: number;
}

/** Tiers used when `settings/store.volumeDiscounts` is not set. An empty array in settings switches the discount off. */
export const DEFAULT_VOLUME_DISCOUNTS: readonly VolumeDiscountTier[] = [
  { minUnits: 10, percent: 5 },
  { minUnits: 25, percent: 10 },
  { minUnits: 50, percent: 15 },
];

export const VOLUME_DISCOUNT_LIMITS = { maxTiers: 6, minUnits: 2, maxUnits: 10_000, maxPercent: 50 } as const;

const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/**
 * Validates a `volumeDiscounts` value. Returns the tiers sorted by `minUnits`, or the first problem in words.
 * Tiers must start at distinct piece counts and a larger order must never get a smaller discount.
 */
export function parseVolumeDiscounts(raw: unknown): { ok: true; tiers: VolumeDiscountTier[] } | { ok: false; error: string } {
  const { maxTiers, minUnits, maxUnits, maxPercent } = VOLUME_DISCOUNT_LIMITS;
  if (!Array.isArray(raw)) return { ok: false, error: 'Volume discounts must be a list of tiers.' };
  if (raw.length > maxTiers) return { ok: false, error: `Use at most ${maxTiers} volume discount tiers.` };
  const tiers: VolumeDiscountTier[] = [];
  for (const entry of raw) {
    const t = entry as Partial<Record<keyof VolumeDiscountTier, unknown>> | null;
    const units = t?.minUnits;
    const percent = t?.percent;
    if (typeof units !== 'number' || !Number.isInteger(units) || units < minUnits || units > maxUnits) {
      return { ok: false, error: `Each tier starts at a whole number of pieces from ${minUnits} to ${maxUnits}.` };
    }
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0 || percent > maxPercent || !twoDecimals(percent)) {
      return { ok: false, error: `Each tier's discount is above 0% and at most ${maxPercent}%, with at most 2 decimals.` };
    }
    tiers.push({ minUnits: units, percent });
  }
  tiers.sort((a, b) => a.minUnits - b.minUnits);
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].minUnits === tiers[i - 1].minUnits) return { ok: false, error: `Two tiers start at ${tiers[i].minUnits} pieces.` };
    if (tiers[i].percent <= tiers[i - 1].percent) {
      return { ok: false, error: 'A tier for more pieces must give a larger discount than the tier below it.' };
    }
  }
  return { ok: true, tiers };
}

/** Tiers from a stored settings value: absent = defaults; invalid = defaults (reported through `onInvalid`). */
export function resolveVolumeDiscounts(raw: unknown, onInvalid?: (error: string) => void): VolumeDiscountTier[] {
  if (raw === undefined || raw === null) return DEFAULT_VOLUME_DISCOUNTS.map(t => ({ ...t }));
  const parsed = parseVolumeDiscounts(raw);
  if ('tiers' in parsed) return parsed.tiers;
  onInvalid?.(parsed.error);
  return DEFAULT_VOLUME_DISCOUNTS.map(t => ({ ...t }));
}

/** Discount in basis points (integer), so the server's paise arithmetic never touches a float percent. */
export const tierBps = (tier: VolumeDiscountTier) => Math.round(tier.percent * 100);

/** The tier an order of `units` pieces earns, or null. `tiers` sorted ascending (as parse/resolve return them). */
export function volumeTierFor(units: number, tiers: readonly VolumeDiscountTier[]): VolumeDiscountTier | null {
  let best: VolumeDiscountTier | null = null;
  for (const t of tiers) if (units >= t.minUnits) best = t;
  return best;
}

/** The next tier above what `units` pieces earn, and how many more pieces reach it; null at the top tier. */
export function nextVolumeTier(units: number, tiers: readonly VolumeDiscountTier[]): { tier: VolumeDiscountTier; unitsToGo: number } | null {
  const next = tiers.find(t => t.minUnits > units);
  return next ? { tier: next, unitsToGo: next.minUnits - units } : null;
}

const formatPercent = (percent: number) => `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, '')}%`;

/** "Bulk discount 10% (25+ pieces)": cart, checkout, receipts and the GST invoice note all use this wording. */
export function volumeDiscountLabel(tier: Pick<VolumeDiscountTier, 'minUnits' | 'percent'>): string {
  return `Bulk discount ${formatPercent(tier.percent)} (${tier.minUnits}+ pieces)`;
}

/** "Add 3 more pieces to save 10%". */
export function volumeNudge(next: { tier: VolumeDiscountTier; unitsToGo: number }): string {
  return `Add ${next.unitsToGo} more ${next.unitsToGo === 1 ? 'piece' : 'pieces'} to save ${formatPercent(next.tier.percent)}`;
}
