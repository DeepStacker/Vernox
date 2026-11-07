# Single production image: the built SPA, the API and the scheduled jobs in one Node process
# (server/production.ts). It contains no project-specific configuration: the Firebase web config, site URL and
# every key arrive at runtime (/runtime-config.js, env file, keys entered in the admin), so the same image runs
# on any domain. Built by docker-compose.yml; see DEPLOYMENT.md.

# ---- build: SPA + bundled server ------------------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# The site URL is filled in when the container starts (server/staticSite.ts replaces this placeholder).
# VERNOX_RUNTIME_CONFIG lets the build proceed without VITE_FIREBASE_*: they come from /runtime-config.js.
ENV VERNOX_RUNTIME_CONFIG=true \
    VITE_SITE_URL=__VERNOX_SITE_URL__
RUN npm run build \
 && npx esbuild server/production.ts scripts/grant-super-admin.ts \
      --bundle --platform=node --format=esm --target=node20 --packages=external --entry-names=[name] --outdir=dist-server

# ---- production dependencies only -------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---- runtime ---------------------------------------------------------------------------------------------------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    STATIC_DIR=/app/dist
COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server
COPY --chown=node:node package.json ./

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--max-old-space-size=384", "dist-server/production.js"]
