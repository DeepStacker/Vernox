# Vernox User Acceptance Test (UAT) Scripts

End-to-end acceptance scripts for launching the business. Run them on a staging environment that uses payment-gateway **test mode**, a test courier account and a seeded catalog.

## How to use this document

- **Result column:** record `Pass`, `Fail` or `N/A` with date and tester initials. Every `Fail` needs a defect ID.
- **Blocked cases:** a case marked `Blocked: Phase N` depends on a feature that is not built yet. The phases come from `ROADMAP.md`:
  1. Foundation
  2. India commerce (pincode serviceability, COD, GST invoice, courier, notifications, cancellation, returns)
  3. Operations consoles. 3a (done): role home, production, QC and packing, support, trade enquiries, catalog manager, staff screen. 3b (done): shipping, finance, returns consoles, business settings, admin visual pass
  4. Storefront redesign
  5. UAT

  Do not execute a blocked case until its phase ships; re-baseline it then. Cases with no marker are testable on the current build.
- **Roles:** the admin role names below are logical roles. Production, QC and packing, Support and Trade enquiries have their own consoles since Phase 3a; Shipping, Returns and Finance since Phase 3b (see Section 12, role permission tests).
- **Test data:** use the test cards, UPI IDs and netbanking banks published by the payment gateway for test mode. Never use real card data.
- **Sign-off:** launch requires all non-blocked cases to pass, and all blocked cases to pass after their phase ships.

## Environments and test accounts

| Item | Value |
|---|---|
| Base URL | `VITE_SITE_URL` of the staging deployment |
| Guest | no account, fresh private browser window |
| Customer A / Customer B | two signed-in customer accounts with different emails and phones |
| Admin roles | one account per role: Designer, Catalog manager, Order manager, Production, QC and packing, Shipping, Finance, Support, Super admin |
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
| CG-29 | B2B enquiry | Trade page | Submit the trade form with valid data. Submit 6 times within an hour from one network | Success message with a `VNX-B2B-…` reference; enquiry visible to Support and Super admin; a "New trade enquiry" alert email reaches the support inbox (when `supportEmail` is set); the browser makes no Firestore request; the 6th submission is refused as too many requests | |
| CG-30 | Contact form | Contact page | Submit valid and invalid messages | Valid: confirmation with a reference (T-XXXXXX), a ticket appears in Support > Tickets, and an alert is queued for `supportEmail`. Invalid (bad email, message under 5 characters): rejected, nothing stored. More than 5 messages in an hour from one IP: 429 | |
| CG-38 | Contact form honeypot | Contact page | POST `/api/engage` `CONTACT` with a non-empty `website` | 200 success, no ticket and no alert stored | |
| CG-39 | Newsletter signup (double opt-in) | Any page footer; Resend configured | Subscribe with a new email, then again with the same email (different case) | "We have emailed you a link" both times; one `newsletter_subscribers` document with status `pending`, consent time and source `footer`; exactly one confirmation email; no token in the response; 11th signup in an hour from one IP: 429. With Resend unset the outbox document stays `pending` and the email arrives after the keys are set | |
| CG-41 | Newsletter confirm | CG-39 | Open the emailed link `/newsletter/confirm?h=..&t=..`, press Confirm, press again; try a wrong token | Friendly thank-you; status `subscribed` with `confirmedAt`; repeat is fine; wrong token shows the not-valid message and changes nothing; `npm run export:newsletter` lists only confirmed addresses | |
| CG-40 | Newsletter unsubscribe | CG-39 | Open `/newsletter/unsubscribe?h=<hash>&t=<token>` from the export, press Unsubscribe, press again; try a wrong token | First press unsubscribes (status `unsubscribed`); repeat is fine; wrong token shows the not-valid message and changes nothing | |
| CG-42 | COD code passes | MSG91 OTP configured (`MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID`), COD allowed for the cart | Choose Cash on delivery, press Send code, enter the SMS code, Verify, Place order (on a 390 px phone too) | Code arrives within a minute and the field offers it from the keyboard (one-time-code, numeric); "Mobile number confirmed"; order created without the `COD_UNVERIFIED` flag; a second order needs a new code | Needs live MSG91 |
| CG-43 | COD code wrong | CG-42 | Enter a wrong code | "That code is not correct. N attempts left"; Place order stays disabled; checkout-intent without a token returns 400 `COD_OTP_REQUIRED` | |
| CG-44 | COD code locked | CG-42 | Enter wrong codes 5 times, then the right one | "Too many wrong attempts. Please request a new code"; the right code no longer works until a new one is sent | |
| CG-45 | COD code expired and resend | CG-42 | Wait 5 minutes, enter the code; press Resend within 30 s of sending | Expired: "This code has expired"; resend is disabled with a countdown for 30 s, then works; more than 5 sends an hour to one number: 429 | |
| CG-46 | COD fallback: confirm by phone | MSG91 OTP not configured (or `codOtpRequired` off) | Place a COD order; as an order manager open Orders and Production | No code step at checkout; order flagged `COD_UNVERIFIED`; amber "Confirm by phone" prompt with a tappable number in Orders and on the production card; press Confirmed: prompt disappears, audit entry `COD_ORDER_CONFIRMED`; on another order press Cancel (customer unreachable): order Cancelled | |
| CG-31 | Policy pages | None | Open `/privacy`, `/terms`, `/shipping`, `/returns`, `/faqs` | Pages render with correct content and titles | |
| CG-36 | COD refused for custom studio item | Cart with a studio design | Open payment step; also POST checkout-intent with `paymentMethod: "cod"` | COD disabled with "Custom studio designs are prepaid only"; API returns 400 `COD_NOT_AVAILABLE` | |
| CG-37 | COD limit per mobile | Two undelivered COD orders on one mobile | Place a third COD order | Refused with `COD_NOT_AVAILABLE`; after one is delivered, allowed. 4th COD attempt in an hour from one number: 429 | |
| CG-38 | PIN fills city and state | Checkout, Account profile and Admin > New order (delivery address) open, city and state empty | Type a 6-digit PIN (560001, 110001, 682555) | State fills at once (Karnataka, Delhi, Lakshadweep); city fills when the courier answers; typed city/state are never overwritten; correcting the PIN corrects an autofilled value | |
| CG-39 | Save for later | Two lines in the cart (one a Studio design) | Tap "Save for later" on a line, reload, then "Move to cart" | Line leaves the totals and shows under "Saved for later" with size and finish; it survives a reload (this browser); "Move to cart" restores it unchanged (identical lines merge quantities); works with the cart empty | |
| CG-40 | EMI message | `VITE_RAZORPAY_KEY_ID` set, Affordability Widget enabled in the Razorpay Dashboard, price above Rs 3,000 | Open a product page and the cart | "No-cost EMI / instalments from Rs X/month" appears shortly after the page loads and never delays first paint; with the key unset, the script blocked, or a small amount, nothing appears and no error is shown | |
| CG-32 | 404 page | None | Open `/does-not-exist` | Friendly 404 with navigation; not indexed (`noindex`) | |
| CG-33 | Review submit as guest | Delivered order exists | Open the product page signed out; POST `SUBMIT_REVIEW` without a token | No "Write a review" button; the API answers 401 | |

