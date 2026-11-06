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
2. **India commerce (server and checkout done 2026-11-05):**
   - Done: PIN serviceability + delivery estimate (`/api/serviceability`, `DeliveryEstimate` component, checkout check); COD
     (catalogue-only, fee, limits, `Confirmed_COD`); GST invoices and credit notes (per-line tax, CGST/SGST vs IGST, FY numbering,
     PDF); Shiprocket integration (AWB, pickup, label, manifest, tracking webhook, RTO) with a manual fallback; notification outbox
     (Resend email, MSG91 SMS) with cron delivery; customer cancellation, staff refunds with webhook reconciliation, returns and
     replacements; one shared order state machine (`src/types/orderStatus.ts`).
   - Remaining: wire `DeliveryEstimate` into the PDP (storefront agent); customer UI for cancel / return / invoice download on
     Account and Track Order; staff UIs for the new admin actions (Phase 3 consoles); WhatsApp channel; COD OTP confirmation;
     storage-rules tests; real catalogue and prices; owner inputs below.
3. **Operations consoles:** production queue with real DXF, QC/packing, shipping, finance,
   support, B2B, with an enforced order state machine.
   - **3a (done, branch `phase3a-consoles`):** role home dashboards; Production console (queue by stage, claim, stage moves,
     production files, job sheet print); QC and packing console (checklist, rework, package data, packing slip); Support console
     (search, timeline, notes, WhatsApp snippets); Trade enquiries; catalog manager (full product form, sizes preview, sample filter);
     staff screen guidance; analytics reduced to real order metrics. QC and package data live in `orders.notes` (DATABASE.md).
   - **3b (done, branch `phase3b-consoles`):** Shipping console (`orders.tracking`: queue of packed, in-transit and returning-to-sender orders; Shiprocket
     or manual booking; cancel shipment before pickup; manual delivery-status buttons; RTO cancel-and-refund; per-order label links and a printable
     label for manual shipments), Finance console (`orders.refund` / `reports.export`: payments, COD pending and collected, refunds with the refund
     ceiling, invoices and credit notes as PDFs, reconciliation lists, CSV export with GST split), Returns console (`orders.update_status`: reason,
     details and photos; approve as refund or replacement, reject with reason, mark received), business settings form (seller/GSTIN, contact, COD,
     lead times, return window), `ADD_ORDER_NOTE` so support can add notes, one admin shell and shared UI components, COD orders in the production
     queue, and the customer order summary reading the same API shape on every path.
   - **Not built (3b):** courier rate list and ETA at booking; bulk label or manifest printing (the API is per order); importing Razorpay settlement
     or courier remittance files (reconciliation compares loaded orders only); hold status and material-shortage flag (below).
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

## Business and tax decisions (2026-11-06)

The owner delegated these decisions. Each one is a setting, so it can be changed in Settings or `settings/store` without
a code change. A CA should review the tax rows once before the first invoice is issued.

