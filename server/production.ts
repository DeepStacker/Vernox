/**
 * Production entry point: ONE Node process serves the built SPA, the API, the probes and the scheduled jobs, so a
 * single image runs on any VM behind a TLS proxy (Caddy, see docker-compose.yml and deploy/Caddyfile). `server/index.ts` stays the
 * API-only entry for local development.
 *
 * Environment: PORT (3001), STATIC_DIR (dist), VITE_SITE_URL, DISABLE_INTERNAL_CRON, CRON_SECRET, plus the
 * API's own variables (.env.example).
 */
import http from 'http';
import releaseReservationsHandler from '../api/cron/release-reservations';
import sendNotificationsHandler from '../api/cron/send-notifications';
import { getStore } from '../api/_lib/firebaseAdmin';
import { startInternalCron, type InternalCron } from './internalCron';
import { createProductionListener } from './productionApp';
import { createStaticSite } from './staticSite';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const STATIC_DIR = process.env.STATIC_DIR || 'dist';
const SHUTDOWN_GRACE_MS = 10_000;
// Mirrors vercel.json "crons".
const CRON_JOBS = [
  { name: 'release-reservations', intervalMs: 5 * 60_000, handler: releaseReservationsHandler },
  { name: 'send-notifications', intervalMs: 2 * 60_000, handler: sendNotificationsHandler },
];

const siteUrl = (process.env.VITE_SITE_URL?.trim() || 'https://vernox.in').replace(/\/+$/, '');
const site = createStaticSite(STATIC_DIR, siteUrl);

// api/seo.ts reads index.html from here instead of fetching the public URL (which needs DNS, TLS and the proxy).
process.env.INTERNAL_ORIGIN ||= `http://127.0.0.1:${PORT}`;

const server = http.createServer(createProductionListener({
  site,
  // A cheap read of a document that may not exist: proves credentials, network and the database answer.
  checkReady: async () => { await getStore().get('settings/store'); },
}));

let cron: InternalCron | undefined;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Vernox listening on http://0.0.0.0:${PORT} (site ${siteUrl}, static ${STATIC_DIR})`);
  console.log(`   Firestore: ${process.env.FIRESTORE_EMULATOR_HOST || 'Live Google Cloud'}`);
  if (process.env.DISABLE_INTERNAL_CRON === 'true') {
    console.log('[cron] internal scheduler disabled (DISABLE_INTERNAL_CRON=true)');
  } else if (!process.env.CRON_SECRET?.trim()) {
    console.error('[cron] CRON_SECRET is not set: scheduled jobs (stock release, notifications) are NOT running');
  } else {
    cron = startInternalCron(CRON_JOBS, process.env.CRON_SECRET.trim());
    console.log(`[cron] internal scheduler started: ${CRON_JOBS.map(j => `${j.name} every ${j.intervalMs / 60_000} min`).join(', ')}`);
  }
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received: draining connections and running jobs`);
  const force = setTimeout(() => {
    console.error('Shutdown grace period exceeded; exiting');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  force.unref();
  // close() stops accepting and (Node 19+) drops idle keep-alive sockets; the callback fires once in-flight requests end.
  const closed = new Promise<void>(resolve => server.close(() => resolve()));
  void Promise.all([closed, cron?.stop()]).then(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