## 1a. Studio batch (business buyers)

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| BT-01 | Mark variables | Studio with a plate and one text | Click Batch in the header; type `{name}` in the variable box of the text | Batch screen opens; chips for CSV columns appear once a sheet is loaded | |
| BT-02 | Paste CSV | BT-01 | Paste `name,qty` then 3 rows (include a name with a comma in quotes) | Table shows 3 rows with thumbnails after a moment; quoted comma stays in one cell | |
| BT-03 | Upload CSV | Excel-exported CSV with BOM | Upload CSV | Headers have no stray characters; rows match the file | |
| BT-04 | Spreadsheet paste | Range copied from Excel or Sheets | Paste into the box | Tab-separated data is read correctly | |
| BT-05 | Row validation | Sheet with a blank row, a row with empty name, qty `abc`, qty `0`, qty `101` | Load the sheet | Each bad row is flagged inline with its reason; empty rows are shown but not counted; flagged rows are not in the cart count | |
| BT-06 | Missing column | Variable `{room}` but no `room` column | Load a sheet without it | Message "No column room"; no rows can be added | |
| BT-07 | Text too long | A name much longer than the plate allows | Load a sheet with it | That row shows "Text is N mm too long for the plate"; other rows stay valid | |
| BT-08 | 500-row cap and performance | Sheet with 800 rows | Load it | Notice that only the first 500 are used; the page stays responsive while previews fill in; scrolling shows previews for visible rows first | |
| BT-09 | Price and total | 3 valid rows with qty 2, 1, 5 | Read the Price column and Total | Each row shows unit price x qty; Total is the sum; the price of a row equals the price shown in the normal studio for that text | |
| BT-10 | Add to cart | BT-09 | Add to cart | Cart shows one custom line per distinct name with the right quantity; identical names are merged and quantities added | |
| BT-11 | Checkout re-prices | BT-10 | Check out (prepaid) | Order total equals the server price for the sizes and finishes; each order line has its own design | |
| BT-12 | Order limit | Sheet with 60 distinct names | Add to cart | Lines are added up to the order limit (50 lines, or fewer if designs are large); a message says how many did not fit; after checkout the rest can be added | |
| BT-13 | Re-add guard | BT-10 | Return to Batch | Added rows show "In cart"; the button counts only the remaining rows | |