| Topic | Decision | Basis |
| --- | --- | --- |
| Goods GST | 5%, HSN 830629 (other ornaments of base metal) | Notification 13/2025-Central Tax (Rate): heading 8306 at 2.5% CGST + 2.5% SGST from 22 Sep 2025 (was 12%). Per-product `hsnCode` / `gstRatePercent` override it (for example 7326, 18%, for a functional steel article). |
| Shipping and COD fee | Taxed at the goods rate on the same invoice | Composite supply: an ancillary charge follows the rate of the principal supply (CGST Act s.8). |
| Consultation | SAC 998391, 18%, its own setting (`consultation.gstRatePercent`) | Specialty (interior) design services, unchanged by the GST 2.0 revision. Invoiced on payment (time of supply for services). |
| Consultation credit | ₹999 fee credited against the next order as a single-use coupon, 60 days | The coupon is a discount on the later goods supply, so it lowers that invoice's taxable value; the consultation invoice is unchanged. |
| Free shipping | Above ₹1,499, which is every order (the minimum piece price) | Competitors such as Livingshapes ship free on all orders; ₹150 still applies if cheaper items are added later. |
| COD | ₹49 fee, up to ₹10,000 order value, catalogue items only | The fee is within the usual ₹40–₹99 range for Indian D2C stores; the cap limits return-to-origin losses on high-value parcels. |
| Returns | 7 days after delivery for catalogue pieces; damage reported with photos within 48 hours; studio pieces are made to order, so only damage or defects qualify | Matches the 7-day norm (Pepperfry, Exotic India) and the 48-hour damage window. |
| Custom pieces | ₹750 setup + ₹1.10/cm² (steel finishes) or ₹1.40/cm² (copper alloys), minimum ₹1,499 | Finished-retail pricing anchored to the sample catalogue. Workshop cutting rates (about ₹120–₹1,200 per sq ft on IndiaMART) are the cost floor. |
| Policies | Terms, Privacy, Shipping and Returns rewritten to the Consumer Protection (E-Commerce) Rules, 2020 (seller identity, grievance officer: acknowledge in 48 hours, resolve in one month, country of origin) and the DPDP Act, 2023 / Rules, 2025 (what is collected, purpose, sharing, retention, rights, Data Protection Board). Seller and officer details render from Settings | Razorpay checks these pages before activating a live account. Counsel to review once. |
| Consultation launch | Off until a staff member has the `designer` role | Customers must not pay for a service nobody is staffed to deliver. Switch it on in Settings. |

## Decision: room scanning and interior planning (2026-11-05)

The owner proposed scanning a whole home from a phone video (QR → camera) into a 3D model for
interior planning with real materials. Decision: **do not build the full scanner now; earn it in
stages, each gated on measured results.**

Why: browser-only video-to-3D is not reliable on most phones; accurate scanning needs a native app
(Apple RoomPlan, LiDAR iPhones only) or cloud reconstruction with per-scan GPU cost; an interior
planner with a materials library is a separate product. For wall art, a true-scale preview on the
customer's own wall answers the buying question at a fraction of the cost.

| Stage | Scope | Gate to start the next stage |
|---|---|---|
| 1 (in progress) | View on your wall: calibrated room scenes, own-wall photo with scale calibration, true-scale AR (generated GLB/USDZ via model-viewer), fit recommendation; usage analytics | AR/preview users convert measurably better than non-users |
| 2 (built, see "Stage 2 status") | "My Space": customers save walls (photos + measurements) to their account; paid design consultation (price and credit-against-purchase configurable); designer workspace to propose pieces | Consultations sell and lead to orders |
| 3 (pilot) | Small iOS app/App Clip with RoomPlan (LiDAR) opened by QR; room model viewed on the web; place Vernox pieces on any wall, try paint colours. Android: guided photos + measurements or a licensed scanning SDK (pricing to verify) | Pilot lifts conversion or order value |
| 4 (only if 3 succeeds) | Full interior planner with materials; license a platform rather than build | — |


## Stage 2 status: My Space and paid design consultation (built, awaiting live payment test)

