# VERNOX PRODUCTION DEPLOYMENT & DEVOPS SPECIFICATION

Two supported ways to run production. Both use Firebase (Auth, Firestore, Storage) as the database; the app code is the same.

| | Any VM (recommended) | Vercel |
| :--- | :--- | :--- |
| Command | `./install.sh` | Git integration, `vercel --prod` |
| Runs | one Docker image: SPA + API + scheduled jobs in one Node process, behind Caddy (automatic HTTPS) | CDN + serverless functions + Vercel Cron |
| Browser config | `GET /runtime-config.js`, from the server environment | the same file, from `api/runtime-config.ts`, or the build-time `VITE_*` variables |
| Third-party keys | entered in the app (Admin > Settings > Integrations) | the same, or Vercel environment variables |

## 1. Any VM (recommended single command)

**What you need:** a Linux VM (1 to 2 GB RAM, Ubuntu or Debian recommended; Docker is installed for you), a domain, and a Firebase project.

1. **Firebase project** (console.firebase.google.com), once:
   - Build > **Firestore Database** > Create database in `asia-south1` (Mumbai; the location cannot be changed later; keeping customer data in India is the conservative choice under the DPDP Act, 2023), production mode.
   - Build > **Storage** > Get started (same location).
   - Build > **Authentication** > Get started; enable the sign-in methods you want (Google, Email/Password).
   - Project settings > General > Your apps > add a **Web app**; keep the `firebaseConfig` block (it is public).
   - Project settings > Service accounts > **Generate new private key**; keep the JSON file (it is secret).
   - Authentication > Settings > **Authorized domains**: add your domain.
2. **DNS**: an `A` record (and `AAAA` if the VM has IPv6) for `shop.example.in`, and optionally the same for `www.shop.example.in` (it redirects to the main domain), pointing at the VM. The certificate is issued automatically once DNS resolves.
3. **Firewall**: open TCP **80** and **443** (and UDP 443 for HTTP/3). Nothing else needs to be reachable; the app container is not published.
4. **Run** on the VM (copy the code there with `git clone` or by unpacking a release archive):
   ```bash
   ./install.sh
   ```
   It asks for the domain, your admin email, the path to the service-account JSON and the Firebase web config, then: installs Docker if missing (Ubuntu/Debian, after asking), writes `.env.production` (mode 600, with generated `SECRETS_ENCRYPTION_KEY` and `CRON_SECRET`; existing secrets are never overwritten), builds and starts the stack, waits for `/readyz`, deploys the Firestore and Storage rules and indexes (in a throwaway Node container, so only Docker is needed on the host), makes the admin email a super admin, and prints the URLs. Non-interactive:
   ```bash
   ./install.sh --domain shop.example.in --admin-email owner@example.in \
                --service-account ./service-account.json --web-config ./firebase-web-config.json \
                --non-interactive --yes
   ```
   `--web-config` takes a file or the pasted snippet (JSON or the JavaScript object from the console); the six `FIREBASE_WEB_*` variables also work. Re-running is safe. Other modes: `--rules-only`, `--skip-rules`, `--grant-admin EMAIL`.
   If the admin email has not signed up yet, `install.sh` says so: sign up on the site with that email, run `./install.sh --grant-admin owner@example.in`, then sign in again.
   The rules step needs a service account allowed to deploy rules and indexes (the "Firebase Rules Admin" and "Cloud Datastore Index Admin" roles); if it fails, the script prints the manual command and carries on.
5. **After it runs** (everything below happens inside the app, no restart needed): open **Admin > Settings > Integrations** and enter the keys for Razorpay, Shiprocket, Resend, MSG91 and WhatsApp (encrypted at rest with `SECRETS_ENCRYPTION_KEY`); then paste the webhook URLs into the providers:
   - Razorpay: `https://<domain>/api/razorpay-webhook` (events in section 3a, step 3)
   - Shiprocket: `https://<domain>/api/courier-webhook`
   - Meta WhatsApp: `https://<domain>/api/whatsapp-webhook`

   Admin > Settings > **Launch setup** shows what is still missing.