## 2. Customer (signed in)

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| CS-01 | Sign up and sign in | None | Create account, sign out, sign in | Session persists across reload; sign-out clears it | |
| CS-02 | Account page | Signed in | Open `/account` | Profile, orders, addresses, wishlist visible | |
| CS-03 | Order history | Customer A has 2 orders | Open order list | Only Customer A's orders; statuses and totals correct | |
| CS-04 | Saved addresses | Signed in | Add, edit, delete address; use at checkout | Persisted; prefilled at checkout | |
| CS-05 | Wishlist | Signed in | Add and remove wishlist items; reload | Persisted across reload and devices | |
| CS-06 | Guest cart merge | Guest cart has items | Sign in | Cart merged without duplicate lines | |
| CS-07 | Submit review (verified purchase) | Delivered order containing the product | Open that product page, Write a review, pick a rating, write 10+ characters, submit | Review is stored `pending` and `verified`, not public until approved; the page then shows "waiting for approval" and no second review is possible. Up to 3 photos can be attached (see CS-08b). A customer without a Delivered order for the product sees no button and the API answers 403 | |
| CS-08 | Review validation | Signed in with a Delivered order | Submit rating 0 or 6, text under 10 or over 2000 characters, script tags | Rating and length rejected with 400; script tags are stored as text and render escaped, no script executes. Writing `reviews` directly from the browser is refused by Firestore rules | |
| CS-08b | Review photos | CS-07 setup, a WebP-capable browser | Write a review and add 4 photos (one a PDF, one over 10 MB); submit with 3 | Only images are accepted and the 4th is not added; large photos are resized to at most 1600 px WebP before upload; the review is stored `pending` with `photoPaths`; nothing is visible on the product page. Another signed-in customer cannot open the private photo URL | |
| CS-09 | Request cancellation | Order not yet in production | Cancel from order page | `POST /api/order-cancel` while Paid / Confirmed_COD: order Cancelled, stock restored, Razorpay refund created (prepaid), cancellation notification; status Refunded after the refund webhook | Testable via API (UI: Phase 3) |
| CS-10 | Cancellation not allowed | Order already cut or shipped | Try to cancel | `POST /api/order-cancel` after In_Design returns 409 with "already in production" text | Testable via API (UI: Phase 3) |
| CS-11 | Request return or replacement | Delivered within return window | Raise return with reason and photos | Photo upload to `returns/{orderId}/` allowed (image ≤ 5 MB); `POST /api/return-request` moves the order to Return_Requested; `GET_ORDER_DOCUMENTS` shows the return | Testable via API (UI: Phase 3) |
| CS-12 | Return window expired | Delivered beyond window | Try to raise return | `POST /api/return-request` after `returnWindowDays` returns 409 with the window text | Testable via API (UI: Phase 3) |
| CS-13 | Download GST invoice | Paid order | Download invoice | Invoice available after dispatch (`GET /api/invoice`): PDF with seller GSTIN, HSN per line, CGST+SGST (same state) or IGST, number `VX/YY-YY/NNNNNN`; 404 "issued when dispatched" before that | Testable via API (download button: Phase 3) |
| CS-14 | Data export and delete | Signed in | Request data export and account deletion | Request recorded and fulfilled per privacy policy | Blocked: Phase 2 |

## 2a. My Space and design consultation (Stage 2)

