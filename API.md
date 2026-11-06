# Vernox API

Serverless functions in `api/` (Vercel; also served by `server/index.ts` for Docker/local).
Shared server code lives in `api/_lib/` (the underscore keeps Vercel from deploying it as functions).

## Conventions

- JSON in, JSON out. Errors are always `{ "success": false, "code": "<CODE>", "message": "<human text>" }`.
- Codes: `VALIDATION_ERROR` (400/409), `INVALID_ITEM` (400), `INVALID_COUPON` (400), `COD_NOT_AVAILABLE` (400), `INSUFFICIENT_STOCK` (409),
  `SIGNATURE_INVALID` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409),
  `METHOD_NOT_ALLOWED` (405), `RATE_LIMITED` (429), `PAYMENT_PROVIDER_ERROR` (502), `SHIPPING_PROVIDER_ERROR` (502), `CONFIG_ERROR` (500), `INTERNAL_ERROR` (500).
- Money: the server computes in integer **paise**. `amount` fields are paise; every `pricing` object is in **rupees**
  (decimal numbers, e.g. `634.84`). No endpoint accepts a price, tax rate or shipping fee from the client.
- Auth: optional/required `Authorization: Bearer <Firebase ID token>`.
- Rate limits (per client IP, Firestore-backed, fixed 1-minute window): checkout-intent 20, validate-coupon 30,
  order-status 20, admin 120, serviceability 30, invoice 20, order-cancel 10, return-request 10; COD checkouts also 3 per hour
  per mobile number and per email.

## `POST /api/checkout-intent`

Prices the cart from Firestore, reserves stock and creates the order and its Razorpay order.
If a valid bearer token is sent, the order's `userId` is that user; otherwise it is a guest order (`userId: null`).
An invalid/expired token returns 401 (it is not silently treated as a guest).

```json
{
  "items": [
    { "productId": "p-01", "sizeLabel": "Medium · 50cm", "finish": "brass", "quantity": 2 },
    { "productId": "custom-bespoke", "widthMm": 300, "heightMm": 300, "finish": "steel", "quantity": 1, "customDesignRef": "<design ref>" }
  ],
  "couponCode": "WELCOME10",
  "idempotencyKey": "uuid-or-8-128-chars-[A-Za-z0-9_-]",
  "customer": { "email": "a@b.in", "name": "Asha Rao", "phone": "+91 98765 43210", "address": "12 MG Road",
                "city": "Bengaluru", "state": "Karnataka", "pincode": "560001", "country": "India" }
}
```

Item rules:
- Catalog items: `productId` must be a `products/{id}` document. `sizeLabel` must match one of the product's sizes
  (case-insensitive); otherwise exact `widthMm`/`heightMm` is matched. If the product lists `finishes`, `finish` must be one of
  them (lower-case ids such as `brass`, `steel`). Unknown fields such as `unitPrice` are ignored.
- Custom studio pieces: `productId: "custom-bespoke"`, `widthMm` and `heightMm` required (100–3000 × 100–1500 mm),
  `finish` must be a key of the custom rate table (`steel`, `natural_mill`, `black_patina`, `brushed_hairline`, `mirror_polish`,
  `stainless`, `corten`, `corten_rust`, `brass`, `antique_brass`, `copper`, `verdigris`, `gold`, plus any added in
  `settings/store.customPieces`). Price = `max(minimum, setupFee + width_cm × height_cm × ratePerCm2)`.
- `quantity` 1–100, at most 50 lines, `customDesignRef` ≤ 200 000 chars (≤ 700 000 total). Indian addresses need a 6-digit PIN.
- Totals: GST per line on (line − its share of the discount), plus GST on shipping and the COD fee (see India commerce below);
  shipping is free when the pre-discount subtotal is **≥** the threshold.
- `paymentMethod`: `"prepaid"` (default) or `"cod"` — see India commerce below.

