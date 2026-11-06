# VERNOX PRODUCTION DEPLOYMENT & DEVOPS SPECIFICATION

## 1. Hosting Architecture
- **Frontend SPA**: Hosted on Vercel Edge Global CDN with immutable static caching for compiled bundles and aggressive asset hashing.
- **Serverless API**: Vercel Serverless Functions on Node.js 20.x in `bom1` (Mumbai; `regions` in `vercel.json`), next to the customers and the database.
- **Database and files**: Firestore and Cloud Storage in `asia-south1` (Mumbai). The location is fixed when the Firebase project is created, so pick it then. Keeping customer data in India is the conservative choice under the DPDP Act, 2023.

## 2. Environment Variables
The authoritative list with comments is `.env.example`. Required on the server: `FIREBASE_SERVICE_ACCOUNT_BASE64` (or
`GOOGLE_APPLICATION_CREDENTIALS`), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CRON_SECRET`.
Optional: `FIREBASE_PROJECT_ID`, the `STORE_*` defaults (GST, shipping, COD, lead times, return window, HSN), Shiprocket
(`SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, `SHIPROCKET_PICKUP_PINCODE`, `SHIPROCKET_WEBHOOK_TOKEN`),
notifications (`RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATES`) and `VITE_SITE_URL` (also read by the
server for links in notifications). Without Shiprocket the manual courier flow is used; without notification keys messages are
skipped (logged), never failing an order.
A missing required variable makes the affected endpoint return `CONFIG_ERROR` and logs which variable is missing.

## 2a. One-time setup
1. `firebase deploy --only firestore,storage` (rules, indexes, storage rules for return photos) and configure TTL policies
   (DATABASE.md). Fill `settings/store.seller` (legal name, GSTIN, address, state, 2-digit state code, PIN) before the first
   dispatch: invoices — and so shipments — are refused until it is complete.
2. `npm run seed` against an empty project (optional).
3. Razorpay dashboard: enable auto-capture; add webhook `https://<domain>/api/razorpay-webhook` with secret
   `RAZORPAY_WEBHOOK_SECRET` and events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`.
4. Vercel Cron runs `/api/cron/release-reservations` every 5 minutes and `/api/cron/send-notifications` every 2 minutes
   (`vercel.json`). **Vercel plan: Pro (decided 2026-11-06).** Hobby is for non-commercial use only, sub-daily crons need Pro, and the API is
   15 serverless functions (Hobby allows 12; `api/engage.ts` serves contact, newsletter and reviews). The Docker image
   (`server/index.ts` routes every endpoint) is the fallback host.
4c. **Support alerts:** set `supportEmail` in Settings so new contact-form tickets alert that inbox (needs the Resend email channel); without it, or while it is the seeded placeholder, tickets are still saved and visible in Support > Tickets. The newsletter list is exported with `npm run export:newsletter` (see DATABASE.md).
4a. **Shiprocket:** create an API user (Settings → API → Configure) and set `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD`; set
   `SHIPROCKET_PICKUP_LOCATION` to the pickup nickname and `SHIPROCKET_PICKUP_PINCODE`. Tracking webhook (Settings → API →
   Webhooks): URL `https://<domain>/api/courier-webhook` (Shiprocket rejects URLs containing "shiprocket", "kartrocket", "sr" or
   "kr"), token = `SHIPROCKET_WEBHOOK_TOKEN` (sent as `x-api-key`). Enable COD on the Shiprocket account for COD orders; COD
   remittance is settled by Shiprocket and reconciled by finance (Phase 3 console).
4b. **Notifications:** Resend — verify the sending domain, set `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL`. MSG91 SMS — register
   the sender ID and every template on the DLT portal (TRAI requirement in India; unregistered SMS are blocked), create matching
   MSG91 Flow templates with variables `##var1##` (first name), `##var2##` (order number), `##var3##` (amount / AWB / status, ≤ 30
   characters), then set `MSG91_AUTH_KEY` and `MSG91_TEMPLATES` (JSON event → template id). WhatsApp is not wired yet (the
   `NotificationChannel` interface in `api/_lib/notifications/types.ts` is the extension point).
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
