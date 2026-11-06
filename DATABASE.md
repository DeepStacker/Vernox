# Vernox Firestore Data Model

Rules: `firestore.rules`. Indexes: `firestore.indexes.json` (deploy with `firebase deploy --only firestore`).
Seed an empty project or emulator with `npm run seed` (catalog from `src/lib/catalog.ts`, `settings/store`, launch coupons) —
the static definitions are seed data only; the API prices exclusively from Firestore.

Money convention: documents edited by staff (`products`, `coupons`, `settings/store`) hold **rupees**; documents written by the
server hold authoritative **paise** (`*Paise` fields).

## Collections

### `products/{productId}` — public read, catalog roles write
`name`, `slug`, `category`, `price` (₹, required — a product without a valid price cannot be bought), `sizes[{ label, widthMm,
heightMm, priceDelta (₹) }]`, `finishes` (lower-case finish ids; empty = any), `stock` (integer; missing = 0), `trackInventory`
(default true), `status` (`archived`/`draft` = not purchasable), `isActive` (false = not purchasable), display fields.
Stock is changed only by the API with atomic increments.

Products may also set `hsnCode` (4–8 digits; default `settings/store.defaultHsnCode`), `gstRatePercent` (default the store
rate) and `leadTimeDays` (production days; default `defaultLeadTimeDays`).

### `settings/store` — public read, `settings.write`
Shape: `StoreSettingsDoc` in `src/types/settings.ts`; parsing and defaults: `api/_lib/storeConfig.ts` (env `STORE_*` for absent
fields; `npm run seed` writes the same defaults). **Public document: never store secrets here.**
`gstRatePercent` (goods, default 5), `shippingFee` (₹, default 150), `freeShippingThreshold` (₹, free when subtotal ≥ it, default 1,499),
`customPieces: { [finishId]: { label, setupFee (₹), ratePerCm2 (₹), minimum (₹) } }` merged over the built-in defaults,
`codEnabled`, `codFee` (₹), `codMaxOrderValue` (₹), `codMaxOpenOrdersPerPhone`, `returnWindowDays`, `defaultLeadTimeDays`,
`customLeadTimeDays`, `manualTransitDays`, `defaultHsnCode`,
`consultation: { enabled (default false), priceInr (default 999, before GST, ₹1–1,00,000), creditTowardsOrder (default true), creditValidityDays (default 60), turnaroundDays (default 3), sacCode (default 998391), gstRatePercent (default 18, the service rate, independent of the goods rate) }`,
`seller: { legalName, tradeName, gstin, address, city, state, stateCode (2-digit GST code = GSTIN prefix), pincode, email, phone }`
(printed on invoices; invoices cannot be issued until legalName, gstin, address, state, stateCode and pincode are set).
`npm run seed` writes placeholder seller, contact and grievance values (`PLACEHOLDER_*` in `src/types/settings.ts`). While the
seller GSTIN is the placeholder `27AAAAA0000A1Z5`, invoices and credit notes are SPECIMENS (`specimen: true`, series `SP/…` and
`SC/…`, "not a valid tax document" on the PDF), the real `VX/` and `CN/` counters stay untouched, the storefront hides every
placeholder value, and the admin home lists what is still to replace. Saving a real GSTIN in Settings ends specimen mode.
Other fields:
storefront contact `whatsappNumber`, `supportPhone`, `supportEmail`, `supportHours`, `workshopAddress` (empty = hidden on the storefront),
`grievanceOfficerName`, `grievanceOfficerEmail` (named on the Terms and Privacy pages with the seller block; email falls back to `supportEmail`).
The admin Settings screen edits `seller`, the contact fields, `codEnabled`, `codFee`, `codMaxOrderValue`, `defaultLeadTimeDays`,
`customLeadTimeDays`, `returnWindowDays` and the `consultation` block (form model and GSTIN check: `src/pages/admin/settings/settingsForm.ts`, mirroring
`GSTIN_PATTERN` in `api/_lib/storeConfig.ts`).