Needs `settings/store.consultation.enabled = true`, Razorpay test keys, a designer account (role `designer`) and Customer A / B with verified emails.

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| SP-01 | Create a space | Customer A signed in | `/account/spaces` → New space, name and room | Space listed; opens its page; `space_created` recorded | |
| SP-02 | Add a wall, typed size | Space exists | Add a wall, take or upload a photo, type width and height in cm, add notes | Wall card shows the photo, size and notes; photo is stored at `spaces/{uid}/{spaceId}/{wallId}.jpg`; `wall_added` recorded | |
| SP-02b | WhatsApp message becomes a ticket | WhatsApp configured (DEPLOYMENT 4d), webhook subscribed | From a customer phone, message the business number; then send a second message; then send a photo | One `whatsapp` ticket named after the WhatsApp profile, linked to that phone's latest order, with a `support_ticket` alert queued; the second message is appended (a Waiting ticket becomes Open); the photo shows "[photo/document received — open WhatsApp]". A resolved ticket is not reused: the next message opens a new ticket. Meta retrying the same webhook adds nothing | |
| SP-02c | Reply on WhatsApp | SP-02b done | Open the WhatsApp ticket within 24 hours, type a message, Send on WhatsApp; repeat after 24 hours without a new customer message | Customer receives the text; it shows as "Reply sent on WhatsApp" and the ticket moves to Waiting; audited `TICKET_WHATSAPP_SENT`. After 24 hours the button is replaced by an explanation and the WhatsApp link remains | |
| SP-02d | WhatsApp order updates and STOP | Templates approved, `WHATSAPP_TEMPLATES` set | Place an order, ship it; then reply STOP from the customer phone and trigger another status change; reply START | Confirmed / shipped / out for delivery / delivered arrive as template messages (events without a template do not); after STOP no WhatsApp message is sent (email and SMS continue); after START they resume. Unconfigured: nothing sent, no errors | |
| SP-03 | Calibrate from the photo | Wall editor open with a photo | Choose Measure from photo, tap both ends of an A4 sheet, pick A4 | "The photo shows about W × H cm" appears; the size fields fill in; the saved wall previews at that scale | |
| SP-04 | Photo handling | Wall editor | Upload a 12 MP phone photo; a non-image; a very large wall size (6000 cm) | Photo is downscaled to ≤ 1600 px before upload; non-image rejected; size outside 30 cm to 30 × 15 m refused with a message | |
| SP-05 | Try a design here | Wall with photo and scale | Try a design here, change the design and the size | The wall preview opens on "Your wall" with the saved photo at the saved scale; the piece is to scale; the privacy note says the photo is saved in the account | |
| SP-06 | Wall without a photo | Wall saved without a photo | Look at its card | Try a design here is disabled; Get design help stays disabled until a wall has a photo | |
| SP-07 | Buy a consultation | Space with a photographed wall; consultation enabled | Get design help, enter name, mobile, state, pay with a test card | Razorpay shows the server price (fee + 18% GST); after payment `/account/consultations/{id}` shows "Designer at work" and the due date; receipt email mentions the credit code; `consultation_purchased` recorded | |
| SP-08 | Price is server-side | SP-07 request | Replay `POST /api/consultation` with an extra `amount` field; call `/api/checkout-intent` with `productId: design-consultation` | The extra field is ignored; the public checkout rejects the item (`INVALID_ITEM`) | |
| SP-09 | Disabled or no photo | Setting off / space without photos | `PURCHASE` | `409` / `400` with a message; no order created | |
| SP-10 | Credit coupon issued | SP-07 done | Open the consultation | Credit panel shows ₹fee off until the expiry date and the `DESIGN-` code; a `coupons/cc_{orderId}` document exists, bound to the buyer's email, single use | |
| SP-11 | Credit redeemed once | SP-10 | As Customer A add items worth more than the fee to the cart | The credit is applied automatically in the cart; after paying, the code is refused ("reached its redemption limit") and the credit panel says it has been used; `consultation_credit_redeemed` recorded | |
| SP-12 | Credit is personal and expires | SP-10 | Use the code as Customer B (validate-coupon with B's email; checkout with B's email); use it after the expiry date | Refused ("issued to another customer"); refused as expired | |
| SP-13 | Designer queue | SP-07 done | Designer opens Consultations | New queue lists the consultation with days left (turnaround from settings); overdue ones turn red | |
| SP-14 | Claim | SP-13 | Claim; a second designer tries to claim | First claim moves it to In progress; the second gets a conflict; an admin can take over | |
| SP-15 | Wall photos for the designer | SP-14 | Open the consultation | Wall photos, sizes and notes are shown from the consultation's own copy; the designer cannot open `spaces/{uid}/...` | |
| SP-16 | Build a proposal | SP-14 | Add a piece: catalogue product, place it on a wall with the preview, Use this placement; add a second piece from a saved studio design; add notes | Each piece appears with its composed preview; Save draft persists; the customer sees nothing yet | |
| SP-17 | Send the proposal | SP-16 | Send proposal | Status Proposed; the customer gets the "proposal ready" email; a piece that cannot be ordered (size not offered, design too small) blocks sending with a message | |
| SP-18 | Customer views the proposal | SP-17 | Open the link from the email | Per-wall previews, size, finish and price; designer's note; `proposal_viewed` recorded | |
| SP-19 | Add proposal items to the cart | SP-18 | Add a catalogue piece and a custom piece | Catalogue line carries size and finish; custom line is a studio line with its design; the server re-prices both at checkout; `proposal_item_added_to_cart` recorded | |
| SP-20 | Revision | SP-18 | Ask for a revision with a message; designer sends a new version; ask again | The first request returns the consultation to In progress with the message and a new due date; version 2 is emailed; the second request is refused | |
| SP-21 | Accept or close | SP-18 | I like this proposal / Not for me | Consultation Closed with the outcome; items stay available to add to the cart | |
| SP-22 | Cancelling and refunds | SP-07 done | Try to cancel the consultation order as the customer; finance refunds it with `CREATE_REFUND` | Customer cancel refused ("cannot be cancelled online"); finance refund works and the order does not appear in Production or Shipping | |

