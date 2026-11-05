# Vernox Testing

## Commands
```bash
npm test                     # vitest: unit tests (browser + server)
npm run typecheck:api        # strict typecheck of api/, server/, scripts/
npm run test:rules           # Firestore security rules against the emulator (Firebase CLI + Java)
```

## Server tests (`src/test/*.test.ts`, node environment)
Business logic in `api/_lib` runs against `src/test/support/memoryStore.ts`, an in-memory `DocStore` with Firestore's
transaction semantics (serialised, atomic, reads-before-writes enforced, `create` fails on existing docs).
- `pricing.test.ts` — catalog/size/finish pricing, custom-piece formula, client prices ignored, GST/shipping (`>=` threshold), config overrides.
- `coupons.test.ts` — eligibility, limits, IST dates, category/product restriction using server data.
- `razorpaySignature.test.ts` — checkout and webhook HMAC (raw body vs re-serialised).
- `checkoutIntent.test.ts` — reservation, idempotency (sequential and concurrent), no overselling, provider-failure compensation, coupons.
- `paymentLifecycle.test.ts` — Paid transition + coupon redemption, idempotent confirmations, failed writes surface, webhook
  events (captured, discrepancy, failed, late payment, partial/full refund, unknown order, duplicates), reservation expiry.
- `staffAuth.test.ts` — role claim / verified email / permission checks.
- `firestore.rules.test.ts` — skipped unless `FIRESTORE_EMULATOR_HOST` is set (use `npm run test:rules`).
