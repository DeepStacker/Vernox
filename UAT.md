# Vernox User Acceptance Test (UAT) Scripts

End-to-end acceptance scripts for launching the business. Run them on a staging environment that uses payment-gateway **test mode**, a test courier account and a seeded catalog.

## How to use this document

- **Result column:** record `Pass`, `Fail` or `N/A` with date and tester initials. Every `Fail` needs a defect ID.
- **Blocked cases:** a case marked `Blocked: Phase N` depends on a feature that is not built yet. The phases come from `ROADMAP.md`:
  1. Foundation
  2. India commerce (pincode serviceability, COD, GST invoice, courier, notifications, cancellation, returns)
  3. Operations consoles. 3a (done): role home, production, QC and packing, support, trade enquiries, catalog manager, staff screen. 3b (pending): shipping, finance, returns
  4. Storefront redesign
  5. UAT

  Do not execute a blocked case until its phase ships; re-baseline it then. Cases with no marker are testable on the current build.
- **Roles:** the admin role names below are logical roles. Production, QC and packing, Support and Trade enquiries have their own consoles since Phase 3a; Shipping and Finance still use the generic Orders and Analytics tabs until Phase 3b (see Section 12, role permission tests).
- **Test data:** use the test cards, UPI IDs and netbanking banks published by the payment gateway for test mode. Never use real card data.
- **Sign-off:** launch requires all non-blocked cases to pass, and all blocked cases to pass after their phase ships.

## Environments and test accounts

| Item | Value |
|---|---|
| Base URL | `VITE_SITE_URL` of the staging deployment |
| Guest | no account, fresh private browser window |
| Customer A / Customer B | two signed-in customer accounts with different emails and phones |
| Admin roles | one account per role: Catalog manager, Order manager, Production, QC and packing, Shipping, Finance, Support, Super admin |
| Test pincodes | one serviceable (e.g. 560001), one non-serviceable, one COD-ineligible (manual provider: any valid PIN is serviceable; use Shiprocket test lanes or `codEnabled: false` for the negative cases) |
| Devices | Chrome desktop, iPhone Safari, mid-range Android Chrome |

---