**Architecture on the VM** (`docker-compose.yml`): `app` (image from `Dockerfile`: Node 20, non-root, read-only filesystem, 640 MB limit; entry `server/production.ts`) and `caddy` (official image; HTTPS, HTTP to HTTPS redirect, `www` to apex redirect, zstd/gzip compression, certificates in the `caddy_data` volume; `deploy/Caddyfile`). The app serves `dist/` (hashed `/assets/*` immutable for a year, `index.html` never cached, SPA fallback), `/api/*`, `/runtime-config.js`, the `vercel.json` rewrites (`/product/:slug` link previews, `/sitemap.xml`), `GET /healthz` (process up) and `GET /readyz` (Firestore answers), runs the two jobs of `vercel.json` in-process (`release-reservations` every 5 minutes, `send-notifications` every 2 minutes; never overlapping; `DISABLE_INTERNAL_CRON=true` turns them off), and shuts down gracefully on SIGTERM. Run exactly **one** `app` replica: the jobs are idempotent, but each replica would run them. Caddy overwrites `x-real-ip`, which the API's rate limiter trusts, so never publish the app's port.

**Operations**
- Logs: `docker compose --env-file .env.production logs -f app` (`sudo` if your user is not in the `docker` group).
- Update: `./update.sh` (`git pull --ff-only`, rebuild, restart, wait for `/readyz`; Caddy holds requests for up to 15 s meanwhile). Without git: `./update.sh --tarball release.tgz`. Add `--rules` after a change to `firestore.rules`, `storage.rules` or `firestore.indexes.json`. Roll back with `git checkout <commit> && ./update.sh`.
- **Backup**: the data lives in Firestore, not on the VM. Once the project is on the Blaze plan, run
  `./deploy/firebase-backups.sh <project-id>` from a machine with the Firebase CLI: it turns on point-in-time recovery
  (7 days) and daily managed backups kept 14 days, and is safe to re-run. Until then there are no backups. Enable
  Storage object versioning too. **Back up `.env.production`** somewhere safe: it holds `SECRETS_ENCRYPTION_KEY`;
  without it the keys saved in the admin cannot be decrypted and must be entered again. Restores: INCIDENT_RECOVERY.md.
- **Error alerts**: unexpected server errors are e-mailed (throttled) to `ALERT_EMAIL`, else `ADMIN_EMAIL`, once the
  Resend key and sender are set. Roll back a bad release with `git checkout <previous commit> && ./update.sh`.
- Rotate `CRON_SECRET`: edit `.env.production`, then `docker compose --env-file .env.production up -d app`.
- Never use `docker-compose.dev.yml` for production: it runs a Firestore emulator (DOCKER.md).

## 2. Vercel

- **Frontend SPA**: Vercel Edge CDN, hashed assets immutable.
- **API**: Vercel Serverless Functions on Node.js 20.x in `bom1` (Mumbai; `regions` in `vercel.json`).
- Set the environment (Project > Settings > Environment Variables) and redeploy: `FIREBASE_SERVICE_ACCOUNT_BASE64`, `SECRETS_ENCRYPTION_KEY` (so keys entered in the admin are encrypted with a key of your own), `CRON_SECRET`, `VITE_SITE_URL`, and the Firebase web config as `VITE_FIREBASE_*` (read at build time by the bundle and at runtime by `/runtime-config.js`; `npm run build` fails without them). Razorpay and the other integrations can be entered in the app or set here.
- Crons: `vercel.json` schedules `/api/cron/release-reservations` (5 min) and `/api/cron/send-notifications` (2 min); Vercel sends `Authorization: Bearer <CRON_SECRET>`. **Plan: Pro (decided 2026-11-06).** Hobby is non-commercial and has no sub-daily crons. The API is 19 serverless functions (Hobby allows 12): `api/engage.ts` serves contact, newsletter and reviews; `api/seo.ts` link previews and the sitemap; `api/catalog.ts` the CDN-cached storefront data; `api/whatsapp-webhook.ts` the WhatsApp inbound webhook; `api/runtime-config.ts` the browser configuration (`/runtime-config.js` rewrite in `vercel.json`).
- Rules and indexes: `firebase deploy --only firestore,storage --project <id>`.