`200`:
```json
{ "success": true, "orderId": "Fh3k...", "orderNumber": "VX-20261105-7KQ2MZ", "razorpayOrderId": "order_...",
  "keyId": "rzp_test_...", "amount": 57136, "currency": "INR",
  "paymentMethod": "prepaid",
  "pricing": { "subtotal": 538, "discount": 53.8, "shipping": 0, "codFee": 0, "tax": 87.16, "total": 571.36,
               "items": [{ "productId": "p-01", "name": "Ember Round Frame", "unitPrice": 269, "quantity": 2, "lineTotal": 538 }] } }
```

Errors: `VALIDATION_ERROR` 400 (bad body; total below ₹1), `INVALID_ITEM` 400, `INVALID_COUPON` 400, `INSUFFICIENT_STOCK` 409,
`VALIDATION_ERROR` 409 (idempotency key reused with a different cart, or the original checkout is still being prepared /
already closed), `PAYMENT_PROVIDER_ERROR` 502 (the order is cancelled, stock returned and the key freed — retrying with the same
key is safe), `RATE_LIMITED` 429, `UNAUTHENTICATED` 401, `CONFIG_ERROR` 500.

Idempotency: repeating the same body with the same key returns the same response without a second reservation.
Stock is held for 15 minutes (`reservationExpiresAt`); unpaid orders then become `Expired`.

## `POST /api/verify-payment`

Razorpay Checkout success handler payload — nothing else is read:
`{ "razorpay_order_id", "razorpay_payment_id", "razorpay_signature" }`.
Verifies `HMAC_SHA256(order_id|payment_id, RAZORPAY_KEY_SECRET)` with a constant-time compare, then marks the order `Paid` in one
transaction (stock committed, coupon redeemed, audit entry).

`200`: `{ "success": true, "orderId", "orderNumber", "status": "Paid", "isDuplicate": false }` (`isDuplicate: true` when it was
already paid, e.g. by the webhook). Errors: `SIGNATURE_INVALID` 400, `NOT_FOUND` 404, `CONFLICT` 409 (payment received for an
order that can no longer be paid; flagged for staff), `INTERNAL_ERROR` 500 if the write fails — success is never reported
without the write.

## `GET /api/order-status?orderId=...&email=...`

Guest-safe order summary for confirmation / track-order pages. Authorised when `email` matches the order (case-insensitive) or the
bearer token's uid owns the order. Unknown order and wrong email both return `NOT_FOUND` 404.

`200`: `{ "success": true, "order": { orderId, orderNumber, status, placedAt, currency, couponCode,
pricing: { subtotal, discount, shipping, tax, total }, items: [{ productId, name, unitPrice, quantity, lineTotal, sizeLabel, finish, isCustom }],
timeline: [{ status, at }], tracking: { carrier, trackingNumber, url } | null, shipTo: { name, city } } }`.
No street address, phone, payment ids or design files are returned.

## `POST /api/validate-coupon`

Preview only (checkout re-evaluates). Body: `{ "code": "WELCOME10", "items": [<checkout items>], "customerEmail"?: "a@b.in" }`.
Lines are priced on the server; coupons are read only from Firestore.
`200`: `{ isValid, couponId?, couponCode?, discountType?, discountValue?, discountAmount /* ₹ */, description?, errorCode?, error?,
pricing: { subtotal, discount, shipping, tax, total } }`. Invalid coupons return 200 with `isValid: false`; bad items return 400 `INVALID_ITEM`.

## `POST /api/razorpay-webhook`

Razorpay → server. Signature: `HMAC_SHA256(raw body, RAZORPAY_WEBHOOK_SECRET)` over the exact bytes (body parser disabled).
Handles `payment.captured` / `order.paid` (→ `Paid`, amount and currency must match the order, else `Payment_Discrepancy`),
`payment.failed` (→ `Payment_Failed`, reservation released; a later successful attempt still marks the order paid and
re-takes stock, flagging any shortfall), `refund.processed` (→ `Partially_Refunded` or `Refunded` by cumulative amount, each
refund id once). Every event is recorded in `webhook_events/{x-razorpay-event-id}`; repeats are acknowledged without
re-processing. Events for unknown orders are stored with outcome `unmatched` and acknowledged with 200 (so Razorpay does not
disable the webhook for events this store can never match); transient errors return 500 so Razorpay retries.
`200`: `{ "received": true, "outcome": "<outcome>" }`.