## 1. Customer (guest)

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| CG-01 | Home page loads | Staging deployed | Open `/` | Hero, collections and featured products render; no console errors; title is "Vernox ... made to order in India" | |
| CG-02 | Browse by category | Products in 2+ categories | Open `/shop`, click a category | URL becomes `/shop/<category>`; only that category's products listed; count matches | |
| CG-03 | Filter and sort | Shop open | Apply finish filter, price cap, sort by price low to high | List updates; order and filters correct; clearing filters restores all | |
| CG-04 | Search | Shop open | Search a known product name and a nonsense term | Match shown; nonsense shows empty state, no crash | |
| CG-05 | Product detail | A published product | Open `/product/<slug>` | Images, price in INR, finish and size selectors, stock state, reviews visible; page title and meta match the product | |
| CG-06 | Variant price change | PDP with sizes | Change size and finish | Price updates per the size delta; selected variant carried to cart | |
| CG-07 | Out of stock product | Product with stock 0 and tracking on | Open PDP | "Out of stock" shown; add to cart disabled | |
| CG-08 | Add to cart | PDP open | Add item, open cart drawer | Item, variant, quantity, line price and subtotal correct | |
| CG-09 | Cart edits | Item in cart | Increase, decrease, remove | Totals recompute; removal confirmed; cart persists after page reload | |
| CG-10 | Quantity above stock | Product stock = 2 | Try to set quantity 5 | Quantity capped or error shown; cannot exceed stock | |
| CG-11 | Valid coupon | Active coupon `TEST10` | Apply in cart | Discount line shown; total correct; rules (min order, category) honoured | |
| CG-12 | Invalid, expired, used-up coupon | Coupons configured | Apply each | Clear error for each; no discount applied | |
| CG-13 | Guest checkout form validation | Item in cart | Open `/checkout`, submit empty and invalid email, phone, pincode | Field-level errors; cannot pay | |
| CG-14 | Pincode serviceability | Item in cart | Enter serviceable and non-serviceable pincode | Checkout shows "Estimated delivery by <date>" or "We do not deliver to this PIN code yet" (and blocks Continue); `GET /api/serviceability` returns the same. PDP widget once wired in | |
| CG-15 | Pay by UPI success | Test mode | Choose UPI, pay with test success VPA | Redirect to `/order-confirmation/<id>`; order number, items, address, total shown; cart emptied | |
| CG-16 | Pay by card success | Test mode | Pay with test success card | Same as CG-15 | |
| CG-17 | Pay by netbanking success | Test mode | Pay via test bank, success | Same as CG-15 | |
| CG-18 | Cash on delivery | COD enabled, eligible pincode and value | Choose COD, place order | Order created as `Confirmed_COD` with no payment window; confirmation shows the total incl. COD fee (+ GST on it); stock decremented; confirmation notification queued | |
| CG-19 | COD ineligible | COD-ineligible pincode or above value cap | Open payment step | COD radio disabled with the reason (PIN not COD-eligible / above the value cap / COD off); forcing it via API returns `COD_NOT_AVAILABLE` | |
| CG-20 | Payment failure | Test mode | Pay with test failure card | Failure message; cart retained; order not marked paid; retry possible | |
| CG-21 | Payment abandoned | Test mode | Close payment window without paying | Order stays unpaid; cart retained; stock reservation released after timeout | |
| CG-22 | Double submit | Test mode | Click Pay twice quickly | Only one order created and one charge | |
| CG-23 | Confirmation email / SMS / WhatsApp | Notifications configured | Complete CG-15 | Order confirmation received within 2 minutes with correct order number and total | Needs Resend / MSG91 configured |
| CG-24 | Track order (guest) | A paid order | Open `/track-order`, enter order number and email or phone | Current status and timeline shown | |
| CG-25 | Track order wrong details | Same | Enter wrong email for a valid order number | No order data revealed; generic not-found message | |
| CG-26 | Custom design in studio | Studio enabled | Open `/studio`, design a shape, set size and material, add to cart | Design with dimensions, material, price in cart; checkout works | |
| CG-27 | Studio manufacturability warning | Studio open | Create a feature below minimum cut width | Warning shown; blocked or flagged per manufacturing rules | |
| CG-28 | Redirect aliases | None | Open `/b2b`, `/customize`, `/shipping-returns` | Redirect to `/trade`, `/studio`, `/returns` respectively | |
| CG-29 | B2B enquiry | Trade page | Submit the trade form with valid data | Success message; enquiry visible to Support and Super admin | |
| CG-30 | Contact form | Contact page | Submit valid and invalid messages | Valid accepted; invalid rejected with field errors | |
| CG-31 | Policy pages | None | Open `/privacy`, `/terms`, `/shipping`, `/returns`, `/faqs` | Pages render with correct content and titles | |
| CG-36 | COD refused for custom studio item | Cart with a studio design | Open payment step; also POST checkout-intent with `paymentMethod: "cod"` | COD disabled with "Custom studio designs are prepaid only"; API returns 400 `COD_NOT_AVAILABLE` | |
| CG-37 | COD limit per mobile | Two undelivered COD orders on one mobile | Place a third COD order | Refused with `COD_NOT_AVAILABLE`; after one is delivered, allowed. 4th COD attempt in an hour from one number: 429 | |
| CG-32 | 404 page | None | Open `/does-not-exist` | Friendly 404 with navigation; not indexed (`noindex`) | |
| CG-33 | Review submit as guest | Delivered order exists | Try to review a product | Prompted to sign in, or review only allowed for verified purchase | |