### `orders/{orderId}` — written only by the API (`api/_lib/orders.ts`)
`id`, `orderNumber` (`VX-YYYYMMDD-XXXXXX`, also the Razorpay receipt), `status` (see lifecycle), `statusHistory[{ status, at, by,
note? }]`, `userId` (Firebase uid or null for guests), `email` (lower-case), `customer{ email, name, phone, address, city, state,
pincode, country }`, `items[{ productId, name, category, sizeLabel, widthMm, heightMm, finish, quantity, unitPricePaise,
lineTotalPaise, isCustom, customDesignRef }]` (frozen snapshot), `amounts{ subtotalPaise, discountPaise, shippingPaise, taxPaise,
totalPaise, gstRateBps }`, `coupon{ id, code, discountPaise } | null`, `stockReservation{ status: held|released|committed|none,
items[{ productId, quantity }] }`, `reservationExpiresAt` (ms, placed + 15 min), `idempotencyKey`, `razorpayOrderId`,
`razorpayPaymentId`, `paidAt`, `refunds[{ refundId, amountPaise, at }]`, `refundedPaise`, `refundPendingPaise` (requested, not
yet processed), `flags[]` (e.g. `AMOUNT_MISMATCH`, `STOCK_SHORTFALL_AFTER_LATE_PAYMENT`, `COUPON_LIMIT_EXCEEDED_AT_PAYMENT`,
`DUPLICATE_PAYMENT`, `REFUND_NOT_STARTED`), `hold` (`{ kind: hold|material_shortage, reason, by, at }` or null: fulfilment paused
without changing `status`; set and released only by the admin actions `SET_ORDER_HOLD` / `RELEASE_ORDER_HOLD`, and firestore.rules
refuse direct stage moves while it is set), `placedAt`/`createdAt`/`updatedAt` (ms).
Phase 2: `paymentMethod` (`prepaid` | `cod` | `replacement`; absent = prepaid), `phoneKey` (10-digit mobile, COD limits),
`leadTimeDays`, `amounts.codFeePaise`, `amounts.taxBreakdown{ lines[{ discountPaise, taxablePaise, gstRateBps, taxPaise }],
charges[{ kind: shipping|cod_fee, taxablePaise, gstRateBps, taxPaise }] }`, per item `hsnCode`, `gstRateBps`, `discountPaise`,
`taxablePaise`, `taxPaise`; `shipment` (ShipmentRecord, API.md) and `shipmentAwb` (queried by the courier webhook),
`cancelledShipments[]`, `invoiceId`/`invoiceNumber`, `deliveredAt`, `codCollectedPaise`/`codCollectedAt`/`codRemittance{ status }`,
`cancelledAt`/`cancellationReason`/`cancelledBy`, `parentOrderId`/`replacementOrderId`. Orders created before Phase 2 lack these;
readers default them (`paymentMethod` prepaid, no tax breakdown — the invoice reconstructs it).
Staff-editable (rules): `status` (fulfilment moves only), `statusHistory`, `assignedTo`, `tracking{ carrier, trackingNumber, url }`,
`notes`, `updatedAt`. Roles without write access to orders (support) add notes through the `ADD_ORDER_NOTE` action, which writes `notes` on the
server. The staff consoles read the money, payment, refund and shipment fields above straight from the order (`orders.read` roles may read the
whole document): see `OrderOps` in `src/types/orderOps.ts`.
`notes` is a string with two parts (parser: `src/lib/orders/orderNotes.ts`): free text (one `[YYYY-MM-DD HH:mm UTC <email>] text`
line per internal note) and, as the LAST line, an optional structured block `#vernox:v1 <compact JSON>`:
`{"qc":{"<itemId>":{"outcome":"pass|fail","checks":{"dimensions","finish","edges","hardware","photo": bool},"at","by","reason?"}},
"qcLog":[{"itemId","outcome","at","by","reason?"}] (last 50, append-only),"package":{"lengthCm","widthCm","heightCm","weightKg","at","by"}}`.
`qc` holds the latest result per item and is cleared when QC fails an order (so rework is re-inspected); `qcLog` keeps every
attempt with its reason; `package` is read by the Shipping console (length, width as `breadthCm`, height, weight prefill the Shiprocket booking). A block that does not parse is kept as plain text and
never discarded. Staff write it through the console helpers only; any editor of `notes` must go through `withFreeText`/`appendNote`
so the block survives. Plain legacy notes need no migration.
Display copies written once at creation for the existing admin UI (do not use for money logic): `subtotal`, `discount`,
`shipping`, `tax`, `total` (₹), `items[].unitPrice/lineTotal/productName`, `shippingName/Address/City/State/Zip/Country`, `phone`, `couponCode`.