## `GET /api/cron/release-reservations`

Vercel Cron, every 5 minutes (`vercel.json`). Requires `Authorization: Bearer $CRON_SECRET`. Expires up to 200 overdue
`Pending_Payment` orders per run and returns their stock. `200`: `{ success, scanned, expired, failed, more }`.

## `/api/admin`

Staff only: bearer Firebase ID token with a `role` custom claim (see SECURITY.md). Revoked tokens are rejected.
POST body / GET query: `{ "action": "...", ... }` → `200 { "success": true, ... }`.

| Action | Method | Permission | Params → result |
|---|---|---|---|
| `GET_AUDIT_LOGS` | GET | `audit.read` | `targetType?` → `{ logs }` (latest 100) |
| `LOG_AUDIT` | POST | any staff | `eventAction, targetType, targetId?, details?` (stored with `source: 'client_reported'`) |
| `LIST_STAFF` | GET | `staff.read` | → `{ staff: StaffMember[] }` |
| `SET_STAFF_ROLE` | POST | `staff.manage` | `email` or `uid`, `role: StaffRole \| null` → `{ staff }`; cannot change own role |
| `ADD_ORDER_NOTE` | POST | `customers.read` | `orderId, note (1–500)` | `{ orderId, notes }` — appends `[YYYY-MM-DD HH:mm UTC <email>] note` to `orders.notes` in a transaction and keeps the `#vernox:v1` block; for roles that cannot write orders (support). 400 when `notes` would exceed 20 000 characters |
| `UPDATE_ORDER_STATUS` | POST | `orders.update_status` (+ `orders.tracking` for `tracking`) | `orderId, status` (workshop stage: `In_Design`, `Cutting`, `Finishing`, `Quality_Check`, `Packed`), `note?, tracking?` |
| `SAVE_COUPON` | POST | `coupons.write` | `coupon` (code unique, upper-cased; `usedCount` is server-maintained) |
| `DELETE_COUPON` | POST | `coupons.write` | `couponId` |
| `SAVE_REVIEW` | POST | `reviews.moderate` | `review` |
| `DELETE_REVIEW` | POST | `reviews.moderate` | `reviewId` |

Removed: `LOGIN`, `GET_ADMINS`, `CREATE_ADMIN`, `UPDATE_ADMIN_ROLE` (shared password + HMAC session tokens), and the
`/api/create-order` endpoint (it accepted a client amount and was unused).

## India commerce (Phase 2)

### Cash on delivery via `POST /api/checkout-intent`

Add `"paymentMethod": "cod"` to the checkout body (default `"prepaid"`; omitting it keeps the Phase 1 contract, and prepaid
responses now also carry `"paymentMethod": "prepaid"`). COD is refused with `400 COD_NOT_AVAILABLE` when:
COD is switched off (`settings/store.codEnabled`), the cart has a Crafting Studio piece (`custom-bespoke`), the PIN code is not
COD-serviceable, the total (incl. GST) is above `codMaxOrderValue`, or the mobile number already has `codMaxOpenOrdersPerPhone`
undelivered COD orders. Extra rate limits: 3 COD checkouts per hour per mobile number and per email (`429 RATE_LIMITED`).

The COD fee (`settings/store.codFee`) is its own line and is taxable at the goods' GST rate (composite supply), as is shipping.
A COD order is created as `Confirmed_COD` with stock committed and its coupon redeemed; no Razorpay order is created.

`200` (COD): `{ "success": true, "orderId", "orderNumber", "paymentMethod": "cod",
"pricing": { subtotal, discount, shipping, codFee, tax, total, items } }`. `pricing.codFee` is 0 for prepaid orders.

GST (all orders, since Phase 2): prices are GST-exclusive. GST is computed per line (product `gstRatePercent`, else the store
rate), after allocating any discount to lines pro rata, and on shipping and the COD fee at the highest line rate; each line is
rounded to the paisa, so `tax` equals the invoice's tax total exactly.