## 2. Customer (signed in)

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| CS-01 | Sign up and sign in | None | Create account, sign out, sign in | Session persists across reload; sign-out clears it | |
| CS-02 | Account page | Signed in | Open `/account` | Profile, orders, addresses, wishlist visible | |
| CS-03 | Order history | Customer A has 2 orders | Open order list | Only Customer A's orders; statuses and totals correct | |
| CS-04 | Saved addresses | Signed in | Add, edit, delete address; use at checkout | Persisted; prefilled at checkout | |
| CS-05 | Wishlist | Signed in | Add and remove wishlist items; reload | Persisted across reload and devices | |
| CS-06 | Guest cart merge | Guest cart has items | Sign in | Cart merged without duplicate lines | |
| CS-07 | Submit review (verified purchase) | Delivered order | Submit rating, text, photo | Review goes to moderation; not public until approved | |
| CS-08 | Review validation | Signed in | Submit empty text, very long text, script tags | Rejected or sanitized; no script executes | |
| CS-09 | Request cancellation | Order not yet in production | Cancel from order page | `POST /api/order-cancel` while Paid / Confirmed_COD: order Cancelled, stock restored, Razorpay refund created (prepaid), cancellation notification; status Refunded after the refund webhook | Testable via API (UI: Phase 3) |
| CS-10 | Cancellation not allowed | Order already cut or shipped | Try to cancel | `POST /api/order-cancel` after In_Design returns 409 with "already in production" text | Testable via API (UI: Phase 3) |
| CS-11 | Request return or replacement | Delivered within return window | Raise return with reason and photos | Photo upload to `returns/{orderId}/` allowed (image ≤ 5 MB); `POST /api/return-request` moves the order to Return_Requested; `GET_ORDER_DOCUMENTS` shows the return | Testable via API (UI: Phase 3) |
| CS-12 | Return window expired | Delivered beyond window | Try to raise return | `POST /api/return-request` after `returnWindowDays` returns 409 with the window text | Testable via API (UI: Phase 3) |
| CS-13 | Download GST invoice | Paid order | Download invoice | Invoice available after dispatch (`GET /api/invoice`): PDF with seller GSTIN, HSN per line, CGST+SGST (same state) or IGST, number `VX/YY-YY/NNNNNN`; 404 "issued when dispatched" before that | Testable via API (download button: Phase 3) |
| CS-14 | Data export and delete | Signed in | Request data export and account deletion | Request recorded and fulfilled per privacy policy | Blocked: Phase 2 |

## 3. Catalog manager

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| CM-01 | Create product with variants and images | Catalog role | Admin > Catalog > New product: name, slug, category, description, 3 sizes (label, width, height, price difference), 3 finishes, MRP, lead time, HSN, 2 image URLs, stock | Saved; appears in the admin list with price and stock; live preview shows unit price, MRP and discount per size; image previews render | |
| CM-02 | Slug uniqueness | Existing slug | Create product with the same slug | Rejected with clear error | |
| CM-03 | Validation | None | Save with empty name, price 0, MRP below price, no finishes, no sizes, bad HSN, `javascript:` image URL | Field-level errors; nothing saved | |
| CM-04 | Publish to storefront | Draft product | Publish | Appears in `/shop`, correct category, PDP loads, in sitemap after next build | |
| CM-05 | Unpublish | Live product | Unpublish | Disappears from shop and search; direct PDP URL shows not found; existing orders unaffected | |
| CM-06 | Edit price | Live product in a customer's cart | Change price | New price on shop and PDP; cart reprices or warns at checkout | |
| CM-07 | Stock adjustment | Tracked product | Set stock to 0, then 10 | Storefront reflects out of stock then in stock; change audited | |
| CM-08 | Image upload limits | None | Upload oversized and non-image file | Rejected with message; valid image optimized | Blocked: Phase 3b (file upload needs storage.rules; product images are URL-based today) |
| CM-09 | Coupons | Catalog or marketing permission | Create percent and flat coupons with min order, expiry, usage limit | Coupons behave per CG-11 and CG-12 | |
| CM-10 | Hero slider | None | Edit slider slide and order | Home reflects change | |
| CM-11 | Review moderation | Pending review (CS-07) | Approve, then reject another | Approved appears on PDP and updates rating; rejected never appears | |
| CM-12 | Audit trail | Actions above done | Open audit log | Each action recorded with user, time, before and after | |
| CM-13 | Product with DXF template | Production-ready design | Attach cut template to product | Template available to Production on resulting orders | Blocked: Phase 3b |
| CM-14 | Sample products | Seeded sample catalog | Catalog > filter "Sample products"; edit one, untick "Sample product", save | Sample badge and banner count drop; filter no longer lists it | |
| CM-15 | Server-known finishes only | None | Open the finish chips on a product | Only the standard finish ids are offered (legacy ids appear only on products already using them) | |
| CM-16 | Stock and low-stock view | Products with stock 0, 3, 20 | Use +/- buttons; filters "Low stock" and "Out of stock" | Counts update and persist; untracked products are never "out of stock" | |
| CM-17 | Duplicate product | Existing product | Duplicate, save with a new slug | New product created with the same sizes and finishes | |

