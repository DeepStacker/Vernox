# Vernox | Premium Metal Sign Designer

Vernox is a professional web-based tool for designing and visualizing custom metal signs with real-time, high-fidelity previews.

## Features
- **Real-time Design**: Instant visualization of shapes, text, and images.
- **Metal Previews**: 3D-like rendering of various metal finishes (Steel, Brass, Copper, etc.).
- **Mobile Responsive**: Optimized for both desktop and mobile devices.
- **Dark & Light Mode**: High-contrast themes for a premium editing experience.
- **Precision Grid**: Dual-grid system for accurate design placement.
- **Export Options**: Professional export formats for manufacturing.

## Tech Stack
- **Framework**: React + Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Canvas Engine**: React Konva
- **State Management**: Custom Reducer + Context API
- **Deployment**: Vercel

## Getting Started

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

### Building for Production
1. Run `npm run build`. The `prebuild` step runs `npm run sitemap` (`scripts/generate-sitemap.ts`), which regenerates `public/sitemap.xml` from static routes and product slugs in `src/lib/catalog.ts`.
2. The production-ready files will be in the `dist` directory.

### Images
`npm run optimize-images` (`scripts/optimize-images.mjs`, uses `sharp`) downsizes the JPGs in `public/images` and writes `.webp` siblings. It is idempotent; run it after adding new images.

### SEO
Pages set their title, description, canonical, Open Graph and JSON-LD through `useSeo` from `src/lib/seo`. Admin, cart and 404 pages are `noindex`.

### Acceptance testing
See `UAT.md` for the launch acceptance scripts by role.

## License
All rights reserved © Vernox 2026.
