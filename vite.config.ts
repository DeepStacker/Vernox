import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import createOrderHandler from "./api/create-order";
import checkoutIntentHandler from "./api/checkout-intent";
import verifyPaymentHandler from "./api/verify-payment";
import validateCouponHandler from "./api/validate-coupon";
import adminHandler from "./api/admin";
import { DEFAULT_SITE_URL } from "./src/lib/seo/defaultSiteUrl";

function apiMiddlewarePlugin(env: Record<string, string>): Plugin {
  return {
    name: "api-middleware",
    configureServer(server) {
      if (process.env.BACKEND_URL) {
        // Backend container handles /api proxying
        return;
      }

      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) {
          return next();
        }

        // Populate process.env with freshly loaded environment variables
        const currentEnv = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
        Object.assign(process.env, currentEnv);

        const url = req.url.split("?")[0];
        let bodyBuffer = "";

        req.on("data", (chunk) => {
          bodyBuffer += chunk;
        });

        req.on("end", async () => {
          let parsedBody = {};
          try {
            if (bodyBuffer) parsedBody = JSON.parse(bodyBuffer);
          } catch (e) {
            // Ignore json parse error
          }

          const vercelReq = Object.assign(req, {
            body: parsedBody,
            query: {},
          });

          const vercelRes = Object.assign(res, {
            status(statusCode: number) {
              res.statusCode = statusCode;
              return vercelRes;
            },
            json(data: any) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(data));
              return vercelRes;
            },
          });

          try {
            if (url === "/api/health" || url === "/health") {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() }));
            } else if (url === "/api/checkout-intent") {
              await checkoutIntentHandler(vercelReq as any, vercelRes as any);
            } else if (url === "/api/validate-coupon") {
              await validateCouponHandler(vercelReq as any, vercelRes as any);
            } else if (url === "/api/admin") {
              await adminHandler(vercelReq as any, vercelRes as any);
            } else if (url === "/api/create-order") {
              await createOrderHandler(vercelReq as any, vercelRes as any);
            } else if (url === "/api/verify-payment") {
              await verifyPaymentHandler(vercelReq as any, vercelRes as any);
            } else {
              res.statusCode = 404;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Endpoint not found" }));
            }
          } catch (err: any) {
            console.error("API middleware error:", err);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message || "Internal server error" }));
          }
        });
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
        clientPort: 8080,
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
    plugins: [react(), apiMiddlewarePlugin(env), siteUrlHtmlPlugin(env)].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
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