### `GET /api/serviceability?pincode=560001&productId=p-01`

Public; 30 requests/min per IP. `productId` is optional (`custom-bespoke` gives the custom lead time).
`200`: `{ "success": true, "pincode", "serviceable", "codAvailable", "estimatedDispatchDays", "estimatedDeliveryDate": "YYYY-MM-DD" | null,
"courierName": string | null }`. Dispatch days = product `leadTimeDays` (else `defaultLeadTimeDays`; custom pieces
`customLeadTimeDays`); delivery date = today (IST) + dispatch + courier transit (Shiprocket estimate, else `manualTransitDays`).
`codAvailable` is false for custom pieces. Errors: `400 VALIDATION_ERROR` (bad PIN), `429`, `502 SHIPPING_PROVIDER_ERROR`.
Answers are cached per PIN for 12 h.

### `GET /api/order-status` additions

`order` now also has `paymentMethod`, `pricing.codFee`, `invoiceNumber` (null until dispatch), `canCancel` (boolean) and
`returnEligibleUntil` (epoch ms or null). `tracking` comes from the courier shipment when there is one.

### `POST /api/order-cancel`

Body `{ "orderId", "email"?, "reason"? }`; access like order-status (owner bearer token or the order's email). 10/min per IP.
Allowed only in `Paid` or `Confirmed_COD` (before production), else `409 CONFLICT`. Returns stock; for prepaid orders requests a
full Razorpay refund (the order moves `Cancelled → Refunded` when `refund.processed` arrives).
`200`: `{ "success": true, "orderId", "status": "Cancelled", "refund": { status: "pending" | "processed", amount /* ₹ */ } | null,
"message" }`. If the refund cannot be started the order is still cancelled, flagged `REFUND_NOT_STARTED`, and `message` says so.

### `POST /api/return-request`

Body `{ "orderId", "email"?, "reason": "damaged" | "defective" | "wrong_item" | "not_as_described" | "changed_mind",
"details"?: string ≤ 2000, "photoPaths"?: string[] ≤ 6 }`. Photo paths are Firebase Storage paths `returns/{orderId}/{file}`
uploaded by the signed-in customer (storage.rules: images ≤ 5 MB). Access like order-status; 10/min per IP.
Rules: order `Delivered` and within `returnWindowDays` of delivery; orders with a custom piece only for damaged / defective /
wrong_item; damaged and defective need ≥ 1 photo; one return per order.
`200`: `{ "success": true, "orderId", "status": "Return_Requested", "returnStatus": "requested" }`. Errors `400`, `404`, `409`.

### `GET /api/invoice?orderId=...&email=...[&creditNoteId=...][&format=json]`

Access: owner bearer token, the order's email, or a staff token with `orders.read`. 20/min per IP.
Default: `application/pdf` of the tax invoice (or the credit note `creditNoteId`), rendered from the stored record.
`format=json`: `{ "success": true, "invoice": { id, type, number, issuedAt, total /* ₹ */, againstInvoice } | null, "creditNotes": [...] }`.
`404 NOT_FOUND` before dispatch ("The invoice is issued when your order is dispatched.").

### `POST /api/courier-webhook`

Shiprocket tracking webhook (named without "shiprocket": Shiprocket rejects URLs containing it). Header `x-api-key` must equal
`SHIPROCKET_WEBHOOK_TOKEN` (constant-time; else `401`). Body: Shiprocket's JSON (`awb`, `current_status`, `current_status_id`,
`current_timestamp`, ...). Idempotent per awb + status + timestamp (`courier_events`). Status mapping
(api/_lib/shipping/statusMap.ts): PICKED UP / SHIPPED / IN TRANSIT / REACHED DESTINATION HUB → `Shipped`; OUT FOR DELIVERY →
`Out_For_Delivery`; DELIVERED → `Delivered` (COD: `codCollectedPaise` recorded); RTO INITIATED / RTO IN TRANSIT → `RTO_Initiated`;
RTO DELIVERED / ACKNOWLEDGED → `RTO_Delivered`; anything else is recorded only. A later event implies a missed pickup scan.
`200`: `{ "received": true, "outcome": "applied" | "ignored" | "unmapped_status" | "unmatched" | "duplicate_event" | "invalid" }`.

