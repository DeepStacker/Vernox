# Vernox: audit findings and launch roadmap

Status as of 2026-11-05. This is the source of truth for what is broken, what is missing and the
order we fix it in. Earlier docs (ARCHITECTURE, SECURITY, DATABASE, API, VERNOX_SYSTEM_DOSSIER)
describe intended behaviour; where they disagree with this file, this file reflects the code.

## Baseline health (measured)

| Check | Result |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | 4 errors (ProductCompareModal, AdminReviews, TrackOrder) |
| `vitest run` | 7 of 36 tests fail (pricing engine vs catalog prices, image tracer, studio page crashes on storage) |
| `eslint .` | 189 errors, 22 warnings |
| `vite build` | succeeds; main chunk 709 kB, plus firebase 708 kB, jspdf 619 kB, recharts 536 kB |
| Lockfiles | `package-lock.json`, `bun.lock` and `bun.lockb` all committed |

## P0: blocks taking real money safely

1. **The server has no privileged database access.** `firebase-admin` is not installed; every
   `api/*` handler uses the browser Firebase SDK unauthenticated, so `firestore.rules` denies its
   writes. Errors are swallowed: a paid order stays `Pending_Payment`, stock is never decremented,
   coupon usage is never counted, admin API writes fail.
2. **`api/create-order.ts` accepts a client-supplied amount** and is unused by the frontend;
   combined with `verify-payment` writing client `orderData`, ₹1 can buy any order.
3. **Client controls pricing inputs:** `taxRate`, `shippingFee`, `freeShippingThreshold` and
   `unitPrice` (custom and non-catalog items) come from the request body. Server prices come from a
   static table in `pricingEngine.ts`, ignoring admin price edits.
4. **Firestore rules:** anyone can create `orders`, `coupon_usages`, `audit_logs`; any signed-in
   user can write `coupons` and edit or delete any review; `isAdmin()` trusts a hardcoded email
   list without `email_verified`, so registering `admin@vernox.com` grants admin.
5. **Admin auth:** `/api/admin` uses a shared password and its own HMAC token (secret falls back to
   the Razorpay secret); non-production accepts any 6-character password; the client mints a local
   super-admin session (`catalogContext.tsx` fallback). Role permissions are displayed but never
   enforced; every tab is shown to every role.
6. **Dev payment bypasses** in `verify-payment.ts`, `checkout-intent.ts` and `Checkout.tsx`
   (`pay_dev_*`) can confirm unpaid orders outside `NODE_ENV=production`.
7. **Public storefront downloads all orders, users, coupons and admin users** into the browser
   (`catalogContext.tsx`), a PII leak or a silent failure depending on rules.
8. **Fabricated data presented as real:** ~530 lines of invented international orders and
   customers seeded into admin, ~1,600 lines of hardcoded reviews marked `verified: true`
   (Consumer Protection / ASCI fake-review exposure).
9. **Catalog and pricing are not this business:** canvas, bronze and plaster pieces priced
   ₹175–₹390 with a Belgian/Antwerp brand story; checkout defaults to United States and ZIP.
10. **Webhook signature check** re-serialises the JSON body on Vercel, so genuine Razorpay
    webhooks may be rejected.

## P1: blocks operating at scale

- Stock reservations never expire or release (abandoned checkout, failed payment, refund).
- Coupon redemption is not atomic; rate limits are in-memory and keyed on a spoofable header.
- Orders are written by both client and server with different shapes; localStorage is an order store.
- Cancelling marks "Refunded" without calling Razorpay; no refund, cancellation or returns flow.
- No order state machine (any status can jump to any other); no QC or packing stages.
- Custom studio designs reach the order but production DXF export rebuilds a bare outline.
- No courier integration, AWB, labels, pincode serviceability, delivery estimate or COD.
- No GST invoice (GSTIN, HSN, CGST/SGST/IGST split).
- No customer notifications (email, SMS, WhatsApp).
- Product admin: image URL only (no upload), one stock number (no size × finish variants),
  no SEO, weight, HSN fields. B2B enquiries are saved but no screen shows them.
- No SEO foundation: single static title, no structured data, sitemap on the wrong domain.

## P2: improvement

- 15 unused components (three competing heroes, intro loader, custom cursor, smooth scroll,
  room visualiser), page-curtain animation on every navigation, seven web-font families,
  13 MB of unoptimised JPGs.
- God files: `catalogContext.tsx` 2,525 lines, `AdminOverview.tsx` 2,089, `AdminOrders.tsx` 1,136.
- Duplicate logic: `couponValidator.ts` vs `couponEngine.ts`; static price table vs Firestore.
- Duplicate routes (`/trade` and `/b2b`, `/legal` and `/privacy`), `/shipping-returns` points to
  Shipping, two toasters mounted, React Query installed but unused.

## Role interfaces needed

| Role | Interface | Today |
|---|---|---|
| Customer | browse, PDP, cart, checkout (UPI/card/COD), account, orders, tracking, returns, wishlist, studio | partial |
| Super admin / owner | staff and roles, settings, dashboards | partial, unenforced |
| Catalog manager | products with images, variants, pricing, SEO, categories, collections | partial |
| Production (workshop) | job queue, real DXF of the customer design, stage updates | missing |
| QC and packing | checklist, photos, packing slip | missing |
| Shipping | courier booking, AWB, label, tracking sync, RTO | missing |
| Finance | payments, refunds, reconciliation, GST invoices and reports | missing |
| Support | order lookup, returns/replacements, customer notes, tickets | missing |
| B2B / trade sales | enquiries, quotes, bulk orders | missing |
| Marketing | coupons, banners, reviews moderation | partial |

## Benchmark: wallmantra.com

Strong: trust strip (Google rating, customer count, photo reviews), shop by room and by theme,
WhatsApp support, clear dispatch times. Weak, where we can beat them: no filters/sort/ratings on
listings; PDP has no MRP/discount, size or finish choice, room view, COD or EMI messaging; no
track-order page; no corporate/bulk page; strict, vague returns; contradictory free-shipping copy.

## Phases

1. **Foundation (in progress):** server-authoritative orders, payments, stock and coupons via
   `firebase-admin`; locked rules; Firebase-token admin auth with role claims; remove fake data and
   bypasses; client data layer split; green type check, tests and lint.
2. **India commerce:** real catalog and prices, PIN code and serviceability, COD, GST invoices,
   courier integration, notifications, cancellation, refunds and returns.
3. **Operations consoles:** production queue with real DXF, QC/packing, shipping, finance,
   support, B2B, with an enforced order state machine.
4. **Storefront redesign:** simpler navigation, shop by room/theme, filters, PDP with MRP,
   delivery estimate, room view and trust, SEO and performance.
5. **UAT:** scripted end-to-end scenarios per role (see `UAT.md` once written) on a staging project.

## Owner decisions (2026-11-05)

- **Catalogue:** a placeholder laser-cut metal wall-art catalogue with India pricing for UAT,
  clearly marked as sample data; the owner replaces it with real products, photos and prices
  before launch.
- **Brand story:** Made in India: Indian workshop, INR, GST, delivery across India. The
  Belgian/Antwerp framing is removed.
- **Courier:** Shiprocket (pincode serviceability, AWB, labels, tracking webhooks, COD remittance).
- **COD:** offered on catalogue items only, with a COD fee; custom studio designs are prepaid only.

## Still needed from the owner

- Firebase service-account credentials for the server, and a staging Firebase project for UAT.
- Shiprocket account API credentials; email and SMS/WhatsApp notification providers.
- Business GSTIN, state of registration and HSN codes for the products.
- Real catalogue, photographs and price list before launch.