Lifecycle — defined once in `src/types/orderStatus.ts` (used by the API and the browser; `firestore.rules` mirrors the staff
subset and a test checks it):
`Pending_Payment → Paid` (prepaid) or `Confirmed_COD` (COD, at checkout) `→ In_Design → Cutting → Finishing → Quality_Check →
Packed → Shipped → Out_For_Delivery → Delivered`, with rework moves (Cutting → In_Design, Finishing → Cutting, Quality_Check →
Finishing | Cutting, Packed → Quality_Check); `Shipped | Out_For_Delivery → RTO_Initiated → RTO_Delivered → Cancelled`;
`Delivered → Return_Requested → Return_Approved → Returned` (or back to `Delivered` when rejected);
`Pending_Payment → Payment_Failed | Expired | Cancelled | Payment_Discrepancy`; `Payment_Failed | Expired → Paid` (late payment);
`Paid | Confirmed_COD | workshop stages → Cancelled`; collected money → `Partially_Refunded → Refunded`.
Legacy statuses `Designing` / `Finished` (Phase 1) are read as `In_Design` / `Finishing`; they are never written and need no
migration. Staff may write only the workshop moves directly (`staffWorkshopMoves()` in the rules); `notes` must be a string of at
most 20 000 characters (QC/packing records are kept there by the staff consoles).

### `coupons/{couponId}` — read `coupons.read`, write `coupons.write` (normally via `SAVE_COUPON`)
`code` (unique, upper-case), `description`, `discountType` (`percentage`|`fixed`), `discountValue` (% or ₹), `maxDiscountLimit` (₹),
`minOrderValue` (₹), `maxUsageCount`, `usedCount` (server-maintained), `maxUsagePerCustomer`, `startDate`/`expiryDate`
(`YYYY-MM-DD` = whole day IST, or ISO timestamp), `isActive`, `applicableCategories[]`, `applicableProductIds[]`.
Subcollection `customer_usage/{sha256(email)}`: `{ count }` (server only).
Consultation credits add `boundEmail` (only that checkout email may redeem), `consultationId`, `source: 'consultation_credit'` (`cc_{orderId}`, see below).

