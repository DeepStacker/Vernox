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
`gstRatePercent`, `shippingFee` (₹), `freeShippingThreshold` (₹, free when subtotal ≥ it),
`customPieces: { [finishId]: { label, setupFee (₹), ratePerCm2 (₹), minimum (₹) } }` merged over the built-in defaults,
`codEnabled`, `codFee` (₹), `codMaxOrderValue` (₹), `codMaxOpenOrdersPerPhone`, `returnWindowDays`, `defaultLeadTimeDays`,
`customLeadTimeDays`, `manualTransitDays`, `defaultHsnCode`,
`seller: { legalName, tradeName, gstin, address, city, state, stateCode (2-digit GST code = GSTIN prefix), pincode, email, phone }`
(printed on invoices; invoices cannot be issued until legalName, gstin, address, state, stateCode and pincode are set),
storefront contact `whatsappNumber`, `supportPhone`, `supportEmail`, `supportHours`, `workshopAddress`.

### `orders/{orderId}` — written only by the API (`api/_lib/orders.ts`)
`id`, `orderNumber` (`VX-YYYYMMDD-XXXXXX`, also the Razorpay receipt), `status` (see lifecycle), `statusHistory[{ status, at, by,
note? }]`, `userId` (Firebase uid or null for guests), `email` (lower-case), `customer{ email, name, phone, address, city, state,
pincode, country }`, `items[{ productId, name, category, sizeLabel, widthMm, heightMm, finish, quantity, unitPricePaise,
lineTotalPaise, isCustom, customDesignRef }]` (frozen snapshot), `amounts{ subtotalPaise, discountPaise, shippingPaise, taxPaise,
totalPaise, gstRateBps }`, `coupon{ id, code, discountPaise } | null`, `stockReservation{ status: held|released|committed|none,
items[{ productId, quantity }] }`, `reservationExpiresAt` (ms, placed + 15 min), `idempotencyKey`, `razorpayOrderId`,
`razorpayPaymentId`, `paidAt`, `refunds[{ refundId, amountPaise, at }]`, `refundedPaise`, `refundPendingPaise` (requested, not
yet processed), `flags[]` (e.g. `AMOUNT_MISMATCH`, `STOCK_SHORTFALL_AFTER_LATE_PAYMENT`, `COUPON_LIMIT_EXCEEDED_AT_PAYMENT`,
`DUPLICATE_PAYMENT`, `REFUND_NOT_STARTED`), `placedAt`/`createdAt`/`updatedAt` (ms).
Phase 2: `paymentMethod` (`prepaid` | `cod` | `replacement`; absent = prepaid), `phoneKey` (10-digit mobile, COD limits),
`leadTimeDays`, `amounts.codFeePaise`, `amounts.taxBreakdown{ lines[{ discountPaise, taxablePaise, gstRateBps, taxPaise }],
charges[{ kind: shipping|cod_fee, taxablePaise, gstRateBps, taxPaise }] }`, per item `hsnCode`, `gstRateBps`, `discountPaise`,
`taxablePaise`, `taxPaise`; `shipment` (ShipmentRecord, API.md) and `shipmentAwb` (queried by the courier webhook),
`cancelledShipments[]`, `invoiceId`/`invoiceNumber`, `deliveredAt`, `codCollectedPaise`/`codCollectedAt`/`codRemittance{ status }`,
`cancelledAt`/`cancellationReason`/`cancelledBy`, `parentOrderId`/`replacementOrderId`. Orders created before Phase 2 lack these;
readers default them (`paymentMethod` prepaid, no tax breakdown — the invoice reconstructs it).
Staff-editable (rules): `status` (fulfilment moves only), `statusHistory`, `assignedTo`, `tracking{ carrier, trackingNumber, url }`,
`notes`, `updatedAt`.
`notes` is a string with two parts (parser: `src/lib/orders/orderNotes.ts`): free text (one `[YYYY-MM-DD HH:mm UTC <email>] text`
line per internal note) and, as the LAST line, an optional structured block `#vernox:v1 <compact JSON>`:
`{"qc":{"<itemId>":{"outcome":"pass|fail","checks":{"dimensions","finish","edges","hardware","photo": bool},"at","by","reason?"}},
"qcLog":[{"itemId","outcome","at","by","reason?"}] (last 50, append-only),"package":{"lengthCm","widthCm","heightCm","weightKg","at","by"}}`.
`qc` holds the latest result per item and is cleared when QC fails an order (so rework is re-inspected); `qcLog` keeps every
attempt with its reason; `package` is read by the shipping step (Phase 3b). A block that does not parse is kept as plain text and
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