## 3. Catalog manager

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| CM-01 | Create product with variants and images | Catalog role | Admin > Catalog > New product: name, slug, category, description, 3 sizes (label, width, height, price difference), 3 finishes, MRP, lead time, HSN, upload a main and a lifestyle photo (or paste URLs), stock | Saved; photos stored under `products/{id}/` as WebP of at most 2000 px; appears in the admin list with price and stock; live preview shows unit price, MRP and discount per size; image previews render | |
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
| CM-11b | Review photos in moderation | CS-08b | Admin > Reviews: the pending review shows its 3 thumbnails (click to enlarge); publish it, then reload the product page; then unpublish (archive) it; then delete another published photo review | While pending the photos are visible only to the moderator. After publishing the product page shows the thumbnails (click opens a larger view) and Storage holds `reviews/{id}/1..3.webp`; re-saving (reply, featured) creates no duplicates. After archiving the thumbnails disappear and `reviews/{id}/` is empty; deleting removes the public copies and the private uploads | |
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
| OM-03a | Counter sale with handover | Seller details saved in Settings; a piece in stock | Admin > New order: Counter / walk-in, add the piece, Paid now: Cash, keep "Customer takes the pieces now", name and mobile only, Create order; then Tax invoice (PDF) | Summary total matches; order created Delivered with no shipping charge; invoice PDF downloads (CGST + SGST); stock reduced; order in the Orders list; audited `STAFF_ORDER_CREATED` | Verified locally 2026-11-07 (specimen invoice: placeholder seller) |
| OM-03b | Phone / WhatsApp order paid by UPI or card | Any piece | New order: Phone, Paid now: UPI with the UTR, full delivery address | Order Paid and in the production queue; payment note on the timeline; UPI / card without a reference is refused | Verified locally 2026-11-07 |
| OM-03e | Returning customer and fewer fields | A customer with an earlier order | New order: type their 10-digit mobile | Name, email and last delivery address fill in (filled fields are kept); a note shows how many earlier orders; State is a list, not free text | |
| OM-03c | Order by payment link | Razorpay test keys, `payment_link.paid` webhook enabled | New order: WhatsApp, Send a payment link, delivery address; pay the link with a test card | Link shown with Copy and Send on WhatsApp; order Pending_Payment, then Paid by the webhook; without keys a clear "Payment links need the Razorpay keys" message and no order | Without keys verified locally; live link needs keys |
| OM-03d | Trade order from an enquiry | A trade enquiry | New order: Trade / bulk, choose the enquiry, COD or paid now | Order created; the enquiry shows Won | |
| OM-04 | Verify payment state | Paid and failed orders | Compare with gateway dashboard | Statuses match exactly | |
| OM-05 | Move order to production | Paid order | Open Production console as Order manager; move the order to "In Design" | Order shows in the In Design column; timeline records the user | |
| OM-06 | Hold order | Paid or in-production order | Orders > open the order > Put on hold, give a reason; then Release hold | Amber "On hold" banner with reason, who and when on the order and on the production card; the stage cannot advance or ship (server and rules refuse); cancelling still works; after release the order moves on from the same stage; both actions audited | Testable in the UI |
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
| PR-06 | Material shortage | Low raw stock | Production > open the job > Material shortage, name the material | Card shows "Waiting for material: …" in every console; the stage is frozen until an order manager or production releases it; audited. No automatic notification | Testable in the UI |
| PR-07 | Rework | Failed QC (QC-02) | Open the order in Production | Order is in Cutting or Finishing as chosen at QC; the failure reason is in the QC log (QC-02) | |
| PR-08 | Operator cannot see finance | Production login | Open Analytics, Customers, Team, Settings by navigation; check customer details in the console | Tabs absent; production screens show no customer name, email, phone or address | |
| PR-09 | Mine only and search | Several orders, some claimed | Toggle "Mine only"; search an order number | Only matching orders shown | |
| PR-10 | Manufacturability warning | Studio order with a feature below minimum width | Open order detail | Warning listed under the item | |
| PR-12 | All variant files in one zip | A paid order from a batch (BT-11) | Open the order in the production console > "All N lines (zip)" > DXF | One zip with a numbered DXF per line, named with the variant text; each opens and matches its plate; repeat for SVG and PDF | |
| PR-11 | Notes are preserved | Order with QC data | Add a production note; then edit notes in Orders > Inspector and save | QC results and package data are still present afterwards | |

## 6. QC and packing

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| QC-01 | QC pass | Order in Quality Check | QC console: tick the four checks per item, Add photo (camera on a phone), Pass item; save package size and weight; Mark packed | Pass stays disabled until a photo is uploaded, then "Photo taken (1/4)" shows; item shows Passed with user and its photo; order moves to Packed; package saved | |
| QC-01a | QC photo evidence | QC-01 done, customer then requests a return | Returns console: open the order's return | The QC photos appear under "Photographed at QC before dispatch" beside the customer's photos; a support or finance user can open them; a customer cannot (storage.rules) | |
| QC-02 | QC fail | Order in Quality Check | Fail an item with a reason, choose Finishing or Cutting | Order moves back with the reason stored in the notes QC log; item results reset so rework is fully re-inspected | |
| QC-03 | Mandatory checklist | None | Try to pass with any box unticked; try to fail without a reason; try Mark packed before all items pass or package details saved | Pass, fail and Mark packed stay disabled; a missing reason is refused | |
| QC-04 | Packing | Item passed QC | Enter length, width, height (cm) and weight (kg), save; print packing slip | Order Packed; dimensions and weight stored in notes and shown on the Packed card and slip | |
| QC-05 | Packing slip contents | Same | Print slip | Order number, barcode, items, sizes, finish, quantities, ship-to name and address, package size, "Handle with care". Prices are not printed | |
| QC-06 | Packed list | Packed orders | Open QC console | Packed orders listed with package size or "No package details recorded" | |

