# VERNOX PRODUCTION DEPLOYMENT & DEVOPS SPECIFICATION

## 1. Hosting Architecture
- **Frontend SPA**: Hosted on Vercel Edge Global CDN with immutable static caching for compiled bundles and aggressive asset hashing.
- **Serverless API**: Vercel Serverless Functions running Node.js 20.x in `iad1` (US East) or closest geographical region to customer clusters.
- **Database**: Google Cloud Firestore configured in multi-region high availability (`nam5` or `asia-south1`).

## 2. Environment Variables
The authoritative list with comments is `.env.example`. Required on the server: `FIREBASE_SERVICE_ACCOUNT_BASE64` (or
`GOOGLE_APPLICATION_CREDENTIALS`), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CRON_SECRET`.
Optional: `FIREBASE_PROJECT_ID`, `STORE_GST_RATE_PERCENT`, `STORE_SHIPPING_FEE_INR`, `STORE_FREE_SHIPPING_THRESHOLD_INR`.
A missing required variable makes the affected endpoint return `CONFIG_ERROR` and logs which variable is missing.

## 2a. One-time setup
1. `firebase deploy --only firestore` (rules + indexes) and configure TTL policies (DATABASE.md).
2. `npm run seed` against an empty project (optional).
3. Razorpay dashboard: enable auto-capture; add webhook `https://<domain>/api/razorpay-webhook` with secret
   `RAZORPAY_WEBHOOK_SECRET` and events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`.
4. Vercel Cron runs `/api/cron/release-reservations` every 5 minutes (`vercel.json`; sub-daily schedules need a Pro plan —
   on Hobby, call it from an external scheduler with the bearer secret).
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
