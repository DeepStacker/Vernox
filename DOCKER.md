# Docker

Two separate setups. Do not mix them.

| File | Purpose | Database |
| :--- | :--- | :--- |
| `Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile` | **Production** on any VM: one app image behind Caddy (automatic HTTPS). Run by `./install.sh` and `./update.sh`; see DEPLOYMENT.md. | Firebase (Firestore), never a container |
| `docker-compose.dev.yml`, `Dockerfile.backend.dev`, `Dockerfile.frontend.dev` | **Local development** with live reload and a Firestore **emulator**. | Emulator, data is not durable or safe |

## Production

```bash
./install.sh            # first time: asks for domain, admin email, service account, Firebase web config
./update.sh             # upgrade
docker compose --env-file .env.production logs -f app
docker compose --env-file .env.production ps
```

`--env-file .env.production` is needed on every manual `docker compose` call (it supplies `DOMAIN` and `ADMIN_EMAIL` to the file).

| Service | Image | Ports | Memory limit |
| :--- | :--- | :--- | :--- |
| `app` | built from `Dockerfile` (Node 20 alpine, non-root, read-only filesystem) | 3001, internal only | 640 MB (Node heap capped at 384 MB) |
| `caddy` | `caddy:2-alpine` | 80, 443 (TCP and UDP) | 128 MB |

The `app` process (`server/production.ts`) serves the SPA, the API, `/runtime-config.js`, `/healthz` and `/readyz`, and runs the two
scheduled jobs. The image holds no project-specific configuration; everything comes from `.env.production` (written by `install.sh`,
mode 600) and from the keys entered in Admin > Settings > Integrations. Details: DEPLOYMENT.md section 1.

Build the image by hand: `docker build -t vernox-app .`

## Local development with the emulator

```bash
docker compose -f docker-compose.dev.yml up -d          # frontend http://localhost:8080, API http://localhost:3001, emulator :8085
docker compose -f docker-compose.dev.yml up -d --build  # after changing package.json
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml down           # add -v to wipe the emulator data
```

Source folders (`src/`, `api/`, `server/`) are mounted, so edits show up without rebuilding. The backend needs Razorpay test keys in your
shell or `.env` (see `.env.example`); with the bundled emulator it needs no Firebase credentials. Without Docker, `npm run emulators`,
`npm run seed:local` and `npm run dev:local` (README.md) give the same.

Endpoints: web app `http://localhost:8080`, health `http://localhost:3001/api/health`, checkout `POST /api/checkout-intent`,
payment verification `POST /api/verify-payment`, order status `GET /api/order-status`, webhook `POST /api/razorpay-webhook`.