## 7. Shipping

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| SH-01 | Rate and courier choice | Packed order | Open Shipping, queue "Ready to ship" | The order shows with its package size and weight (from QC) and COD amount | Testable in the UI |
| SH-01a | Courier rates and choice | Packed order, Shiprocket configured | Create shipment > Check courier rates; pick a courier (or keep "Shiprocket recommended"); Book | List shows each courier's charge, estimated days and date, COD availability and rating, recommended first; changing the package size clears the list; the booked AWB's courier is the one picked. COD orders list only COD couriers | Needs Shiprocket credentials |
| SH-01b | Rates without Shiprocket | Packed order, no Shiprocket credentials | Create shipment > Check courier rates | A note says rates are unavailable and the dialog switches to manual courier entry; booking by hand still works | Testable in the UI |
| SH-02 | Book courier and AWB | Same | Book | Shipping > Create shipment. Shiprocket (needs the server credentials): package prefilled from QC; invoice issued, AWB, label and manifest links on the card, order stays Packed (`awb_assigned`) until the pickup scan. Manual (courier, AWB, optional tracking link): order moves to Shipped. With seller details missing in Settings, a warning with an "Open Settings" link shows before booking and the server refusal is explained | Testable in the UI |
| SH-02a | Bulk labels and manifest | Several booked Shiprocket orders (Ready to ship) and one manual shipment (In transit) | Tick the orders; "Courier labels and manifest"; in In transit tick the manual one and "Print manual labels" | One merged labels PDF and one manifest PDF link appear (one pair per 50 orders); unbooked orders are reported as left out; the manual sheet prints one label per page. Without `orders.tracking` there are no checkboxes | Needs Shiprocket credentials (courier PDFs); manual sheet testable in the UI |
| SH-03 | Customer tracking | Shipped order | Customer opens `/track-order` | Shows courier, AWB, live status link | |
| SH-04 | Shipping notification | Shipped order | Check email, SMS or WhatsApp | Message with AWB and tracking link | Needs Resend / MSG91 configured |
| SH-05 | Courier status webhook | Shipped order | Send test webhook: In transit, Out for delivery, Delivered | Webhook with `x-api-key` moves Shipped → Out_For_Delivery → Delivered; repeated events ignored; wrong token 401 | |
| SH-06 | Delivery failed / RTO | Shipped order | Send NDR and RTO webhook (Shiprocket) or use the manual buttons "Return to sender started" and "Back at workshop" (manual shipments); then "Cancel order and refund" in the "Returning to sender" queue | Order moves to RTO_Initiated / RTO_Delivered; cancelling returns stock and refunds (prepaid, when the role may refund) or issues a credit note (COD). Shipping staff without `orders.refund` can cancel only; finance refunds. Support task for the customer call: not built | Testable in the UI |
| SH-07 | COD remittance | COD order delivered | Mark the manual shipment Delivered (or Shiprocket webhook) | Cash is recorded as collected (`codCollectedPaise`); Finance shows it under "COD collected". The remittance statement is matched in Finance > Reconciliation (FN-08) | Testable in the UI |
| SH-08 | Cancel shipment | Booked, not picked up | Shipping > Cancel shipment (reason) | Cancels the Shiprocket order; order stays Packed with the shipment cancelled and can be booked again; the button is absent once the order is Shipped | Testable in the UI (Shiprocket) |
| SH-09 | RTO round trip | Shipped Shiprocket order | Send RTO INITIATED, then RTO DELIVERED webhooks; `CANCEL_ORDER` | RTO_Initiated → RTO_Delivered → Cancelled; prepaid: refund; COD: credit note `CN/…` | Testable via API |

