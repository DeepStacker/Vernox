/**
 * Checkout request limits shared by the server (api/_lib/checkout.ts, which enforces them)
 * and the studio (which plans cart lines so a batch never exceeds them).
 * Dependency-free so both the Vite build and the Node API typecheck can import it.
 */
export const ORDER_LIMITS = {
  /** Cart lines per order. */
  maxLines: 50,
  /** Units per line. */
  maxQuantityPerLine: 100,
  /** Serialised design JSON per line, characters. */
  maxDesignRefChars: 200_000,
  /** Serialised design JSON per order, characters; keeps the order document under Firestore's 1 MiB limit. */
  maxTotalDesignRefChars: 700_000,
} as const;