## 3. Environment Variables
After deploying, open Admin > Settings > **Launch setup**: it lists every owner-provided key and business detail, whether each is
set (never its value), what it switches on and where to set it (`api/_lib/launchStatus.ts`). Every integration can be added later;
until then the store degrades instead of failing (manual shipping without Shiprocket, offline or COD staff orders without Razorpay,
no emails or SMS without Resend / MSG91).
The authoritative list with comments is `.env.example`.
- **Bootstrap (install time)**: `DOMAIN`, `ADMIN_EMAIL`, `FIREBASE_SERVICE_ACCOUNT_BASE64` (or `GOOGLE_APPLICATION_CREDENTIALS`), `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_*` (public Firebase web config), `VITE_SITE_URL`, and the two generated secrets `SECRETS_ENCRYPTION_KEY` (32 bytes; encrypts keys stored in the database; do not lose it) and `CRON_SECRET`. Optional: `DISABLE_INTERNAL_CRON`, `FIREBASE_STORAGE_BUCKET`, the `STORE_*` defaults (GST, shipping, COD, lead times, return window, HSN).
- **Entered in the app (Admin > Settings > Integrations), or as environment variables**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, Shiprocket (`SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, `SHIPROCKET_PICKUP_PINCODE`, `SHIPROCKET_WEBHOOK_TOKEN`), notifications (`RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `ALERT_EMAIL`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATES`, `MSG91_OTP_TEMPLATE_ID`) and WhatsApp (`WHATSAPP_*`). A value in the real environment wins over one stored in the app.
Without Shiprocket the manual courier flow is used; without notification keys messages are skipped (logged), never failing an order.
A missing required variable makes the affected endpoint return `CONFIG_ERROR` and logs which variable is missing.

**Browser configuration at runtime.** The bundle does not carry the Firebase project, site URL or Razorpay key id: `index.html` loads `/runtime-config.js` (`Cache-Control: no-cache`; `api/_lib/runtimeConfig.ts`), which sets `window.__VERNOX_CONFIG__ = { firebase, siteUrl, razorpayKeyId }` from `FIREBASE_WEB_*` (or `VITE_FIREBASE_*`), `VITE_SITE_URL` and `RAZORPAY_KEY_ID`, read after the integrations stored in the admin are applied, so a key id entered in the admin reaches the browser without a rebuild. The readers in `src/lib/runtimeConfig.ts` prefer it and fall back to the build-time `VITE_*` values (Vercel builds, `vite dev`). It holds public values only and must never gain a secret. The Docker build sets `VERNOX_RUNTIME_CONFIG=true`, which skips the build-time Firebase check, and bakes a placeholder site URL into `index.html` that the server replaces at start-up.

The Razorpay key id also drives the EMI / pay-in-instalments message (Razorpay Affordability Widget) on product and cart pages: enable
it in the Razorpay Dashboard (Affordability > Others > Enable Widget; Owner, Admin or Manager role). It loads `cdn.razorpay.com` lazily
after the page is idle; unset key or a blocked script shows nothing. If you add a CSP, allow that origin (SECURITY.md, "Content-Security-Policy origins").

## 3a. Provider setup (after the first start)
1. Rules and indexes (`install.sh` and `update.sh --rules` run `firebase deploy --only firestore,storage`; the rules, indexes, and the storage rules for return, QC, review, catalogue, space and consultation photos) and configure TTL policies
   (DATABASE.md). `npm run seed` fills `settings/store` with placeholder business details, so invoices are specimens
   (`SP/…`) until the real seller (legal name, GSTIN, address, state, state code, PIN) is saved in Admin → Settings.
2. `npm run seed` against an empty project (optional).
3. Razorpay dashboard: enable auto-capture; add webhook `https://<domain>/api/razorpay-webhook` with secret
   `RAZORPAY_WEBHOOK_SECRET` and events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`,
   `payment_link.paid` (staff orders paid by payment link; enable Payment Links on the account).
4. The two scheduled jobs run every 5 and 2 minutes: in the Docker image by the in-process scheduler (`server/internalCron.ts`),
   on Vercel by Vercel Cron (`vercel.json`; section 2).
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
5. `install.sh` makes the admin email a super admin; otherwise `npm run grant-super-admin -- owner@example.com` creates the first staff account; manage others with `SET_STAFF_ROLE`.

Local development: use Razorpay **test** keys and either real Firebase credentials or the emulators
(`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_PROJECT_ID`). There is no mock payment mode.

## 4. Build & CI/CD Pipeline
- **Validation Pipeline**:
  ```bash
  npm run lint
  npx tsc --noEmit -p tsconfig.app.json
  npm run typecheck:api
  npm test
  npm run test:rules   # needs the Firebase CLI + Java (Firestore emulator)
  npm run build
  ```
- **Image build**: `docker compose --env-file .env.production build app` (multi-stage `Dockerfile`; the SPA is built once with no project-specific values).
- **Deployments**: VM: `./update.sh`. Vercel: atomic preview builds with instant rollback to any previous production commit.

## 5. Production Health Checks & Readiness
- Docker image: `GET /healthz` (process up) and `GET /readyz` (a cheap Firestore read; 503 when it fails), used by the container healthcheck; `/api/health` also exists (`server/apiRouter.ts`). On Vercel, `GET /api/checkout-intent` returns `405 METHOD_NOT_ALLOWED`.
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
