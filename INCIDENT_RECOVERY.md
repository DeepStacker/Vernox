# Vernox incident and disaster recovery

Applies to the single-VM Docker deployment (DEPLOYMENT.md). The database is Cloud Firestore in asia-south1; the
VM holds no customer data, only `.env.production`.

## 1. Database backups and recovery

Set up once per Firebase project, after the Blaze plan is on: `./deploy/firebase-backups.sh <project-id>`.

- **Point-in-time recovery (PITR)**: every minute of the last 7 days can be read back. Use it for a bad write or a
  wrong bulk edit: `gcloud firestore export` with `--snapshot-time`, or read documents at that time, then copy the
  correct values back. Recovery point: about 1 minute.
- **Daily managed backups**, kept 14 days: for losing a whole collection or the database. Restore goes into a
  new database (`firebase firestore:backups:list`, then `gcloud firestore databases restore --source-backup=…
  --destination-database=restored`), checked, then copied back or switched to. Expect an hour or more for the whole
  shop.
- Until the script has run, **there are no backups**: Launch setup should not be signed off before it.
- Also back up `.env.production` off the VM. Without its `SECRETS_ENCRYPTION_KEY`, keys saved in Settings >
  Integrations cannot be decrypted (re-enter them if it is lost). Everything else in it can be regenerated.

## 2. Losing the VM

Nothing on the VM is the only copy. On a new machine: copy `.env.production`, run `./install.sh`, point DNS at
the new address. Caddy obtains a new certificate by itself.

## 3. Payment and provider failures

- **Razorpay down while ordering**: the order stays unpaid and its stock reservation is released by the
  `release-reservations` cron (api/_lib/reservations.ts); no money is taken.
- **Paid, but the customer closed the browser**: the Razorpay webhook (`/api/razorpay-webhook`) marks the order
  paid; it is idempotent, so retries are safe.
- **Email, SMS or WhatsApp provider down**: messages wait in the notification outbox and the `send-notifications`
  cron retries them.

## 4. Noticing an incident

Unexpected server errors are e-mailed to `ALERT_EMAIL` (Settings > Integrations), else the admin e-mail, at most
once per 15 minutes per area (api/_lib/opsAlert.ts). This needs the Resend key. Logs:
`docker compose logs app --since 1h`. Health: `https://<domain>/healthz` (process) and `/readyz` (database).

## 5. Severity and first actions

- **SEV-1, orders or payments failing**: check the alert mail and logs, Razorpay Dashboard > Webhooks (delivery
  failures), Settings > Integrations > Check. Roll back with `git checkout <previous tag> && ./update.sh`.
- **SEV-2, wrong prices or catalogue**: fix in the admin; if a release caused it, roll back as above.
- **SEV-3, Studio or wall preview problems**: the storefront keeps working; fix in the next release.
