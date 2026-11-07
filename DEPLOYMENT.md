# VERNOX PRODUCTION DEPLOYMENT & DEVOPS SPECIFICATION

## 1. Hosting Architecture
- **Frontend SPA**: Hosted on Vercel Edge Global CDN with immutable static caching for compiled bundles and aggressive asset hashing.
- **Serverless API**: Vercel Serverless Functions on Node.js 20.x in `bom1` (Mumbai; `regions` in `vercel.json`), next to the customers and the database.
- **Database and files**: Firestore and Cloud Storage in `asia-south1` (Mumbai). The location is fixed when the Firebase project is created, so pick it then. Keeping customer data in India is the conservative choice under the DPDP Act, 2023.

## 2. Environment Variables
After deploying, open Admin > Settings > **Launch setup**: it lists every owner-provided key and business detail, whether each is
set (never its value), what it switches on and where to set it (`api/_lib/launchStatus.ts`). Every integration can be added later;
until then the store degrades instead of failing (manual shipping without Shiprocket, offline or COD staff orders without Razorpay,
no emails or SMS without Resend / MSG91).
The authoritative list with comments is `.env.example`. Required on the server: `FIREBASE_SERVICE_ACCOUNT_BASE64` (or
`GOOGLE_APPLICATION_CREDENTIALS`), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CRON_SECRET`.
Optional: `FIREBASE_PROJECT_ID`, the `STORE_*` defaults (GST, shipping, COD, lead times, return window, HSN), Shiprocket
(`SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, `SHIPROCKET_PICKUP_PINCODE`, `SHIPROCKET_WEBHOOK_TOKEN`),
notifications (`RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATES`) and `VITE_SITE_URL` (also read by the
server for links in notifications). Without Shiprocket the manual courier flow is used; without notification keys messages are
skipped (logged), never failing an order.
A missing required variable makes the affected endpoint return `CONFIG_ERROR` and logs which variable is missing.
Required at build time (browser): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_APP_ID` (and `VITE_FIREBASE_MESSAGING_SENDER_ID`), set per environment in Vercel;
`npm run build` fails without them. Locally put them in the gitignored `.env.local`.

## 2a. One-time setup
1. `firebase deploy --only firestore,storage` (rules, indexes, and the storage rules for return, QC, review, catalogue, space and consultation photos) and configure TTL policies
   (DATABASE.md). `npm run seed` fills `settings/store` with placeholder business details, so invoices are specimens
   (`SP/…`) until the real seller (legal name, GSTIN, address, state, state code, PIN) is saved in Admin → Settings.
2. `npm run seed` against an empty project (optional).
3. Razorpay dashboard: enable auto-capture; add webhook `https://<domain>/api/razorpay-webhook` with secret
   `RAZORPAY_WEBHOOK_SECRET` and events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`,
   `payment_link.paid` (staff orders paid by payment link; enable Payment Links on the account).
4. Vercel Cron runs `/api/cron/release-reservations` every 5 minutes and `/api/cron/send-notifications` every 2 minutes
   (`vercel.json`). **Vercel plan: Pro (decided 2026-11-06).** Hobby is for non-commercial use only, sub-daily crons need Pro, and the API is
   18 serverless functions (Hobby allows 12; `api/engage.ts` serves contact, newsletter and reviews; `api/seo.ts` link previews and the sitemap;
   `api/catalog.ts` the CDN-cached storefront data; `api/whatsapp-webhook.ts` the WhatsApp inbound webhook). The Docker image
   (`server/index.ts` routes every endpoint) is the fallback host.
4d. **WhatsApp (optional, configuration only; every part is skipped until its variables are set):**
   1. developers.facebook.com > My Apps > Create app (type Business), add the **WhatsApp** product, and attach/verify your business
      in Meta Business Settings. Add and verify the business phone number (WhatsApp > API Setup); note its **Phone number ID**.
   2. Business Settings > Users > System users: create a system user, assign the app and the WhatsApp account with full control,
      and generate a **permanent token** with `whatsapp_business_messaging` and `whatsapp_business_management`. Set
      `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` (optionally `WHATSAPP_GRAPH_VERSION`, default `v27.0`).
   3. WhatsApp > Configuration > Webhook: callback URL `https://<domain>/api/whatsapp-webhook`, verify token = a long random value you
      also set as `WHATSAPP_VERIFY_TOKEN`; subscribe to the **messages** field. Set `WHATSAPP_APP_SECRET` to the app secret
      (App settings > Basic); it signs every webhook (`X-Hub-Signature-256`).
   4. WhatsApp Manager > Message templates: create category **Utility**, language English, with these bodies (variables are
      always {{1}} first name, {{2}} order number, {{3}} event value) and wait for approval:
      - `order_confirmed`: "Hi {{1}}, your Vernox order {{2}} is confirmed. Amount: {{3}}. Each piece is made to order; we will tell you when it ships."
      - `shipped`: "Hi {{1}}, your Vernox order {{2}} has shipped. Tracking number (AWB): {{3}}."
      - `out_for_delivery`: "Hi {{1}}, your Vernox order {{2}} is out for delivery today. Tracking number (AWB): {{3}}."
      - `delivered`: "Hi {{1}}, your Vernox order {{2}} has been delivered. Review your purchase: {{3}}"
      Then set `WHATSAPP_TEMPLATES`, for example
      `{"order_confirmed":{"name":"order_confirmed","language":"en"},"shipped":{"name":"shipped","language":"en"},"out_for_delivery":{"name":"out_for_delivery","language":"en"},"delivered":{"name":"delivered","language":"en"}}`
      (`language` is the template's language code, e.g. `en` or `en_US`). Events not in the map are not sent on WhatsApp.
   Behaviour: order updates are business-initiated, so only approved templates are sent; free-form text is possible only from the
   Support console within 24 hours of the customer's last message. A customer who replies STOP is not messaged again (START
   re-enables). Meta requires the customer's opt-in to WhatsApp messaging: collect it at checkout (the privacy policy and order
   confirmation should say so) before enabling templates. Check Launch setup in the admin for the two optional items.