### `GET /api/cron/send-notifications`

Vercel Cron, every 2 minutes, `Authorization: Bearer $CRON_SECRET`. Delivers up to 50 due outbox documents (plus expired leases)
by email (Resend) and SMS (MSG91); backoff 1, 2, 4 … min (max 6 h), `dead` after 8 attempts.
`200`: `{ success, scanned, sent, retrying, dead }`.

### New `/api/admin` actions

All return `200 { "success": true, ... }` on success and the standard error body otherwise. Amounts in request params are rupees;
amounts in responses ending in `Paise` are paise. `orderId` is the Firestore order id.

| Action | Method | Permission | Params | Result |
|---|---|---|---|---|
| `CREATE_SHIPMENT` | POST | `orders.tracking` | `orderId`; **Shiprocket:** `package: { lengthCm, breadthCm, heightCm, weightKg }` (each > 0; ≤ 300 cm, ≤ 100 kg); **manual:** `manual: { courier (2–80), awb ([A-Za-z0-9-]{4,40}), trackingUrl? }` | `{ shipment: ShipmentRecord, status, invoiceNumber }` |
| `CANCEL_SHIPMENT` | POST | `orders.tracking` | `orderId, reason (3–300)` | `{ orderId }` |
| `GET_LABEL` | GET | `orders.tracking` | `orderId` | `{ labelUrl, manifestUrl }` (null for manual shipments) |
| `UPDATE_DELIVERY_STATUS` | POST | `orders.tracking` | `orderId, status: 'Shipped' \| 'Out_For_Delivery' \| 'Delivered' \| 'RTO_Initiated' \| 'RTO_Delivered', note? (≤ 200)` | `{ orderId, status }` — same path as the courier webhook; for manual shipments |
| `CANCEL_ORDER` | POST | `orders.update_status` (+ `orders.refund` when `refund` is true) | `orderId, reason (3–300), refund?: boolean = true` | `{ orderId, status: 'Cancelled', refund: RefundDoc \| null, refundError: string \| null }` |
| `CREATE_REFUND` | POST | `orders.refund` | `orderId, amount (₹ > 0), reason (3–300), method?: 'razorpay' \| 'manual' = 'razorpay', reference? (4–80, required for manual: bank/UPI ref), idempotencyKey? ([A-Za-z0-9_-]{8,64})` | `{ refund: RefundDoc }` (`status` `pending` until Razorpay confirms, `processed` for manual) |
| `GET_ORDER_DOCUMENTS` | GET | `orders.read` | `orderId` | `{ invoice: { id, number, issuedAt, supplyType, totals } \| null, creditNotes: [{ id, number, issuedAt, refundId, totals }], refunds: RefundDoc[], return: ReturnDoc \| null, refundablePaise, shipment }` |
| `APPROVE_RETURN` | POST | `orders.update_status` | `orderId, resolution: 'refund' \| 'replacement', note? (≤ 300, shown to the customer)` | `{ orderId, status: 'Return_Approved' }` |
| `REJECT_RETURN` | POST | `orders.update_status` | `orderId, reason (3–300, shown to the customer)` | `{ orderId, status: 'Delivered' }` |
| `MARK_RETURN_RECEIVED` | POST | `orders.update_status` | `orderId, restock?: boolean = false, note?` | `{ orderId, status: 'Returned', replacementOrderId \| null, replacementOrderNumber \| null }` |

Rules and side effects:
- `CREATE_SHIPMENT` needs status `Packed`. It first issues the GST invoice (once; fails with `500 CONFIG_ERROR` if
  `settings/store.seller` lacks legal name, GSTIN, address, state, state code or PIN), then books the courier. Shiprocket:
  create order → assign AWB → pickup → label → manifest; the order stays `Packed` with `shipment.status: 'awb_assigned'` until the
  pickup scan arrives by webhook. A failed step returns `502 SHIPPING_PROVIDER_ERROR` and stores the progress; calling again
  resumes. Manual: the order moves to `Shipped` at once. Calling it for an order with an active shipment returns that shipment.
