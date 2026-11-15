// One command for a complete local Vernox: `npm run demo` (add `-- --reset` to start from scratch).
//
// Starts the Firebase emulators (Firestore, Auth, Storage) under the offline project `demo-vernox`, loads the sample
// catalogue and demo data on the first run (scripts/demo/seed-demo.ts: a login per role, orders at every stage, a ticket,
// a trade enquiry), serves the storefront, admin and API on http://localhost:8080, and prints the logins. Data is kept in
// .demo-data/ between runs. Ctrl+C stops everything and saves the data. Needs Node 22+ and Java 21+ (Firestore emulator).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = join(ROOT, '.demo-data');
// Written only after the demo data was created, so a run that failed half-way seeds again next time.
const SEEDED = join(ROOT, '.demo-seeded');
const PROJECT = 'demo-vernox';
const SITE = 'http://localhost:8080';
const reset = process.argv.includes('--reset');

const env = {
  ...process.env,
  FIREBASE_PROJECT_ID: PROJECT,
  GCLOUD_PROJECT: PROJECT,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  // The browser app talks to the same emulators; these override any .env.local pointing at a real project.
  VITE_USE_FIREBASE_EMULATOR: 'true',
  VITE_FIREBASE_PROJECT_ID: PROJECT,
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
  VITE_FIREBASE_STORAGE_BUCKET: `${PROJECT}.appspot.com`,
  VITE_FIREBASE_APP_ID: 'demo-app',
  VITE_SITE_URL: SITE,
  DEMO_SITE: SITE,
  // firebase-admin otherwise probes for a Google Cloud metadata server and prints a warning; there is none locally.
  METADATA_SERVER_DETECTION: 'none',
};

const fail = msg => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

function checkPrerequisites() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 22) fail(`Node 22 or newer is needed (this is ${process.versions.node}). Install it from https://nodejs.org.`);
  const java = spawnSync('java', ['-version'], { encoding: 'utf8' });
  if (java.error || java.status !== 0) fail('Java 21 or newer is needed for the Firestore emulator. Install it from https://adoptium.net and run again.');
  if (!existsSync(join(ROOT, 'node_modules'))) fail('Run `npm install` first.');
}

const portFree = port => new Promise(resolve => {
  const server = net.createServer().once('error', () => resolve(false)).once('listening', () => server.close(() => resolve(true)));
  server.listen(port, '127.0.0.1');
});

async function checkPorts() {
  for (const port of [8080, 8085, 9099, 9199]) {
    if (!(await portFree(port))) fail(`Port ${port} is in use. Stop whatever runs there (another \`npm run demo\` or \`npm run dev\`) and try again.`);
  }
}

const children = [];
function start(name, command, args) {
  const child = spawn(command, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  child.on('exit', code => { if (!stopping && code !== 0) { console.error(`\n✖ ${name} stopped (exit ${code}). Its last output is above.`); shutdown(1); } });
  return child;
}

/** Resolves when `child` prints a line matching `ready`; echoes lines matching `show`. */
function waitFor(child, ready, show = /\berror\b/i, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${ready}`)), timeoutMs);
    const onData = buf => {
      for (const line of buf.toString().split('\n')) {
        if (show.test(line)) console.log(`  ${line.trim()}`);
        if (ready.test(line)) { clearTimeout(timer); resolve(); }
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  });
}

function run(label, command, args) {
  console.log(`→ ${label}`);
  const result = spawnSync(command, args, { cwd: ROOT, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${label} failed (see above). Run \`npm run demo -- --reset\` to try again from scratch.`);
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping (saving demo data to .demo-data/)…');
  for (const child of [...children].reverse()) child.kill('SIGINT');
  setTimeout(() => process.exit(code), 8000).unref();
  Promise.all(children.map(c => new Promise(r => (c.exitCode !== null ? r() : c.once('exit', r))))).then(() => process.exit(code));
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function printLogins() {
  const { password, accounts } = JSON.parse(readFileSync(join(ROOT, 'scripts/demo/accounts.json'), 'utf8'));
  console.log(`\n✔ Vernox is running: ${SITE}`);
  console.log(`  Shop: ${SITE}   Staff: ${SITE}/admin   Studio: ${SITE}/studio   Customer account: ${SITE}/account`);
  console.log(`\n  Password for every login below: ${password}\n`);
  for (const a of accounts) console.log(`  ${a.email.padEnd(30)} ${(a.role ?? 'customer').padEnd(16)} ${a.does}`);
  console.log('\n  Payments: cash on delivery works now; online payment needs Razorpay test keys (Admin > Settings > Integrations).');
  console.log('  Emails and SMS are queued, not sent, until those keys are added. Stop with Ctrl+C (data is kept; `npm run demo -- --reset` starts fresh).\n');
}

async function main() {
  checkPrerequisites();
  await checkPorts();
  if (reset) {
    rmSync(DATA_DIR, { recursive: true, force: true });
    rmSync(SEEDED, { force: true });
  }
  const firstRun = !existsSync(SEEDED) || !existsSync(DATA_DIR);
  if (firstRun) rmSync(DATA_DIR, { recursive: true, force: true });

  console.log('→ Starting the Firebase emulators (first start downloads them once)…');
  const emulators = start('Firebase emulators', 'npx', [
    'firebase', 'emulators:start', '--only', 'firestore,auth,storage', '--project', PROJECT,
    ...(firstRun ? [] : ['--import', DATA_DIR]), '--export-on-exit', DATA_DIR,
  ]);
  await waitFor(emulators, /All emulators ready/);

  if (firstRun) run('Loading the sample catalogue', 'npx', ['tsx', 'scripts/seed-firestore.ts', '--force']);

  console.log('→ Starting the site and API…');
  const site = start('Site', 'npx', ['vite', '--port', '8080', '--strictPort']);
  await waitFor(site, /Local:/);

  if (firstRun) {
    run('Creating demo logins and orders', 'npx', ['tsx', 'scripts/demo/seed-demo.ts']);
    writeFileSync(SEEDED, `${new Date().toISOString()}\n`);
  }
  printLogins();
}

main().catch(err => { console.error(`\n✖ ${err.message}`); shutdown(1); });