4c. **Support alerts:** set `supportEmail` in Settings so new contact-form tickets alert that inbox (needs the Resend email channel); without it, or while it is the seeded placeholder, tickets are still saved and visible in Support > Tickets. The newsletter list is exported with `npm run export:newsletter` (see DATABASE.md).
4a. **Shiprocket:** create an API user (Settings → API → Configure) and set `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD`; set
   `SHIPROCKET_PICKUP_LOCATION` to the pickup nickname and `SHIPROCKET_PICKUP_PINCODE`. Tracking webhook (Settings → API →
   Webhooks): URL `https://<domain>/api/courier-webhook` (Shiprocket rejects URLs containing "shiprocket", "kartrocket", "sr" or
   "kr"), token = `SHIPROCKET_WEBHOOK_TOKEN` (sent as `x-api-key`). Enable COD on the Shiprocket account for COD orders; COD
   remittance is settled by Shiprocket and reconciled by finance (Phase 3 console).
4b. **Notifications:** Resend — verify the sending domain, set `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL`. MSG91 SMS — register
   the sender ID and every template on the DLT portal (TRAI requirement in India; unregistered SMS are blocked), create matching
   MSG91 Flow templates with variables `##var1##` (first name), `##var2##` (order number), `##var3##` (amount / AWB / status, ≤ 30
   characters), then set `MSG91_AUTH_KEY` and `MSG91_TEMPLATES` (JSON event → template id). WhatsApp: see 4d.
   **COD confirmation code (optional):** in MSG91 > OTP create an OTP template and get it DLT-approved (OTP templates need DLT
   registration like any Indian SMS; body must contain the `##OTP##` variable), then set `MSG91_AUTH_KEY` and `MSG91_OTP_TEMPLATE_ID`.
   The checkout then asks for a 6-digit code before a COD order (Settings > Cash on delivery > "Confirm COD orders with an SMS
   code", default on). Without these two variables COD still works: orders are flagged `COD_UNVERIFIED` and staff see a "Confirm by
   phone" prompt (Orders and Production) with a one-tap Confirmed / Cancel. **Newsletter double opt-in:** sign-ups receive a
   confirmation email through the same outbox, so Resend must be configured; until it is, the confirmation emails wait in the outbox
   (status `pending`) and are sent automatically once `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` are set. Add a Firestore TTL policy on
   `cod_otps.purgeAt`.
5. `npm run grant-super-admin -- owner@example.com` to create the first staff account; manage others with `SET_STAFF_ROLE`.

Local development: use Razorpay **test** keys and either real Firebase credentials or the emulators
(`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_PROJECT_ID`). There is no mock payment mode.

## 3. Build & CI/CD Pipeline
- **Validation Pipeline**:
  ```bash
  npm run lint
  npx tsc --noEmit -p tsconfig.app.json
  npm run typecheck:api
  npm test
  npm run test:rules   # needs the Firebase CLI + Java (Firestore emulator)
  npm run build
  ```
- **Zero Downtime Deployments**: Vercel automatically deploys atomic preview builds with instant rollback capabilities to any previous production commit.

## 4. Production Health Checks & Readiness
- `server/index.ts` exposes `/api/health`. On Vercel, `GET /api/checkout-intent` returns `405 METHOD_NOT_ALLOWED`.
- Continuous synthetic monitoring via Pingdom/BetterUptime pinging the root endpoint.

## Design consultation (Stage 2)

- Storage bucket CORS: wall photos and proposal previews are read in the browser with the Storage SDK (`getBlob`) so the wall
  preview can read their pixels. Allow the site origin for `GET`: `gsutil cors set cors.json gs://<bucket>` with
  `[{"origin": ["https://<site>"], "method": ["GET"], "maxAgeSeconds": 3600}]`.
- `FIREBASE_STORAGE_BUCKET` (optional; defaults to `<project id>.firebasestorage.app`): the Admin SDK copies a paid consultation's
  wall photos with it. Locally set `FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199` too.
- Deploy `firestore.rules` and `storage.rules` together with the API: the `designer` role, `users/{uid}/spaces`, `consultations`
  and the `spaces/` and `consultations/` Storage paths are new.
- Enable the service in Settings (Design consultation) once the price, credit policy and SAC are confirmed.