## 3a. Role home and trade enquiries

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| RH-01 | Production home | Production login | Open Home | Counts per stage, oldest-first queue with SLA badges, "Assigned to me", overdue warning; no revenue figures | |
| RH-02 | Support home | Support login | Open Home | Open orders and new trade enquiries counts with links | |
| RH-03 | Catalog home | Catalog login | Open Home | Out of stock, low stock and sample product counts | |
| RH-04 | Analytics is real | Order manager or Finance | Open Analytics for 7, 30, 90 days | Paid orders, revenue, average order value, status counts, top products and daily revenue match the Orders list; no cost, margin or profit figures; a notice appears when loaded orders do not cover the range | |
| B2B-01 | List and filter | Enquiries from CG-29 | Trade enquiries; filter each status | Newest first; counts per status | |
| B2B-02 | Change status | Support or Order manager | Mark Contacted, Quoted, Won, Lost | Persisted after reload | |
| B2B-03 | No access | Production, Shipping, Finance, Catalog logins | Look for Trade enquiries | Tab absent; direct Firestore read refused | |

## 4. Order manager

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| OM-01 | See new order | CG-15 done | Open admin orders | Order listed with correct customer, items, totals, payment state | |
| OM-02 | Filter and search orders | Many orders | Filter by status, date; search order number, phone | Correct results | |
| OM-03 | Order detail | Any order | Open detail | Items with variants and custom design files, address, payment reference, timeline | |
| OM-04 | Verify payment state | Paid and failed orders | Compare with gateway dashboard | Statuses match exactly | |
| OM-05 | Move order to production | Paid order | Open Production console as Order manager; move the order to "In Design" | Order shows in the In Design column; timeline records the user | |
| OM-06 | Hold order | Paid order | Put on hold with reason | Status "On hold"; reason visible; Production cannot start it | Blocked: Phase 3b (no hold status in the state machine yet) |
| OM-07 | Edit address before dispatch | Order not shipped | Change address and pincode | Saved, audited; shipping rate recomputed | Blocked: Phase 2 |
| OM-08 | Cancel order | Paid order, not in production | Cancel with reason | `CANCEL_ORDER`: Cancelled; stock restored; full refund requested when the role has `orders.refund` (else `refund: false` and finance refunds) | Testable via API (UI: Phase 3) |
| OM-09 | Invalid status jump | Any order | Try Delivered from Paid | Refused; only valid transitions offered | |
| OM-10 | Custom design review | Studio order | Production console > open order > check item specs and "customer design" label; download DXF and SVG | Dimensions, material and finish match what the customer ordered; manufacturability warnings (if any) listed. Requesting clarification is not built (use order notes) | |

## 5. Production / workshop

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| PR-01 | Production queue | Paid orders | Open Production console | Orders listed in columns Waiting to start, In Design, Cutting, Finishing, Quality Check; oldest first in each; SLA badge shows days left or overdue against product lead time (default 7) | |
| PR-02 | Download DXF | Order with design | Open order > DXF | File downloads; opens in CAD/CAM; units mm; layers `0_CUT_INTERNAL`, `1_CUT_PERIMETER`; dimensions match order; customer design (not a bare outline) for studio orders | |
| PR-03 | Download work order PDF and job sheet | Same | Download PDF; press the print icon on the card | PDF has material, thickness, finish, order number; job sheet prints one page per order with barcode, items, size, finish, material and checklists | |
| PR-04 | Stage progression | Order in queue | Claim, then move Waiting to start > In Design > Cutting > Finishing > Quality Check | Each move recorded in the timeline with the operator email; card shows "Assigned to you"; buttons are at least 44 px tall | |
| PR-05 | Skip stage refused | Order at Cutting | Look for a button to jump to Quality Check or Packed | Only the next stage is offered; production cannot move Quality Check to Packed (QC console does) | |
| PR-06 | Material shortage | Low raw stock | Add an internal note "Material shortage: ..." | Note saved with author and time and visible to Order manager. Flag and notification are not built | |
| PR-07 | Rework | Failed QC (QC-02) | Open the order in Production | Order is in Cutting or Finishing as chosen at QC; the failure reason is in the QC log (QC-02) | |
| PR-08 | Operator cannot see finance | Production login | Open Analytics, Customers, Team, Settings by navigation; check customer details in the console | Tabs absent; production screens show no customer name, email, phone or address | |
| PR-09 | Mine only and search | Several orders, some claimed | Toggle "Mine only"; search an order number | Only matching orders shown | |
| PR-10 | Manufacturability warning | Studio order with a feature below minimum width | Open order detail | Warning listed under the item | |
| PR-11 | Notes are preserved | Order with QC data | Add a production note; then edit notes in Orders > Inspector and save | QC results and package data are still present afterwards | |

