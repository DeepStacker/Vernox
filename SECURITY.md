# Vernox Security Model

## Trust boundaries

| Actor | How it reaches data | What it may do |
|---|---|---|
| Browser (guest or customer) | Firebase client SDK, governed by `firestore.rules` | Read catalog/settings/published reviews; own profile, wishlist and orders; create pending reviews and B2B inquiries |
| Staff browser | Firebase client SDK + `/api/admin` with an ID token | What its `role` claim permits (below) |
| Serverless API (`api/`) | Firebase **Admin SDK** (bypasses rules) | The only writer of orders, stock reservations, coupon usage, idempotency keys, webhook events, rate limits, audit logs, staff roles |
| Razorpay | `/api/razorpay-webhook` (HMAC over raw body) | Payment, failure and refund events |
| WhatsApp (Meta) | `/api/whatsapp-webhook` (`X-Hub-Signature-256` = HMAC-SHA256 of the raw body with `WHATSAPP_APP_SECRET`, constant-time; GET handshake checks `WHATSAPP_VERIFY_TOKEN`) | Inbound customer messages -> support tickets, STOP / START |
| Shiprocket | `/api/courier-webhook` (`x-api-key` = `SHIPROCKET_WEBHOOK_TOKEN`, constant-time) | Shipment tracking events |
| Vercel Cron | `/api/cron/release-reservations`, `/api/cron/send-notifications` (`CRON_SECRET`) | Expire unpaid orders; deliver notifications |
| Customer (guest or signed in) | `/api/order-status`, `/api/invoice`, `/api/order-cancel`, `/api/return-request` | Own order only: bearer token of the owner or the order's email (constant-time compare; unknown order and wrong email look identical) |

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
- Orders cannot be created, deleted, or have money fields changed by any client (rules). Staff browsers may write only workshop
  stage moves (`staffWorkshopMoves()` in the rules, mirrored from `src/types/orderStatus.ts`); shipping, delivery, cancellation,
  returns and refunds go through the API.
- COD eligibility, the COD fee, GST and refund ceilings are decided only by the server. Refund amounts are capped at
  collected − refunded − pending inside a transaction; Razorpay refunds carry our refund id so the webhook cannot double count.
- GST invoices and credit notes are server-generated, immutable and sequentially numbered in a transaction.

## Staff authentication and RBAC

- Staff sign in with Firebase Auth. Their role is the `role` custom claim, set only by the server: the `SET_STAFF_ROLE`
  admin action (super_admin only) or the bootstrap script. `staff/{uid}` mirrors it for listing; the claim is authoritative.
- Roles and permissions are defined once in `src/types/admin.ts` (`STAFF_ROLES`, `STAFF_ROLE_PERMISSIONS`); the API enforces them
  per action and `firestore.rules` mirrors them (keep both in sync).
- Password accounts must have a verified email before a role is honoured (API and rules).
- Demotion/removal revokes refresh tokens and the API verifies ID tokens with revocation checks.
- There is no shared admin password, no server-issued session token and no hardcoded admin email.
- `designer` (Stage 2) holds only `consultations.read` and `consultations.manage`: no orders, customers, finance, coupons, settings or
  catalogue write. The catalogue is world-readable, so picking products needs no permission. Rules mirror: `canReadConsultations()`
  in `firestore.rules` and `isConsultationStaff()` in `storage.rules`.
- Bootstrap the first owner once: `npm run grant-super-admin -- owner@example.com` (Admin SDK credentials required).

## Customer spaces and consultations (Stage 2)

- Wall photos are private data of someone's home. `users/{uid}/spaces/*` and `spaces/{uid}/*` (Storage) are owner-only: no staff
  role, including `super_admin`, can read them through the client rules; the Admin SDK does, once, to snapshot a paid consultation.
- A paid consultation carries its own copy (`consultations/{id}/walls/*`) readable by the customer and by consultation staff only,
  so designers never get access to anyone's space. The consultation document stores no email or phone.
- The price is never client input; `design-consultation` is not a product, so the public checkout cannot sell it. Payment goes through
  the same signature/webhook/idempotent confirmation as orders, and the consultation and credit coupon are created in the same
  transaction as `Paid` (no consultation without payment, none twice).
- Credit coupons are bound to the buyer's email and single-use; a consultation is reachable only by its owner (others get `404`
  from the API and `permission-denied` from the rules).
- Uploads need a verified email (like return photos), images only, ≤ 5 MB. The server only copies a wall's own
  `spaces/{uid}/{spaceId}/{wallId}.jpg` path, so a tampered space document cannot make it copy another customer's file.

## Abuse controls

- Firestore-backed fixed-window rate limits for checkout-intent, validate-coupon, order-status and admin, keyed on the first
  hop of `x-vercel-forwarded-for` / `x-real-ip` (never the client-controllable `x-forwarded-for`). Keys are hashed.
