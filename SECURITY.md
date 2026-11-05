# Vernox Security Model

## Trust boundaries

| Actor | How it reaches data | What it may do |
|---|---|---|
| Browser (guest or customer) | Firebase client SDK, governed by `firestore.rules` | Read catalog/settings/published reviews; own profile, wishlist and orders; create pending reviews and B2B inquiries |
| Staff browser | Firebase client SDK + `/api/admin` with an ID token | What its `role` claim permits (below) |
| Serverless API (`api/`) | Firebase **Admin SDK** (bypasses rules) | The only writer of orders, stock reservations, coupon usage, idempotency keys, webhook events, rate limits, audit logs, staff roles |
| Razorpay | `/api/razorpay-webhook` (HMAC over raw body) | Payment, failure and refund events |
| Vercel Cron | `/api/cron/release-reservations` (`CRON_SECRET`) | Expire unpaid orders |

The API never uses the browser SDK. Missing credentials fail with `CONFIG_ERROR` (logged reason); there are no silent fallbacks
and no development payment bypasses — use Razorpay test keys locally.

## Money integrity

- The client sends only product ids, size/finish/dimensions, quantities and a coupon code. Prices come from Firestore
  `products`, custom pieces are priced from dimensions × finish rate, and GST/shipping come from `settings/store` (env defaults).
  The request schema has no price, tax or shipping fields.
- Coupons are evaluated only server-side from Firestore `coupons` against server-priced lines. Usage counts are incremented in
  the same transaction that marks the order `Paid`.
- The Razorpay order amount is set by the server; `/api/verify-payment` accepts only the three Razorpay fields and verifies
  the signature with `timingSafeEqual`. Webhook captures are also checked against the order's amount and currency.
- Orders cannot be created, deleted, or have money fields changed by any client (rules).

## Staff authentication and RBAC

- Staff sign in with Firebase Auth. Their role is the `role` custom claim, set only by the server: the `SET_STAFF_ROLE`
  admin action (super_admin only) or the bootstrap script. `staff/{uid}` mirrors it for listing; the claim is authoritative.
- Roles and permissions are defined once in `src/types/admin.ts` (`STAFF_ROLES`, `STAFF_ROLE_PERMISSIONS`); the API enforces them
  per action and `firestore.rules` mirrors them (keep both in sync).
- Password accounts must have a verified email before a role is honoured (API and rules).
- Demotion/removal revokes refresh tokens and the API verifies ID tokens with revocation checks.
- There is no shared admin password, no server-issued session token and no hardcoded admin email.
- Bootstrap the first owner once: `npm run grant-super-admin -- owner@example.com` (Admin SDK credentials required).

## Abuse controls

- Firestore-backed fixed-window rate limits for checkout-intent, validate-coupon, order-status and admin, keyed on the first
  hop of `x-vercel-forwarded-for` / `x-real-ip` (never the client-controllable `x-forwarded-for`). Keys are hashed.
- `order-status` requires orderId (random 20-char id) **and** email; mismatches look identical to unknown orders.
- Inventory: reservations and releases use atomic increments inside transactions; missing product documents are
  `INVALID_ITEM`, never a default stock.
- Idempotency keys are claimed transactionally with the order (`idempotency/{key}`), bound to a hash of the request.

## Audit

`audit_logs` is written only by the server (payments, refunds, staff changes, coupon/review/order-status changes). Clients cannot
write it; only `super_admin` can read it. `LOG_AUDIT` entries reported by staff UIs are tagged `source: 'client_reported'`.

## Secrets

All secrets are environment variables (see `.env.example`): Firebase service account, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`, `CRON_SECRET`. Only `RAZORPAY_KEY_ID` (returned as `keyId`) and the Firebase web config are public.
Errors returned to clients never include provider responses or internal details; those are logged server-side.

## Known gaps

- Rules unit tests (`src/test/firestore.rules.test.ts`) need the Firestore emulator: `npm run test:rules`.
- Configure Firestore TTL policies on `rate_limits.expiresAt`, `idempotency.expiresAt` and `webhook_events.expiresAt`.
- Razorpay auto-capture must be enabled; authorised-but-uncaptured payments are not handled.