## 6. QC and packing

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| QC-01 | QC pass | Order in Quality Check | QC console: tick all five checks per item, Pass item; save package size and weight; Mark packed | Item shows Passed with user; order moves to Packed; package saved. Photo is a "photo taken" tick only (no upload yet) | |
| QC-02 | QC fail | Order in Quality Check | Fail an item with a reason, choose Finishing or Cutting | Order moves back with the reason stored in the notes QC log; item results reset so rework is fully re-inspected | |
| QC-03 | Mandatory checklist | None | Try to pass with any box unticked; try to fail without a reason; try Mark packed before all items pass or package details saved | Pass, fail and Mark packed stay disabled; a missing reason is refused | |
| QC-04 | Packing | Item passed QC | Enter length, width, height (cm) and weight (kg), save; print packing slip | Order Packed; dimensions and weight stored in notes and shown on the Packed card and slip | |
| QC-05 | Packing slip contents | Same | Print slip | Order number, barcode, items, sizes, finish, quantities, ship-to name and address, package size, "Handle with care". Prices are not printed | |
| QC-06 | Packed list | Packed orders | Open QC console | Packed orders listed with package size or "No package details recorded" | |

## 7. Shipping

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| SH-01 | Rate and courier choice | Packed order | Open shipping console | Serviceable couriers with rates and ETA shown | Blocked: Phase 3b |
| SH-02 | Book courier and AWB | Same | Book | `CREATE_SHIPMENT` (Shiprocket): invoice issued, AWB, label and manifest stored, order stays Packed (`shipment.status: awb_assigned`) until the pickup scan; manual: courier + AWB entered, order Shipped | Testable via API (UI: Phase 3b) |
| SH-03 | Customer tracking | Shipped order | Customer opens `/track-order` | Shows courier, AWB, live status link | |
| SH-04 | Shipping notification | Shipped order | Check email, SMS or WhatsApp | Message with AWB and tracking link | Needs Resend / MSG91 configured |
| SH-05 | Courier status webhook | Shipped order | Send test webhook: In transit, Out for delivery, Delivered | Webhook with `x-api-key` moves Shipped → Out_For_Delivery → Delivered; repeated events ignored; wrong token 401 | |
| SH-06 | Delivery failed / RTO | Shipped order | Send NDR and RTO webhook | RTO INITIATED / RTO DELIVERED webhooks move the order to RTO_Initiated / RTO_Delivered; staff `CANCEL_ORDER` then refunds (prepaid) or issues a credit note (COD). Support task: Phase 3 | Partly testable via API (Support task: Phase 3b) |
| SH-07 | COD remittance | COD order delivered | Record courier remittance | Matches COD amount; Finance sees it | Blocked: Phase 3b |
| SH-08 | Cancel shipment | Booked, not picked up | Cancel AWB | `CANCEL_SHIPMENT` while Packed cancels the Shiprocket order; order stays Packed with shipment cancelled; refused after pickup | Testable via API (UI: Phase 3b) |
| SH-09 | RTO round trip | Shipped Shiprocket order | Send RTO INITIATED, then RTO DELIVERED webhooks; `CANCEL_ORDER` | RTO_Initiated → RTO_Delivered → Cancelled; prepaid: refund; COD: credit note `CN/…` | Testable via API |