- `CANCEL_SHIPMENT` only while `Packed` (not picked up); cancels at Shiprocket.
- `CANCEL_ORDER` from any status the state machine allows (`Paid`, `Confirmed_COD`, workshop stages, `RTO_Delivered`); returns
  committed stock; prepaid orders get a full refund of the refundable balance; an invoiced COD order gets a credit note.
- `CREATE_REFUND`: `amount ≤ collected − refunded − pending` (collected = captured payment, or the COD cash collected on
  delivery), else `409 CONFLICT`. Razorpay refunds use `receipt` = refund id; `refund.processed` reconciles to the same refund
  document, so the webhook and the API response never double count. A refund on an invoiced order issues a credit note.
- Returns: refunds for returned items are issued by finance with `CREATE_REFUND` (separation of duties). A replacement creates a
  linked zero-value order (`paymentMethod: 'replacement'`, status `Paid`, `parentOrderId`) that goes through production; no tax
  invoice is issued for it.
- `UPDATE_ORDER_STATUS` now accepts only the workshop statuses `In_Design`, `Cutting`, `Finishing`, `Quality_Check`, `Packed`
  (was `Designing`, `Cutting`, `Finished`, `Shipped`, `Delivered`, `Cancelled`); shipping, delivery and cancellation moved to the
  actions above. It enqueues the "in production" notification on `In_Design`.

`ShipmentRecord`: `{ provider: 'shiprocket' | 'manual', status: 'created' | 'awb_assigned' | 'pickup_scheduled' | 'in_transit' |
'delivered' | 'rto' | 'cancelled', shipmentId, providerOrderId, awb, courier, trackingUrl, labelUrl, manifestUrl,
pickupScheduledAt, lastEvent: { status, at } | null, error, createdAt, updatedAt }`.
`RefundDoc`: see DATABASE.md `refunds`. `ReturnDoc`: see DATABASE.md `returns`.


## Design consultation (Stage 2)

A paid service sold through the ordinary prepaid checkout; ROADMAP.md "Decision: room scanning and interior planning". The
customer's space and walls are read and written directly in Firestore/Storage (DATABASE.md, `users/{uid}/spaces`); everything
that moves money or changes a consultation goes through the API.

### `POST /api/consultation`
Signed-in customer only (`Authorization: Bearer <ID token>`, else `401`); rate-limited per IP. Body `{ "action": ..., ... }`.

| Action | Params | Result |
|---|---|---|
| `PURCHASE` | `spaceId, idempotencyKey ([A-Za-z0-9_-]{8,128}), name, phone, state` | Same body as a prepaid `checkout-intent`: `{ orderId, orderNumber, razorpayOrderId, keyId, amount (paise), currency, pricing }` |
| `REQUEST_REVISION` | `consultationId, message (3–1000)` | `{ success: true }` |
| `CLOSE` | `consultationId, outcome: 'accepted' \| 'declined'` | `{ success: true }` |

- `PURCHASE` reads the caller's own space (`users/{uid}/spaces/{spaceId}`, `404` if missing; another customer's space is never
  reachable), needs at least one wall with a photo (`400`), and needs `settings/store.consultation.enabled` (`409` otherwise). The
  fee, SAC and GST come from settings only: the client never sends a price. The order is `kind: 'service'`, prepaid, with one line
  (`productId: 'design-consultation'`), no stock, no shipping, no COD, no coupon. Payment is completed with the normal
  `POST /api/verify-payment` (or the webhook); on `Paid` the server creates `consultations/{orderId}` and, when
  `creditTowardsOrder`, the credit coupon, in the same transaction, then copies the wall photos. The `order_confirmed` email
  for a consultation order is the consultation receipt (with the credit code).
- `REQUEST_REVISION`: only while `proposed` and only once (`409` afterwards): status back to `in_progress`, `revisionNote` set,
  turnaround clock restarted.