### Server-only collections (no client access)
Phase 2 (India commerce):
- `invoices/{orderId}` — immutable GST tax invoice (`TaxDocument`, `api/_lib/gst/invoice.ts`): `number`, `financialYear`,
  `issuedAt`, `seller`, `buyer`, `placeOfSupply{ state, stateCode }`, `supplyType` (`intra_state` = CGST+SGST, `inter_state` =
  IGST), `lines[{ description, hsnCode, quantity, unitPricePaise, grossPaise, discountPaise, taxablePaise, gstRateBps, cgstPaise,
  sgstPaise, igstPaise, totalPaise }]`, `totals`, `taxInclusive: false`, `paymentMethod`. Issued once per order when the shipment
  is created (time of supply = removal of goods); never for replacement orders.
- `credit_notes/{refundId}` — same shape, `type: 'credit_note'`, `againstInvoice{ id, number }`, `refundId`, `reason`. One per
  refund on an invoiced order (and `cancel_{orderId}` for an invoiced COD order that is cancelled after RTO).
- `counters/{invoice|credit_note}_{YYYY-YY}` — `{ last }`, incremented in the issuing transaction. Numbers: `VX/26-27/000123`
  (invoices) and `CN/26-27/000004` (credit notes): consecutive per financial year (1 April–31 March IST), ≤ 16 characters (Rule 46).
- `refunds/{id}` — `{ orderId, amountPaise, reason, method: razorpay|manual, source: staff|customer_cancel|external, status:
  pending|processed|failed, requestedBy, providerRefundId (Razorpay id or manual bank/UPI reference), createdAt, processedAt,
  error, creditNoteId, creditNoteNumber }`. `ext_{rfnd_id}` documents record refunds made outside the store.
- `returns/{orderId}` — `{ status: requested|approved|rejected|received, reason, details, photoPaths[], resolution:
  refund|replacement|null, decisionNote, replacementOrderId, requestedAt, decidedAt, decidedBy, receivedAt }`.
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
- `rate_limits/{scope_hash_window}` — `{ count, scope, windowStart, expiresAt }`.
- `audit_logs/{id}` — `AuditLog` (`src/types/admin.ts`); readable by `super_admin`.
- `staff/{uid}` — `StaffMember` mirror of the role claim; readable by the member and `staff.read` roles.

### Client collections
- `users/{uid}` — owner read/write; `role`/`isAdmin` cannot be set by clients (roles are claims). Readable by `customers.read`.
- `wishlists/{uid}` — owner only.
- `reviews/{id}` — public read when `status == 'published'`; signed-in users create with `userId == uid`, `status: 'pending'`;
  moderation by `reviews.moderate` roles. List queries from the storefront must filter `status == 'published'`.
- `b2b_inquiries/{id}` — validated public create (shape of `B2BTradeModal`, `status: 'pending_review'`), read and updated by `b2b.read` roles. The
  admin screen moves `status` through `pending_review → contacted → quoted → won | lost`; no other field is written.
- `admin_users` — legacy, closed.

## Indexes
`orders`: (userId, placedAt desc), (status, placedAt desc), (email, placedAt desc), (status, reservationExpiresAt) for the cron;
`audit_logs`: (targetType, timestamp desc); `notifications_outbox`: (status, nextAttemptAt), (status, leaseUntil). Single-field indexes cover `orders.razorpayOrderId`, `orders.razorpayPaymentId`,
`coupons.code`. `orders.items` and `orders.customer` are exempt from indexing.

## TTL policies (configure once in the console / gcloud)
`rate_limits.expiresAt`, `idempotency.expiresAt`, `webhook_events.expiresAt`, `courier_events.expiresAt`,
`serviceability_cache.expiresAt`. Never set TTLs on `invoices`, `credit_notes`, `counters` or `refunds` (statutory records:
retain at least 72 months after the annual return).