## 8. Finance

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| FN-01 | Revenue overview | Orders exist | Open dashboard | Gross, discounts, net, order counts match order list | |
| FN-02 | GST invoice | Paid order | Generate invoice | Issued automatically at `CREATE_SHIPMENT`: next sequential number for the financial year, correct GSTIN, HSN, tax split by state, total equals the order total; immutable | Testable via API (UI: Phase 3b) |
| FN-03 | Credit note | Refunded order | Generate | Refund on an invoiced order creates `CN/YY-YY/NNNNNN` against the invoice with tax reversed pro rata | Testable via API (UI: Phase 3b) |
| FN-04 | Full refund | Paid order cancelled | Refund full | `CREATE_REFUND` full amount: Razorpay refund created; after the webhook the order is Refunded; refund notification queued | Testable via API (UI: Phase 3b) |
| FN-05 | Partial refund | Paid order, one item returned | Refund part | `CREATE_REFUND` partial: order Partially_Refunded; ceiling = collected − refunded − pending; audited | Testable via API (UI: Phase 3b) |
| FN-06 | Refund over limit | Paid order | Try refund above paid amount | `CREATE_REFUND` above the refundable balance returns 409 CONFLICT | Testable via API (UI: Phase 3b) |
| FN-07 | Gateway reconciliation | A day of orders | Compare gateway settlement report to the system | Every payment matched; unmatched list is empty or explained | Blocked: Phase 3b |
| FN-08 | COD reconciliation | COD orders delivered | Compare courier remittance to orders | Differences listed | Blocked: Phase 3b |
| FN-09 | Export | None | Export orders CSV for a date range | Complete, correct totals, no PII beyond need | Blocked: Phase 3b |
| FN-10 | Intra- vs inter-state GST | Seller in Karnataka (29) | Ship one order to Bengaluru, one to Mumbai; open both invoices | Bengaluru: CGST + SGST each 9%; Mumbai: IGST 18%; totals equal the amounts charged | Testable via API |
| FN-11 | Invoice numbering across FY boundary | Staging clock or orders dispatched 31 Mar 23:xx and 1 Apr 00:xx IST | Dispatch both | `VX/26-27/…` last number, then `VX/27-28/000001`; no gaps within a year | Testable via API |
| FN-12 | Refund not double counted | Razorpay test mode | `CREATE_REFUND` partial, then let `refund.processed` arrive (and replay it) | `refundedPaise` increases once; one refund record, one credit note, one notification | Testable via API |
| FN-13 | COD fee and GST | COD enabled, fee ₹49 | Place COD order for ₹538 of goods | Pricing shows COD fee 49 and GST on goods and fee (₹96.84 + ₹8.82); invoice has a "Cash on delivery fee" line | |

## 9. Support

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| SP-01 | Look up order | None | Support console: search by order number, phone, email, pincode, name | Matching orders listed; detail shows customer, items, totals, timeline | |
| SP-02 | Handle contact message | CG-30 done | Open message, reply, close | Status tracked | Blocked: Phase 3b |
| SP-03 | Handle B2B enquiry to quote | CG-29 done | Trade enquiries: open the enquiry, mark Contacted, then Quoted, Won or Lost | Status saved and shown in the list filter. Sending a quote document and converting to an order are not built | |
| SP-04 | Process return request | CS-11 done | Approve, arrange pickup, mark received, trigger refund or replacement | `APPROVE_RETURN` → `MARK_RETURN_RECEIVED`: refund resolution → finance `CREATE_REFUND`; replacement resolution → linked zero-value order in Paid | Testable via API (UI: Phase 3b) |
| SP-05 | Reject return | CS-11 done | Reject with reason | `REJECT_RETURN` with reason: order back to Delivered; customer notification carries the reason | Testable via API (UI: Phase 3b) |
| SP-06 | Support cannot refund | Support login | Look for refund actions; try a status change or note | No refund or status controls; notes box shows a read-only message | |
| SP-07 | Customer summary and snippets | Customer with 2 orders | Open an order in Support | Order count, lifetime value and last order shown; Status, Delay and (when tracking exists) Tracking snippets can be copied; WhatsApp opens `wa.me/91<phone>` with the text | |
| SP-08 | Order not in the loaded page | Older order | Search its order number or email, then "Search all orders" | Order found | |
| SP-09 | Internal note | Order manager login | Add a note on an order | Appears with author and UTC time; support role sees notes read-only | |