## 8. Finance

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| FN-01 | Revenue overview | Orders exist | Open dashboard | Gross, discounts, net, order counts match order list | |
| FN-02 | GST invoice | Paid order | Ship the order, then Finance > select the order > Invoice PDF | Issued automatically at `CREATE_SHIPMENT`: next sequential number for the financial year, correct GSTIN, HSN, tax split by state, total equals the order total; immutable; the PDF downloads | Testable in the UI |
| FN-02b | Deferred service invoice | Consultation paid while Settings → Seller was empty | Finance > Reconciliation > Flagged payments: open the order, save the seller GSTIN in Settings, then "Issue invoice" | Before the GSTIN is saved the button reports what is missing; afterwards one invoice is issued at 18% with SAC 998391, the flag clears, and a second click returns the same number | Testable in the UI |
| FN-03 | Credit note | Refunded order | Refund an invoiced order, then open it in Finance | Refund creates `CN/YY-YY/NNNNNN` against the invoice with tax reversed pro rata, listed with its PDF | Testable in the UI |
| FN-04 | Full refund | Paid order cancelled | Refund full | Finance > Create refund, "Full", method Razorpay (needs a Razorpay payment): refund shows "waiting for Razorpay"; after the `refund.processed` webhook the order is Refunded; refund notification queued | Testable in the UI (Razorpay test mode) |
| FN-05 | Partial refund | Paid order, one item returned | Refund part | Finance > Create refund with a smaller amount; method Razorpay, or Manual with the bank/UPI reference (COD orders). Order Partially_Refunded; "Refundable now" = collected − refunded − pending; audited; the dialog uses one idempotency key per attempt | Testable in the UI |
| FN-06 | Refund over limit | Paid order | Try refund above paid amount | Enter more than "Refundable now": the dialog shows the ceiling and blocks the button; if another refund lands meanwhile the server's 409 text is shown in the dialog | Testable in the UI |
| FN-07 | Gateway reconciliation | A day of orders | Finance > Reconciliation, compare with the gateway settlement report | Lists: prepaid orders paid without a payment id, flagged payments (`Payment_Discrepancy`, amount mismatch, duplicate payment, refund not started), refunds waiting for the webhook. Then upload the Razorpay settlement recon CSV under "Razorpay settlement file": payments matched by id, amount differences, payments not in the loaded orders, captured orders not yet settled, and gross, refunds, fees (with their GST) and net | Testable in the UI (needs a real settlement file) |
| FN-08 | COD reconciliation | COD orders delivered | Finance > Payments (COD pending / COD collected) and Reconciliation ("Delivered COD, cash not recorded"); Export > Cash on delivery | Expected, collected and outstanding per COD order. Then upload the courier's COD remittance CSV under "Courier COD remittance file": remitted amount and UTRs, AWBs whose amount differs, delivered COD orders not yet remitted, AWBs not in the loaded orders | Testable in the UI (needs a real remittance file) |
| FN-09 | Export | None | Finance > Export: choose dates, download Orders (GST split), Refunds, Cash on delivery | CSV per file for the IST date range; CGST+SGST when the delivery state equals the seller state, else IGST (empty when the seller state is unset); no names, emails, phones or addresses; formulas are neutralised. Truncation warning above 2000 orders | Testable in the UI |
| FN-10 | Intra- vs inter-state GST | Seller in Karnataka (29) | Ship one order to Bengaluru, one to Mumbai; open both invoices | Bengaluru: CGST + SGST each 9%; Mumbai: IGST 18%; totals equal the amounts charged | Testable via API |
| FN-11 | Invoice numbering across FY boundary | Staging clock or orders dispatched 31 Mar 23:xx and 1 Apr 00:xx IST | Dispatch both | `VX/26-27/…` last number, then `VX/27-28/000001`; no gaps within a year | Testable via API |
| FN-12 | Refund not double counted | Razorpay test mode | `CREATE_REFUND` partial, then let `refund.processed` arrive (and replay it) | `refundedPaise` increases once; one refund record, one credit note, one notification | Testable via API |
| FN-13 | COD fee and GST | COD enabled, fee ₹49 | Place COD order for ₹538 of goods | Pricing shows COD fee 49 and GST on goods and fee (₹96.84 + ₹8.82); invoice has a "Cash on delivery fee" line | |

## 9. Support

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| SP-01 | Look up order | None | Support console: search by order number, phone, email, pincode, name | Matching orders listed; detail shows customer, items, totals, timeline | |
| SP-02 | Handle contact message | CG-30 done | Support > Tickets: filter Open, open the ticket, Send reply, Add note, then set Resolved | Thread shows customer message, reply and note with who and when; the reply is queued as an email to the customer (Notifications outbox, `ticket_reply`), the note is not; sending a reply moves Open to Waiting; status persisted after reload; each change audited. Roles without `tickets.write` (view only) see no buttons; finance, shipping, designer and catalog roles do not see the Tickets tab | |
| SP-02a | Log a WhatsApp or phone request | An order exists | Support > Tickets > Log ticket: choose WhatsApp, enter the order number and the message, Log ticket. Repeat with Phone, a name and phone number only. Try an unknown order number, and a ticket with no order, email or phone | First ticket opens with channel WhatsApp, the order's customer name, email and phone filled in, and a WhatsApp link; Send reply works. Phone-only ticket: no Send reply button, a hint to log answers as notes, Add note works. Unknown order: "No order …" error, nothing saved; no contact: Log ticket stays disabled. No support alert email is queued for logged tickets; each is audited (`TICKET_CREATED`) | |
| SP-03 | Handle B2B enquiry to quote | CG-29 done | Trade enquiries: open the enquiry, mark Contacted, then Quoted, Won or Lost | Status saved and shown in the list filter. Sending a quote document and converting to an order are not built | |
| SP-04 | Process return request | CS-11 done | Returns > To review: read reason, details and photos; Approve (refund or replacement, optional message); then "Awaiting parcel" > Mark received (optionally restock) | Refund resolution: "Received" shows "Go to Finance", where finance issues the refund; replacement resolution: a linked zero-value order is created in Paid. Photos load for staff with `orders.read` | Testable in the UI |
| SP-05 | Reject return | CS-11 done | Returns > Reject (reason required) | Order back to Delivered; the customer notification carries the reason | Testable in the UI |
| SP-06 | Support cannot refund | Support login | Look for refund actions or status changes | No Finance, Shipping or Returns tabs; no status controls; `CREATE_REFUND` by API returns 403 | |
| SP-07 | Customer summary and snippets | Customer with 2 orders | Open an order in Support | Order count, lifetime value and last order shown; Status, Delay and (when tracking exists) Tracking snippets can be copied; WhatsApp opens `wa.me/91<phone>` with the text | |
| SP-08 | Order not in the loaded page | Older order | Search its order number or email, then "Search all orders" | Order found | |
| SP-09 | Internal note | Order manager or Support login | Add a note on an order | Appears with author and UTC time. Support adds notes through `ADD_ORDER_NOTE` (server-side, `customers.read`); QC and package data in the same field are preserved. Finance has no note box (403) | |

## 10. Super admin

