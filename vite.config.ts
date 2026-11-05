import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { DEFAULT_SITE_URL } from "./src/lib/seo/defaultSiteUrl";

/**
 * Serves /api/* in `vite dev` through the same router as the Node server (server/apiRouter.ts).
 * Loaded with ssrLoadModule so API code is never bundled into this config or the client build,
 * and edits to api/ apply without restarting. Skipped when BACKEND_URL proxies to a container.
 */
function apiMiddlewarePlugin(): Plugin {
  return {
    name: "api-middleware",
    apply: "serve",
    configureServer(server) {
      if (process.env.BACKEND_URL) return;
      // Server code reads secrets from process.env; load .env* files (all keys, not only VITE_*).
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ""));
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/") && req.url !== "/health") return next();
        try {
          const { handleApiRequest } = await server.ssrLoadModule("/server/apiRouter.ts");
          await handleApiRequest(req, res);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

// Replaces %VITE_SITE_URL% in index.html (absolute OG image URLs) with the configured origin.
function siteUrlHtmlPlugin(env: Record<string, string>): Plugin {
  const siteUrl = (env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
  return {
    name: "site-url-html",
    transformIndexHtml: (html) => html.replace(/%VITE_SITE_URL%/g, siteUrl),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      host: "0.0.0.0",
      port: 8080,
      strictPort: true,
      watch: {
        usePolling: true,
        interval: 100,
      },
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      },
      hmr: {
        overlay: false,
      },
      ...(process.env.BACKEND_URL
        ? {
            proxy: {
              "/api": {
                target: process.env.BACKEND_URL,
                changeOrigin: true,
              },
            },
          }
        : {}),
    },
    plugins: [react(), apiMiddlewarePlugin(), siteUrlHtmlPlugin(env)].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // The studio lazy-loads react-konva; pre-bundling it avoids a forced reload on first open in dev.
    optimizeDeps: { include: ["konva", "react-konva"] },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Vite's virtual helpers (dynamic-import preloader, CJS interop) are used everywhere;
            // pin them to the core chunk so they don't drag pdf/charts into the entry.
            if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules')) {
              // Core runtime first: without an explicit chunk Rollup parks shared React code inside
              // whichever vendor chunk imports it first (charts/pdf), forcing them into the initial load.
              if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run|clsx|tailwind-merge|class-variance-authority)\//.test(id)) {
                return 'vendor-react';
              }
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              if (id.includes('recharts')) {
                return 'vendor-charts';
              }
              if (id.includes('jspdf') || id.includes('html2canvas')) {
                return 'vendor-pdf';
              }
              if (id.includes('framer-motion')) {
                return 'vendor-motion';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
            }
          },
        },
      },
    },
  };
});