## 10. Super admin

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| SA-01 | Manage roles | Super admin | Create user, assign role, remove role | Permissions change immediately; audited | |
| SA-02 | Store settings | None | Update free-shipping threshold, GST details, contact info | Reflected on storefront and invoices | |
| SA-03 | Audit logs | Actions performed | Filter by user and action | Complete and tamper-evident | |
| SA-04 | Deactivate admin user | Active staff user | Deactivate | Session ends; cannot sign in | |
| SA-05 | Last super admin safeguard | One super admin | Try to remove own super admin role | Refused | |
| SA-06 | Invite staff by email | Person has no storefront account | Team > assign role to their email | Error says no account exists; after they sign up, assignment succeeds | |
| SA-07 | Role change takes effect after sign-in | Staff member signed in | Change their role; they sign out and in | New consoles appear; demotion applies at once because sessions end | |

## 11. Business flow: end to end

Run these as scripted scenarios across roles. Each step references the case that proves it.

| ID | Scenario | Steps (role: case) | Expected result | Result |
|---|---|---|---|---|
| E2E-01 | Catalog product, UPI, delivered | Catalog: CM-01, CM-04. Guest: CG-05, CG-08, CG-11, CG-15. Order: OM-01, OM-05. Production: PR-02, PR-04. QC: QC-01, QC-04. Shipping: SH-02. Courier webhook: SH-05. Finance: FN-02. | Order flows Paid, In production, Packed, Shipped, Delivered with invoice; every status visible to the customer | Blocked: Phase 3b |
| E2E-02 | Custom studio design order | Guest: CG-26 then CG-16. Order: OM-10. Production: PR-02. Then as E2E-01 from QC | The DXF matches the ordered design; delivered product matches dimensions within tolerance | Blocked: Phase 3b |
| E2E-03 | Payment abandon then release | Guest: CG-21 | Stock reserved at checkout start, released after timeout; second customer can buy last unit | |
| E2E-04 | Cancellation with refund | Customer: CS-09. Finance: FN-04 | Stock restored, full refund, notification | Testable via API (UI: Phase 3b) |
| E2E-05 | Return, partial refund | Customer: CS-11. Support: SP-04. Finance: FN-05, FN-03 | Credit note and partial refund reconcile (FN-07) | Testable via API (UI: Phase 3b) |
| E2E-06 | Replacement for damaged item | Customer: CS-11. Support: SP-04 (replacement) | New production order linked to original at zero price | Testable via API (UI: Phase 3b) |
| E2E-07 | COD order to remittance | Guest: CG-18. Ship: SH-02, SH-05, SH-07. Finance: FN-08 | COD collected amount reconciles | Blocked: Phase 3b |
| E2E-08 | B2B enquiry to paid order | Guest: CG-29. Support: SP-03. Customer pays quote | Quote converts to order with agreed price | Blocked: Phase 3b |
| E2E-09 | Review lifecycle | Customer: CS-07. Catalog: CM-11 | Review public only after approval; rating updates | |

## 12. Role permission negative tests

Each role must be refused actions that belong to other roles. Test by UI (action absent or disabled) and by direct URL or API call (server refuses with 403, no data returned).

| ID | Role | Must NOT be able to | Result |
|---|---|---|---|
| RP-01 | Catalog manager | View customer PII beyond what is needed; change order status; issue refunds; edit roles | |
| RP-02 | Order manager | Edit product price or stock; issue refunds; edit roles | |
| RP-03 | Production | See customer phone, email or payment data in the console; edit orders other than stage, assignment and notes; refund; open Analytics, Customers, Team | |
| RP-04 | QC and packing (production role) | Move Quality Check to Packed without a complete checklist and package details; edit prices; refund | |
| RP-05 | Shipping | See Production, QC, Support or Trade tabs; change prices; refund; edit products | |
| RP-06 | Finance | See Production, QC, Support or Trade tabs; edit products; change order status; edit roles | |
| RP-07 | Support | Edit products; change order status or add notes; refund; change roles; open Production, QC or Team | |
| RP-08 | Any admin | Escalate own role by API call | |
| RP-09 | Signed-out user | Open `/admin` or call admin APIs | Redirected to sign-in; API returns 401 | |
| RP-11 | Catalog manager | Open Production, QC, Support or Trade enquiries | |
| RP-10 | Customer | Open `/admin` or call admin APIs | Refused with 403 | |

## 13. Security negative tests

