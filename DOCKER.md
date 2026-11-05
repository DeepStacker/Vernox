# Vernox Containerized Architecture & Deployment

This project includes a multi-service Docker Compose configuration that runs the entire Vernox platform with isolated memory limits, saving gigabytes of host RAM.

---

## 🏗️ Architecture Overview

| Service | Container Name | Port Mapping | Image / Runtime | Memory Limit |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | `vernox-frontend` | `http://localhost:8080` | `nginx:alpine` (Production SPA + Reverse Proxy) | **128 MB** |
| **Backend** | `vernox-backend` | `http://localhost:3001` | `node:20-alpine` (Vernox API Server) | **384 MB** |
| **Database** | `vernox-database` | `http://localhost:8085` | `mtlynch/firestore-emulator` (ACID Firestore) | **384 MB** |

> **Total Memory Footprint**: Less than **~600 MB - 800 MB** combined (compared to ~5,000 MB when running multiple local Node/Vite watchers and browser instances on host Windows).

---

## 🚀 Quick Start Commands

### 1. Start all containers in Live Mode (Default)
```bash
docker compose up -d
```
> 🔥 **Live Hot Reload Enabled**: Your source files (`src/`, `api/`, `server/`) are mounted directly into the Docker containers. Any file you edit and save in your IDE updates **instantly** in your browser at `http://localhost:8080` without restarting or rebuilding containers!

### 2. First-time switch or dependency updates
When switching to live mode for the first time or updating `package.json`:
```bash
docker compose up -d --build
```

### 3. Production Build (Nginx Static Bundle)
If you want to run the hardened, static production Nginx build instead of the live development server:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 3. View live service logs
```bash
docker compose logs -f
```

To view logs for a specific service:
```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f database
```

### 3. Check container health & resource usage
```bash
docker compose ps
docker stats vernox-frontend vernox-backend vernox-database
```

### 4. Stop all services
```bash
docker compose down
```

### 5. Stop and wipe persistent database volume (Clean Reset)
```bash
docker compose down -v
```

---

## 🌐 Endpoints & Routing

- **Web Application**: [`http://localhost:8080`](http://localhost:8080)
- **API Health Check**: [`http://localhost:8080/api/health`](http://localhost:8080/api/health) or [`http://localhost:3001/api/health`](http://localhost:3001/api/health)
- **Checkout Intent**: `POST /api/checkout-intent`
- **Payment Verification**: `POST /api/verify-payment`
- **Order Status**: `GET /api/order-status`
- **Webhook**: `POST /api/razorpay-webhook`
- Server env vars: see `.env.example` (the backend needs Razorpay test keys; with the bundled emulator it needs no Firebase credentials)
- **Firestore Emulator**: [`http://localhost:8085`](http://localhost:8085)
