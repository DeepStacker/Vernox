# Vernox API

Serverless functions in `api/` (Vercel; also served by `server/index.ts` for Docker/local).
Shared server code lives in `api/_lib/` (the underscore keeps Vercel from deploying it as functions).

## Conventions

- JSON in, JSON out. Errors are always `{ "success": false, "code": "<CODE>", "message": "<human text>" }`.
- Codes: `VALIDATION_ERROR` (400/409), `INVALID_ITEM` (400), `INVALID_COUPON` (400), `INSUFFICIENT_STOCK` (409),
  `SIGNATURE_INVALID` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409),
  `METHOD_NOT_ALLOWED` (405), `RATE_LIMITED` (429), `PAYMENT_PROVIDER_ERROR` (502), `CONFIG_ERROR` (500), `INTERNAL_ERROR` (500).
- Money: the server computes in integer **paise**. `amount` fields are paise; every `pricing` object is in **rupees**
  (decimal numbers, e.g. `634.84`). No endpoint accepts a price, tax rate or shipping fee from the client.
- Auth: optional/required `Authorization: Bearer <Firebase ID token>`.
- Rate limits (per client IP, Firestore-backed, fixed 1-minute window): checkout-intent 20, validate-coupon 30,
  order-status 20, admin 120.

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
- Totals: GST on (subtotal − discount); shipping is free when the pre-discount subtotal is **≥** the threshold.

`200`:
```json
{ "success": true, "orderId": "Fh3k...", "orderNumber": "VX-20261105-7KQ2MZ", "razorpayOrderId": "order_...",
  "keyId": "rzp_test_...", "amount": 57136, "currency": "INR",
  "pricing": { "subtotal": 538, "discount": 53.8, "shipping": 0, "tax": 87.16, "total": 571.36,
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
| `UPDATE_ORDER_STATUS` | POST | `orders.update_status` (+ `orders.tracking` for `tracking`) | `orderId, status, note?, tracking?` |
| `SAVE_COUPON` | POST | `coupons.write` | `coupon` (code unique, upper-cased; `usedCount` is server-maintained) |
| `DELETE_COUPON` | POST | `coupons.write` | `couponId` |
| `SAVE_REVIEW` | POST | `reviews.moderate` | `review` |
| `DELETE_REVIEW` | POST | `reviews.moderate` | `reviewId` |

Removed: `LOGIN`, `GET_ADMINS`, `CREATE_ADMIN`, `UPDATE_ADMIN_ROLE` (shared password + HMAC session tokens), and the
`/api/create-order` endpoint (it accepted a client amount and was unused).