Built on `/account/spaces`, `/account/consultations/:id` and the designer workspace (admin tab Consultations). It tests whether
customers pay for design help before any room scanning is built. The gate for Stage 3 is the one above ("Consultations sell and
lead to orders"); the numbers come from `consultations/` (count, `status`, `outcome`, `creditRedeemedAt`), the credited orders, and
the browser events `space_created`, `wall_added`, `consultation_purchased`, `proposal_viewed`, `proposal_item_added_to_cart`,
`consultation_credit_redeemed` (same tracker as the wall-preview events).

Not yet verified live: the Razorpay payment step (test keys are not configured here; the purchase, confirmation, credit coupon and
photo copy are covered by `src/test/consultations.test.ts` against the in-memory store and a fake gateway). Everything else was driven
in the browser against the emulators.

Price, credit, SAC and GST are decided in "Business and tax decisions" above. Seller settings being incomplete still confirms the
payment and flags the order `INVOICE_PENDING_SELLER_SETTINGS`; Finance then issues the invoice from the order's finance panel
(`ISSUE_SERVICE_INVOICE`) once the GSTIN is saved.
- **Turnaround**: default 3 days (Settings); it is shown to customers and drives the designer queue's deadline.
- Designers need the `designer` role (Team screen). Production needs the Storage bucket CORS entry for the site origin
  (DEPLOYMENT.md) so wall photos can be read for the preview.

Follow-ups noted, not built: the Razorpay webhook path does not copy the photos itself (the first claim
retries it); one preview image per piece rather than several pieces composed on one wall image; no designer-to-customer chat beyond
the one revision message.

## Still needed from the owner

- Firebase projects for staging and production, created in `asia-south1` (Mumbai), plus a service account for the server.
- A Vercel Pro team (Hobby does not allow commercial use); the API runs in `bom1`.
- Shiprocket account API credentials; email and SMS/WhatsApp notification providers.
- Business GSTIN, legal name, registered address and state, support contacts and the grievance officer (Admin → Settings). Seeded
  placeholders keep every flow working meanwhile: invoices are specimens (`SP/…`), placeholders never reach the storefront, and the
  admin home shows a launch checklist until they are replaced.
- Resend account and verified sending domain; MSG91 account with DLT-registered sender ID and templates.
- Shiprocket API user, pickup location nickname, COD enablement and webhook token.
- Real catalogue, photographs and price list before launch.

## Storefront redesign notes (phase 4, first pass)

- Catalogue in `src/lib/catalog.ts` is SAMPLE data (`isSample: true`), seeded by `scripts/seed-firestore.ts`; the storefront reads Firestore. Replace products, prices and photography (`TODO(catalogue)`) before launch.
- Shop filters are URL-driven (`src/lib/storefront/listing.ts`); contact details come from `settings/store` (`supportEmail`, `supportPhone`, `whatsappNumber`, `supportHours`, `workshopAddress`) via `src/lib/storefront/contact.ts`.
- Light theme only (the old `.dark` block duplicated the light values). Legacy colour tokens remain as aliases for account, checkout and admin screens.
- Not built (no backend yet): newsletter signup, contact-form storage (the form opens email/WhatsApp), review submission, EMI messaging, save-for-later.

## Phase 3a follow-ups (status after 3b)

- `TODO(catalog-images)`: product images are URL fields. File upload needs `storage.rules` (owned by the commerce backend work) and an
  upload field in `src/pages/admin/catalog/ProductFormDialog.tsx`; QC "photo taken" is a tick for the same reason (store the photo
  in Storage and keep its URL in the `qc` block).
- `TODO(support-tickets)`: there is no ticketing backend; support notes live on the order. Proposed `tickets/{id}` collection:
  `{ orderId?, customerEmail, channel (whatsapp|email|phone|contact_form), subject, status (open|waiting|resolved), assignedTo,
  messages[{ at, by, direction, text }], createdAt, updatedAt }`, readable by `customers.read`, writable by a new `tickets.write`
  permission (support, order manager) so support no longer needs `orders.update_status` just to leave a note; contact-form
  submissions would create tickets.
- Done in 3b: support adds order notes through the `ADD_ORDER_NOTE` server action (permission `customers.read`), which appends inside a transaction and
  keeps the `#vernox:v1` block. Firestore rules are unchanged. The `tickets` collection above is still the answer for real ticketing (contact-form
  messages, assignment), not for notes.
- Done in 3b: `defaultLeadTimeDays` and `customLeadTimeDays` are in the settings form and the `StoreConfig` type.
- Workshop queues load up to 200 orders per status group; move to counters or a dedicated `workshop` index if volume exceeds that.
- Hold status and material-shortage flag (UAT OM-06, PR-06) need new order statuses in the shared state machine.