| ID | Case | Steps | Expected result | Result |
|---|---|---|---|---|
| SEC-01 | Tampered price | In browser devtools or a proxy, change the price or total in the checkout request | Server recomputes from catalog; order total equals the true price or request is rejected | |
| SEC-02 | Tampered coupon discount | Modify the discount value in the request | Server ignores client value; recomputes | |
| SEC-03 | Negative or fractional quantity | Send quantity -1, 0, 1.5, 99999 | Rejected | |
| SEC-04 | Forged payment webhook | POST a payment-success webhook with a wrong or missing signature | Rejected (4xx); order not marked paid | |
| SEC-05 | Replayed payment | Re-send a valid captured payment webhook or verify call for the same payment twice | Idempotent: order paid once, no duplicate side effects | |
| SEC-06 | Payment verified for wrong order | Verify a real payment ID against a different order | Rejected: amount and order reference must match | |
| SEC-07 | Underpaid order | Pay less than the total (tampered amount at gateway) | Order stays unpaid | |
| SEC-08 | Access another user's order | Signed in as Customer B, open Customer A's order URL or ID | 403 or not found; no data | |
| SEC-09 | Order enumeration | Try sequential order IDs on confirmation and tracking pages | No data without matching proof; rate limited | |
| SEC-10 | Admin API without auth | Call each admin API endpoint with no token and with a customer token | 401 or 403 | |
| SEC-11 | XSS | Enter `<script>` and `"><img onerror>` in review, address, contact, studio text | Escaped or sanitized everywhere, including admin views and emails | |
| SEC-12 | File upload abuse | Upload an executable renamed to .png; an oversized SVG with script | Rejected or sanitized | |
| SEC-13 | Secrets exposure | Inspect the built JS bundle and network responses | No gateway secret, admin key or service credential present | |
| SEC-14 | Rate limiting | Hammer coupon validation, login and order lookup | Throttled with 429 | |
| SEC-15 | Security headers and HTTPS | Scan the staging domain | HTTPS only; sensible headers; no mixed content | |
| SEC-16 | Admin routes not indexed | Open `/robots.txt` and view source of `/admin` | `/admin`, `/checkout`, `/account` disallowed; `noindex` present on admin | |

## 14. Mobile, responsive and performance

| ID | Case | Steps | Expected result | Result |
|---|---|---|---|---|
| MP-01 | Responsive layouts | Check Home, Shop, PDP, Cart, Checkout, Studio at 360, 390, 768, 1280, 1920 px | No horizontal scroll; tap targets at least 44 px; nothing overlaps | |
| MP-02 | Mobile checkout | Complete UPI payment on a phone (UPI app intent) | Returns to confirmation page; order paid | |
| MP-03 | Keyboard and screen reader | Navigate the purchase flow with keyboard only | Focus visible; forms labelled; logical order | |
| MP-04 | Lighthouse mobile, 4G throttled: Home | Run Lighthouse in Chrome on staging | LCP under 2.5 s; CLS under 0.1; Performance score 80 or more | |
| MP-05 | Lighthouse mobile: Shop | Same | LCP under 2.5 s; CLS under 0.1 | |
| MP-06 | Lighthouse mobile: PDP | Same | LCP under 2.5 s; CLS under 0.1 | |
| MP-07 | Lighthouse mobile: Checkout | Same | CLS under 0.1; interactive in under 4 s | |
| MP-08 | Initial JS | Check network panel on first load of `/` | No `vendor-pdf` or `vendor-charts` chunk requested; images served as optimized sizes | |
| MP-09 | SEO | Check `/`, a PDP and `/shop` | Unique title and description; canonical; Open Graph with absolute image URL; Product JSON-LD on PDP; `sitemap.xml` lists all products on the configured domain | |
| MP-10 | Slow network | Throttle to Slow 3G | Skeletons shown; no blank page; checkout still works | |
| MP-11 | Load | Run 50 concurrent browsing sessions and 10 concurrent checkouts on staging | No errors; p95 API latency under 1 s; no oversell | |

## Launch sign-off

| Area | Owner | Date | Decision |
|---|---|---|---|
| Customer flows (sections 1, 2, 11) | | | |
| Admin and operations (sections 3 to 10) | | | |
| Security (sections 12, 13) | | | |
| Performance and SEO (section 14) | | | |
| Blocked cases re-baselined after Phases 2 and 3 | | | |