- `order-status` requires orderId (random 20-char id) **and** email; mismatches look identical to unknown orders.
- Inventory: reservations and releases use atomic increments inside transactions; missing product documents are
  `INVALID_ITEM`, never a default stock.
- Idempotency keys are claimed transactionally with the order (`idempotency/{key}`), bound to a hash of the request.
- COD abuse: 3 COD checkouts per hour per mobile number and per email, at most `codMaxOpenOrdersPerPhone` undelivered COD orders
  per number, `codMaxOrderValue` cap; an SMS one-time code (hashed, 5-minute expiry, 5 attempts, 30 s resend cooldown, per-phone and
  per-IP limits, single-use verification token) when MSG91 OTP is configured, otherwise the order is flagged `COD_UNVERIFIED` for a
  confirmation call — see `api/_lib/codOtp.ts`.
- New endpoints validate input with zod and are rate-limited per IP: serviceability 30/min, invoice 20/min, order-cancel and
  return-request 10/min.
- Return photos: Cloud Storage `returns/{orderId}/…`, writable only by the order owner (uid or verified order email), images ≤ 5 MB,
  immutable; readable by that customer and order-reading staff (`storage.rules`). Everything else in the bucket is closed.

## Audit

`audit_logs` is written only by the server (payments, refunds, staff changes, coupon/review/order-status changes). Clients cannot
write it; only `super_admin` can read it. `LOG_AUDIT` entries reported by staff UIs are tagged `source: 'client_reported'`.

## Secrets

All secrets are environment variables (see `.env.example`): Firebase service account, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`, `CRON_SECRET`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `MSG91_AUTH_KEY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`. Inbound WhatsApp text is stored as plain text and rendered by React (no HTML); the opt-out collection is server-only.
`settings/store` is world-readable and must never hold secrets (seller GSTIN and contact details are public business data).
The Shiprocket API token is cached server-only in `integrations/shiprocket`. Notification payloads (customer PII) live only in
the server-only `notifications_outbox`; logs record event and order id, never addresses or phone numbers. Only `RAZORPAY_KEY_ID` (returned as `keyId`) and the Firebase web config are public.
Errors returned to clients never include provider responses or internal details; those are logged server-side.

## Deployment on a VM (Docker image)

- Secrets at rest: integration keys entered in Admin > Settings > Integrations are stored AES-256-GCM encrypted
  (`api/_lib/integrationSecrets.ts`) with `SECRETS_ENCRYPTION_KEY`, generated by `install.sh` and kept only in `.env.production`
  (mode 600, ignored by version control). The admin sees whether a key is set and its last four characters, never the value. Back
  that file up: without the key the stored values cannot be decrypted.
- `/runtime-config.js` is public by design and holds only the Firebase web config, the site URL and the Razorpay key id
  (`api/_lib/runtimeConfig.ts`; a test asserts that no secret leaks into it).
- Firestore and Storage rules and indexes are deployed by `install.sh` / `update.sh --rules`; the database is Firebase, never a container.
- Network: only Caddy publishes ports (80, 443); it terminates TLS (Let's Encrypt), adds HSTS and overwrites `x-real-ip`, which the
  rate limiter trusts. The app container is not published, runs as non-root with a read-only filesystem, no capabilities and
  `no-new-privileges`. Headers set by the Node server on every response: `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` (`server/apiRouter.ts`). CORS allows only the configured site URL and its www / apex twin in production.
- The service-account JSON is passed as `FIREBASE_SERVICE_ACCOUNT_BASE64` in `.env.production`; the rules deployment writes it to a
  private temporary directory that is deleted afterwards. Give the account only the roles it needs.

## Content-Security-Policy origins

The repository sets no CSP header yet. If one is added (Vercel `headers` in `vercel.json`), the storefront needs: scripts from
`cdn.razorpay.com` (Affordability Widget on product and cart pages, loaded lazily; `checkout.razorpay.com` for Checkout), connections to
`api.razorpay.com` and `lumberjack.razorpay.com`, frames from `api.razorpay.com` and `checkout.razorpay.com`, and images/styles the
widget injects (verify against the current widget in a browser, Razorpay does not publish a CSP list). Fonts are self-hosted
(`/fonts`), so no Google Fonts origins are needed. `img-src` needs `data:` for Studio previews.

## Known gaps

- Rules unit tests need the emulators: `npm run test:rules` runs `src/test/firestore.rules.test.ts` and `src/test/storage.rules.test.ts`
  (the `spaces/` and `consultations/` paths). The `returns/` Storage rules still have no automated test; verify UAT CS-11 manually.
- `/api/order-cancel` and `/api/return-request` accept the order id + email without an OTP; the order id is a random 20-character
  id only the customer receives, and both are rate-limited.
- Configure Firestore TTL policies on `rate_limits.expiresAt`, `idempotency.expiresAt` and `webhook_events.expiresAt`.
- Razorpay auto-capture must be enabled; authorised-but-uncaptured payments are not handled.