- `CLOSE`: only while `proposed`; the consultation becomes `closed` with the outcome.
- Someone else's consultation answers `404`, like a missing one.
- `/api/checkout-intent` cannot buy the consultation: `design-consultation` is not a product, so it is rejected as `INVALID_ITEM`.

### Credit coupons (per-customer binding)
`coupons/cc_{orderId}` is a `fixed` coupon for the consultation fee (before GST), `maxUsageCount: 1`, expiring after
`creditValidityDays`, with `boundEmail` = the buyer's email. The coupon engine (`api/_lib/coupons.ts`) now refuses a coupon whose
`boundEmail` differs from the checkout email: `COUPON_NOT_FOR_CUSTOMER` in `/api/validate-coupon` ("This coupon was issued to
another customer."), `INVALID_COUPON` at checkout. `/api/validate-coupon` therefore needs `customerEmail` for such codes (the cart
sends the signed-in email). Redemption (on payment) also stamps `consultations/{id}.creditRedeemedAt/creditRedeemedOrderId`.

### New `/api/admin` actions (consultations)
| Action | Method | Permission | Params | Result |
|---|---|---|---|---|
| `CLAIM_CONSULTATION` | POST | `consultations.manage` | `consultationId` | `{ status, photosReady }`; `new` → `in_progress`, assigns the caller; `409` if another designer has it (admins may take over); retries the photo copy when it had failed |
| `SAVE_PROPOSAL_DRAFT` | POST | `consultations.manage` | `consultationId, draft: { items: ProposalItem[] (≤ 12), note (≤ 1000) }` | `{ consultationId }`; only the assignee (or an admin) while `in_progress`; previews must be `consultations/{id}/previews/{itemId}.png` |
| `SEND_PROPOSAL` | POST | `consultations.manage` | `consultationId` | `{ version }`; validates every piece (catalogue size/finish via the checkout pricing, custom size/finish via the custom-piece rules), sets `proposed`, enqueues one `proposal_ready` email per version |

Reads of consultations and drafts are by Firestore rules (`consultations.read`), not through the API.

### Notifications and orders
New event `proposal_ready` (outbox id `{orderId}_proposal_ready_v{n}`). `order_confirmed` carries `service: 'consultation'` plus
`creditCode/creditPaise/creditExpiresAt` for consultation orders. Consultation orders are never shipped or invoiced by the shipping
flow, are excluded from the workshop queues, and cannot be cancelled by the customer (`409`); finance refunds them with `CREATE_REFUND`.

## Customer engagement

### `POST /api/engage`
One function for the storefront's engagement writes (the deployment is near its function limit). Body `{ "action": ..., ... }`; errors use the usual `{ success: false, code, message }`.

| Action | Auth | Params | Rate limit (per IP) | Result |
|---|---|---|---|---|
| `CONTACT` | none | `name, email, phone?, topic (Order help \| Custom or bulk order \| Product question \| Something else), orderNumber?, message (5–4000), website` | 5 / hour | `{ success: true, ref }`; creates `tickets/{id}` and queues a `support_ticket` alert |
| `NEWSLETTER_SUBSCRIBE` | none | `email, source? (footer \| checkout \| account), website` | 10 / hour | `{ success: true }` (same answer for new and existing subscribers) |
| `NEWSLETTER_UNSUBSCRIBE` | none | `emailHash, token` | 10 / hour | `{ success: true }`; `404` for an unknown hash or wrong token |
| `REVIEW_STATUS` | Bearer ID token | `productId` | 30 / minute | `{ success: true, eligible, reason?: not_purchased \| already_reviewed, reviewStatus? }` |
| `SUBMIT_REVIEW` | Bearer ID token | `productId, rating (1–5), comment (10–2000)` | 30 / minute | `{ success: true }`; `403` without a Delivered order containing the product, `409` if already reviewed |

- `website` is a honeypot: a non-empty value is answered with `200` and nothing is stored.
- Tickets are worked through `/api/admin` actions `ADD_TICKET_MESSAGE { ticketId, direction: reply \| note, text }` and
  `SET_TICKET_STATUS { ticketId, status: open \| waiting \| resolved }` (permission `tickets.write`, audited).