### Spaces and consultations (Stage 2)
- `users/{uid}/spaces/{spaceId}` — **owner only** (not even `customers.read` roles or designers). `{ id, name (≤ 80), roomType
  (living|bedroom|pooja|entrance|office|outdoor|kids), budgetBand?, notes (≤ 2000), walls[], createdAt, updatedAt }`. Walls are an
  **array** on the space document (max 8 small objects, always read and written together, one atomic write, one read for the
  list), not a subcollection: `{ id, name, widthCm, heightCm, pxPerCm, photoPath, photoWidth, photoHeight, notes }`. `pxPerCm` is
  the photo's scale (the wall-preview calibration, `src/lib/wallPreview/calibration.ts`); it comes from the typed width
  (photo width ÷ width) or from marking a known object. Photos: Storage `spaces/{uid}/{spaceId}/{wallId}.jpg` (JPEG, ≤ 1600 px, ≤ 5 MB).
  Rules bound the shape and size only; the server re-validates when snapshotting (a wall's photo path must be its own).
- `consultations/{orderId}` — **written only by the API**; the id equals the paid order's id. Read by the customer (`userId == uid`)
  and by `super_admin`, `admin`, `designer` (`consultations.read`). `status` new|in_progress|proposed|closed, `outcome`
  accepted|declined|null, a snapshot of the space (`spaceName`, `roomType`, `budgetBand`, `notes`, `walls[]` whose `photoPath` is
  `consultations/{id}/walls/{wallId}.jpg`), `photosReady`, `pricePaise`, `turnaroundDays`, `dueAt` (SLA), `assignedUid/Name`,
  `proposal { version, items[], note, sentAt, sentBy } | null`, `revisionsUsed`, `revisionNote`, `credit { code, amountInr,
  expiresAt } | null`, `creditRedeemedAt/OrderId`. It holds no email or phone: a designer sees the customer's first name only.
  A `ProposalItem` is `{ id, wallId, kind catalogue|custom, productId, productName, sizeLabel, widthMm, heightMm, finish,
  designRef (studio document JSON, custom only, ≤ 200 000 chars, ≤ 600 000 per proposal), pose { cx, cy, rotationDeg } (wall cm),
  previewPath (consultations/{id}/previews/{itemId}.png), note }`.
- `consultations/{orderId}/private/draft` — the designer's draft `{ items, note, updatedAt, updatedBy }`; staff read only, so the
  customer sees nothing until `SEND_PROPOSAL` copies it to `proposal`.
- `orders/{orderId}` for a consultation has `kind: 'service'` and `consultation` (the frozen purchase: space snapshot incl. photo
  paths and notes, credit terms). Staff with `orders.read` can therefore read the snapshot; designers cannot read orders.
- Storage (`storage.rules`): `spaces/{uid}/...` owner only (verified email); `consultations/{id}/walls/*` server-written, read by
  the customer and consultation staff; `consultations/{id}/previews/*` written by consultation staff, read by both. Browsers load
  these through `getBlob`, so the bucket needs a CORS entry for the site's origin (DEPLOYMENT.md).

### Server-only collections (no client access)
Phase 2 (India commerce):
- `invoices/{orderId}` — immutable GST tax invoice (`TaxDocument`, `api/_lib/gst/invoice.ts`): `number`, `financialYear`,
  `issuedAt`, `seller`, `buyer`, `placeOfSupply{ state, stateCode }`, `supplyType` (`intra_state` = CGST+SGST, `inter_state` =
  IGST), `lines[{ description, hsnCode, quantity, unitPricePaise, grossPaise, discountPaise, taxablePaise, gstRateBps, cgstPaise,
  sgstPaise, igstPaise, totalPaise }]`, `totals`, `taxInclusive: false`, `paymentMethod`. Issued once per order: goods when the shipment
  is created (time of supply = removal of goods); services (`kind: 'service'`, design consultations) on payment
  confirmation, with the SAC code on the line. If seller settings are incomplete at payment, the service order is still
  marked Paid and flagged `INVOICE_PENDING_SELLER_SETTINGS`; finance issues it later with the admin action
  `ISSUE_SERVICE_INVOICE`, which clears the flag. Never for replacement orders.
- `credit_notes/{refundId}` — same shape, `type: 'credit_note'`, `againstInvoice{ id, number }`, `refundId`, `reason`. One per
  refund on an invoiced order (and `cancel_{orderId}` for an invoiced COD order that is cancelled after RTO).
- `counters/{invoice|credit_note|specimen_invoice|specimen_credit_note}_{YYYY-YY}` — `{ last }`, incremented in the issuing transaction. Numbers: `VX/26-27/000123`
  (invoices) and `CN/26-27/000004` (credit notes): consecutive per financial year (1 April–31 March IST), ≤ 16 characters (Rule 46).
- `refunds/{id}` — `{ orderId, amountPaise, reason, method: razorpay|manual, source: staff|customer_cancel|external, status:
  pending|processed|failed, requestedBy, providerRefundId (Razorpay id or manual bank/UPI reference), createdAt, processedAt,
  error, creditNoteId, creditNoteNumber }`. `ext_{rfnd_id}` documents record refunds made outside the store.
- `returns/{orderId}` — `{ status: requested|approved|rejected|received, reason, details, photoPaths[], resolution:
  refund|replacement|null, decisionNote, replacementOrderId, requestedAt, decidedAt, decidedBy, receivedAt }`. `photoPaths` are Storage
  paths `returns/{orderId}/{file}`; staff with `orders.read` may read them (storage.rules) and the Returns console loads them with
  `getDownloadURL`.
- Storage `products/{productId}/{file}.webp` — catalogue photos uploaded from the admin product form (resized in the browser to
  2000 px WebP, ≤ 2 MB). Public read; created and deleted by catalogue staff (storage.rules). The product's `imageUrl` /
  `lifestyleImage` stores the download URL.
- `notifications_outbox/{orderId}_{event}[_{refundId}]` — `{ event, payload (customer name/email/phone, amounts, tracking),
  channels{ email, sms: pending|sent|skipped }, status: pending|sending|sent|dead, attempts, nextAttemptAt, leaseUntil, lastError,
  sentAt }`. The id makes one notification per order + event.
- `courier_events/{sha256(awb|status|timestamp)}` — courier webhook log `{ awb, status, statusId, eventAt, orderId, target, outcome }`.
- `serviceability_cache/{provider}_{pincode}` — `{ result, cachedAt }` (12 h).
- `integrations/shiprocket` — cached API token `{ token, expiresAt }`.

Earlier collections:
- `coupon_usages/{orderId}` — redemption record written when the order is paid.
- `idempotency/{key}` — `{ orderId, requestHash, createdAt, expiresAt }`.
- `webhook_events/{eventId}` — `{ event, outcome, orderId, razorpayOrderId, razorpayPaymentId, razorpayRefundId, amountPaise,
  receivedAt, expiresAt }`; outcome `unmatched` = needs reconciliation.
- `rate_limits/{scope_hash_window}` — `{ count, scope, windowStart, expiresAt }`. Scopes include `contact` (5/h per IP), `newsletter` (10/h) and `review` (30/min).
- `audit_logs/{id}` — `AuditLog` (`src/types/admin.ts`); readable by `super_admin`.
- `staff/{uid}` — `StaffMember` mirror of the role claim; readable by the member and `staff.read` roles.

### Client collections
- `users/{uid}` — owner read/write; `role`/`isAdmin` cannot be set by clients (roles are claims). Readable by `customers.read`.
- `wishlists/{uid}` — owner only.
- `reviews/{id}` — public read when `status == 'published'` (authors also read their own); **no client create**: customers submit through
  `POST /api/engage` `SUBMIT_REVIEW`, which needs a Delivered order containing the product (matched by `userId`, or by the verified account
  email for guest checkouts) and writes `{ id: rv_<hash(uid:productId)>, productId, userId, orderId, customerName ("Asha R."), location?,
  rating, comment, verified: true, status: 'pending', placedAt, createdAt, updatedAt }`. One review per customer and product (the id is
  derived, a repeat is a 409). Text only: `storage.rules` has no path for review photos. Moderation by `reviews.moderate` roles through
  `SAVE_REVIEW`. List queries from the storefront must filter `status == 'published'`.
- `tickets/{id}` — support tickets from the contact form (`POST /api/engage` `CONTACT`); read by `tickets.read` roles
  (`super_admin`, `admin`, `order_manager`, `support`), **never written by clients**. `{ ref ("T-ABC123"), channel: 'contact_form', topic,
  subject, orderNumber?, customerName, customerEmail, customerPhone?, status: open | waiting | resolved, assignedTo (first staff to act),
  messages[{ at, by, direction: inbound | reply | note, text }] (max 100), createdAt, updatedAt }`. Staff change them through the admin
  actions `ADD_TICKET_MESSAGE` / `SET_TICKET_STATUS` (`tickets.write`, audited). A `reply` is emailed to the customer (outbox event
  `ticket_reply`, id `{ticketId}_ticket_reply_{messageIndex}`, email only) in the same transaction; a `note` is internal (answers given on
  WhatsApp or phone are recorded as notes). Creating a ticket also writes a `notifications_outbox/{ticketId}_support_ticket`
  alert to `settings/store.supportEmail` in the same transaction (skipped when that address is empty; the ticket is still saved).
- `newsletter_subscribers/{sha256(email)}` — server-only (closed to clients; holds emails and tokens). `{ email, status: subscribed |
  unsubscribed, source, consentAt, unsubscribedAt, unsubscribeToken, updatedAt }`. Signing up again is idempotent (a current subscriber is
  unchanged); someone returning after unsubscribing gets a new `consentAt` and keeps the token. There is no email provider: export the list
  with `npm run export:newsletter > subscribers.csv` (needs the Firebase service account; subscribed addresses only, with the unsubscribe
  token and hash for building `/newsletter/unsubscribe?h=<hash>&t=<token>` links) and import it into whichever tool sends the campaign.
  Re-export before each campaign so unsubscribes are honoured.
- `b2b_inquiries/{id}` — validated public create (shape of `B2BTradeModal`, `status: 'pending_review'`), read and updated by `b2b.read` roles. The
  admin screen moves `status` through `pending_review → contacted → quoted → won | lost`; no other field is written.
- `admin_users` — legacy, closed.

## Indexes
`consultations`: single-field only (the designer queue orders by `createdAt`, the customer filters by `userId`).
`orders`: (userId, placedAt desc), (status, placedAt desc), (email, placedAt desc), (status, reservationExpiresAt) for the cron;
`audit_logs`: (targetType, timestamp desc); `notifications_outbox`: (status, nextAttemptAt), (status, leaseUntil). Single-field indexes cover `orders.razorpayOrderId`, `orders.razorpayPaymentId`,
`coupons.code`. `orders.items` and `orders.customer` are exempt from indexing.

## TTL policies (configure once in the console / gcloud)
`rate_limits.expiresAt`, `idempotency.expiresAt`, `webhook_events.expiresAt`, `courier_events.expiresAt`,
`serviceability_cache.expiresAt`. Never set TTLs on `invoices`, `credit_notes`, `counters` or `refunds` (statutory records:
retain at least 72 months after the annual return).
