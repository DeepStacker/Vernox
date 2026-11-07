# Vernox | Premium Metal Sign Designer

Vernox is a professional web-based tool for designing and visualizing custom metal signs with real-time, high-fidelity previews.

## Features
- **Design studio** (`/studio`): templates (name plates incl. Hindi, Om mandala, office plaque, quote, festive), text in Latin and
  Devanagari, shapes, logo/photo tracing, SVG/DXF import; live manufacturability checks with one-click fixes; live price equal to
  the server's. Guide: `docs/studio.md`.
- **Metal Previews**: finish rendering (Steel, Brass, Copper, etc.) with wall shadow.
- **Mobile Responsive**: Optimized for both desktop and mobile devices.
- **Dark & Light Mode**: High-contrast themes for a premium editing experience.
- **Precision Grid**: Dual-grid system for accurate design placement.
- **Export Options**: Professional export formats for manufacturing.

## Tech Stack
- **Framework**: React + Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Studio engine**: Konva (react-konva), Clipper2, HarfBuzz (WASM), imagetracerjs, zustand + zundo (see `docs/adr/0001-studio-engine.md`)
- **State Management**: React context (storefront), zustand (studio)
- **Deployment**: any Linux VM with one command (`./install.sh`: Docker + Caddy) or Vercel (DEPLOYMENT.md)

## Getting Started

### Production on any VM (one command)
On a Linux VM with a domain pointing at it and a Firebase project (Firestore, Storage, Auth, a web app and a service-account key):
```bash
./install.sh
```
It asks for the domain, your admin email, the service-account JSON and the Firebase web config, installs Docker if needed, starts the
app behind Caddy with automatic HTTPS, deploys the Firestore/Storage rules and makes you super admin. Then open Admin > Settings >
Integrations to enter your Razorpay, Shiprocket, Resend, MSG91 and WhatsApp keys. Upgrade with `./update.sh`. Details, DNS, firewall
and backups: DEPLOYMENT.md. Vercel is also supported (same document).

### Local Development
1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local` and fill in the Firebase service account and Razorpay test keys (see DEPLOYMENT.md).
4. Start the dev server: `npm run dev`. It serves the storefront and `/api/*` on http://localhost:8080; the API runs through `server/apiRouter.ts`, the same router the Docker backend uses. Without Firebase credentials, API calls fail with `CONFIG_ERROR` by design.

### Local stack with sample data (no cloud credentials needed)
1. `npm run emulators` — Firestore, Auth and Storage emulators (needs Java and the Firebase CLI).
2. `npm run seed:local` — loads the sample catalogue and store settings into the emulator.
3. `npm run dev:local` — the app and `/api/*` against the emulators on http://localhost:8080.
Payments still need Razorpay test keys in `.env.local`.

### Package manager
npm is the only supported package manager (`package-lock.json` is the single lockfile; Dockerfiles use `npm ci`). Do not commit `bun.lock`, `bun.lockb` or `yarn.lock`.

### Configuration
Copy `.env.example` to `.env`. `VITE_SITE_URL` is the canonical public origin (default `https://vernox.in`); it feeds canonical and Open Graph URLs, `index.html` and the sitemap. Also update the `Sitemap:` line in `public/robots.txt` when the domain changes.

### Fonts
Cormorant Garamond, Plus Jakarta Sans and JetBrains Mono are self-hosted in `public/fonts/` (variable woff2, latin and latin-ext
subsets from Google Fonts v21/v12/v24, declared in `src/index.css` with `font-display: swap`), so pages make no request to Google
Fonts. All three are licensed under the SIL Open Font License 1.1 (free to self-host and redistribute; the licence texts are at
https://github.com/google/fonts/tree/main/ofl/cormorantgaramond, `/plusjakartasans` and `/jetbrainsmono`). Nothing is preloaded: a
font preload measured +0.1 to +0.5 s first paint on the throttled harness because it competes with the CSS and JS.

### Storefront conveniences
- **PIN fills city and state** (checkout, Account address, Admin > New order): `src/lib/pincode.ts` maps a PIN's prefix to its state
  or UT (no service, works offline) and `GET /api/serviceability` adds the courier's city and state; fields are filled only when empty.
- **Save for later** in the cart (`src/lib/cartLines.ts`): full cart lines kept in this browser's `localStorage` (not the wishlist,
  which only stores product ids and could not keep size, finish or Studio designs).
- **EMI message**: Razorpay Affordability Widget on product and cart pages (`src/components/shop/EmiWidget.tsx`), lazy, shown only
  when a Razorpay key id is configured (`RAZORPAY_KEY_ID`, delivered to the browser by `/runtime-config.js`).
- **Hero image**: the home hero is served as AVIF/WebP at 640, 960 and 1200 px with `srcset` (`node scripts/optimize-images.mjs --responsive-only`).

### Performance check
Measures cold loads of Home, Shop and a product page on a throttled mid-range phone (results and baseline: ROADMAP.md,
"Performance and scale plan"). With the emulators running and seeded (`npm run emulators`, `npm run seed:local`):
0. Once: `npx playwright install chromium` (or set `CHROMIUM_PATH` to an installed Chromium).
1. `VITE_USE_FIREBASE_EMULATOR=true npx vite build --outDir /tmp/vernox-perf`
2. API: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_PROJECT_ID=vernox-1b5d5 npx tsx server/index.ts`
3. `node scripts/perf/serve.mjs /tmp/vernox-perf` then `RUNS=5 node scripts/perf/measure.mjs`
Compare builds in interleaved runs on the same machine load; single runs vary by a few hundred milliseconds.

### Building for Production
1. Run `npm run build` (needs the `VITE_FIREBASE_*` variables, see `.env.example`). `/sitemap.xml` and the link-preview head of
   `/product/:slug` are served live by `api/seo.ts` from the products in Firestore, so new products need no rebuild. The storefront
   reads its catalogue from `GET /api/catalog` (CDN-cached for 60 s), so product and settings edits show to shoppers within a minute.
2. The production-ready files will be in the `dist` directory.

### Images
`npm run optimize-images` (`scripts/optimize-images.mjs`, uses `sharp`) downsizes the JPGs in `public/images` and writes `.webp` siblings. It is idempotent; run it after adding new images.

### SEO
Pages set their title, description, canonical, Open Graph and JSON-LD through `useSeo` from `src/lib/seo`. Admin, cart and 404 pages are `noindex`.

### Acceptance testing
See `UAT.md` for the launch acceptance scripts by role.

## License
All rights reserved © Vernox 2026.