| ID | Case | Preconditions | Steps | Expected result | Result |
|---|---|---|---|---|---|
| SA-01 | Manage roles | Super admin | Create user, assign role, remove role | Permissions change immediately; audited | |
| SA-02 | Store settings | None | Update free-shipping threshold, GST details, contact info | Reflected on storefront and invoices | |
| SA-02c | Integration keys in the app | Super admin; Razorpay test keys | Settings > Integrations: paste the Razorpay key id and secret, Save, Check; place a test order; Remove the secret | Saved shows only ••••last4; Check says accepted (test mode); checkout works without a redeploy; after Remove, Launch setup shows Razorpay missing; an admin (not super admin) does not see the panel and the API refuses (403); the audit log lists names, never values | |
| SA-02b | GSTIN fills the state | Settings > Business | Type a GSTIN starting 27 | State code 27 and State Maharashtra fill in; a code that does not match the GSTIN is still flagged | |
| SA-02a | Launch setup | Super admin | Settings > Launch setup; then set one missing key in Vercel and redeploy | Every key and business detail listed as set, required or optional with where to set it; no key value is shown anywhere; the item turns set after the redeploy; the admin home reminder lists only required items still missing | |
| SA-03 | Audit logs | Actions performed | Filter by user and action | Complete and tamper-evident | |
| SA-04 | Deactivate admin user | Active staff user | Deactivate | Session ends; cannot sign in | |
| SA-05 | Last super admin safeguard | One super admin | Try to remove own super admin role | Refused | |
| SA-06 | Invite staff by email | Person has no storefront account | Team > assign role to their email | Error says no account exists; after they sign up, assignment succeeds | |
| SA-07 | Role change takes effect after sign-in | Staff member signed in | Change their role; they sign out and in | New consoles appear; demotion applies at once because sessions end | |

## 11. Business flow: end to end

Run these as scripted scenarios across roles. Each step references the case that proves it.

| ID | Scenario | Steps (role: case) | Expected result | Result |
|---|---|---|---|---|
| E2E-01 | Catalog product, UPI, delivered | Catalog: CM-01, CM-04. Guest: CG-05, CG-08, CG-11, CG-15. Order: OM-01, OM-05. Production: PR-02, PR-04. QC: QC-01, QC-04. Shipping: SH-02. Courier webhook: SH-05. Finance: FN-02. | Order flows Paid, In production, Packed, Shipped, Delivered with invoice; every status visible to the customer | Testable in the UI (the COD variant was run end to end on the local stack) |
| E2E-02 | Custom studio design order | Guest: CG-26 then CG-16. Order: OM-10. Production: PR-02. Then as E2E-01 from QC | The DXF matches the ordered design; delivered product matches dimensions within tolerance | Testable in the UI |
| E2E-03 | Payment abandon then release | Guest: CG-21 | Stock reserved at checkout start, released after timeout; second customer can buy last unit | |
| E2E-04 | Cancellation with refund | Customer: CS-09. Finance: FN-04 | Stock restored, full refund, notification | Testable in the UI |
| E2E-05 | Return, partial refund | Customer: CS-11. Support: SP-04. Finance: FN-05, FN-03 | Credit note and partial refund reconcile (FN-07) | Testable in the UI |
| E2E-06 | Replacement for damaged item | Customer: CS-11. Support: SP-04 (replacement) | New production order linked to original at zero price | Testable in the UI |
| E2E-07 | COD order to remittance | Guest: CG-18. Ship: SH-02, SH-05, SH-07. Finance: FN-08 | COD collected amount reconciles (FN-08) | Testable in the UI; courier remittance import not built |
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
| RP-05 | Shipping | See Production, QC, Support, Trade or Finance tabs; change prices; refund (`CREATE_REFUND` and `CANCEL_ORDER` with refund return 403); edit products | |
| RP-06 | Finance | See Production, QC, Support, Trade, Shipping or Returns tabs; book shipments (`CREATE_SHIPMENT` 403); edit products; change order status; add notes; edit roles | |
| RP-07 | Support | Edit products; change order status; refund; change roles; open Production, QC, Shipping, Returns, Finance or Team. Support CAN add internal notes (`ADD_ORDER_NOTE`) | |
| RP-08 | Any admin | Escalate own role by API call | |
| RP-09 | Signed-out user | Open `/admin` or call admin APIs | Redirected to sign-in; API returns 401 | |
| RP-11 | Catalog manager | Open Production, QC, Support or Trade enquiries | |
| RP-10 | Customer | Open `/admin` or call admin APIs | Refused with 403 | |
| RP-12 | Designer | Open Orders, Production, QC, Shipping, Returns, Finance, Support, Customers, Analytics, Trade, Products, Discounts, Settings or Team; read `orders`, `users`, `coupons`, `staff` or `audit_logs`; call any `/api/admin` action other than the three consultation actions (403); read a customer's `users/{uid}/spaces` or `spaces/{uid}/...` photos | |
| RP-13 | Customer B | Read Customer A's spaces, wall photos, consultation or proposal previews (rules deny; the API answers 404); redeem A's credit code | |
| RP-14 | Support, Finance, Order manager | See the Consultations tab or read `consultations/*` | |

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
