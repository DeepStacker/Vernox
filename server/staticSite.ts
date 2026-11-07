/**
 * Serves the built SPA (dist/) from the Node process: hashed /assets/* are immutable for a year, everything else
 * is revalidated, index.html is never cached, and unknown paths fall back to index.html (client-side routes).
 * Compression is left to the reverse proxy (Caddy). Built-ins only, no dependency.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';

/** Placeholder baked into the image's index.html (Dockerfile VITE_SITE_URL build arg), replaced at start-up. */
export const SITE_URL_PLACEHOLDER = '__VERNOX_SITE_URL__';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.pdf': 'application/pdf',
  '.map': 'application/json',
};

export interface StaticSite {
  /** Handles GET/HEAD for a static file or the SPA fallback. Returns false when the method is not GET/HEAD. */
  serve(req: http.IncomingMessage, res: http.ServerResponse): boolean;
  /** index.html with the site URL filled in (also what api/seo.ts reads for link previews). */
  indexHtml(): string;
}

export function cacheControlFor(urlPath: string): string {
  if (urlPath.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (urlPath === '/index.html') return 'no-cache';
  return 'public, max-age=3600';
}

/** Resolves a URL path inside `root`, or null when it escapes it (path traversal) or is malformed. */
export function resolveInside(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const resolved = path.resolve(root, `.${path.posix.normalize(`/${decoded}`)}`);
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null;
}

export function createStaticSite(rootDir: string, siteUrl: string): StaticSite {
  const root = path.resolve(rootDir);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').split(SITE_URL_PLACEHOLDER).join(siteUrl);

  const sendFile = (req: http.IncomingMessage, res: http.ServerResponse, file: string, urlPath: string) => {
    const stat = fs.statSync(file);
    res.statusCode = 200;
    res.setHeader('Content-Type', CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    res.setHeader('Cache-Control', cacheControlFor(urlPath));
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  };

  const sendIndex = (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', CONTENT_TYPES['.html']);
    res.setHeader('Cache-Control', 'no-cache');
    res.end(req.method === 'HEAD' ? undefined : html);
  };

  return {
    indexHtml: () => html,
    serve(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return false;
      const urlPath = (req.url ?? '/').split('?')[0];
      const file = resolveInside(root, urlPath);
      if (!file) {
        res.statusCode = 400;
        res.end('Bad Request');
        return true;
      }
      if (urlPath === '/' || urlPath === '/index.html') {
        sendIndex(req, res);
        return true;
      }
      let isFile = false;
      try {
        isFile = fs.statSync(file).isFile();
      } catch {
        isFile = false;
      }
      if (isFile) {
        sendFile(req, res, file, urlPath);
        return true;
      }
      // A missing file with an extension (a stale hashed asset, a typo) is a real 404; a route-like path is the SPA.
      if (path.extname(urlPath) !== '' || urlPath.startsWith('/assets/')) {
        res.statusCode = 404;
        res.setHeader('Cache-Control', 'no-store');
        res.end('Not Found');
        return true;
      }
      sendIndex(req, res);
      return true;
    },
  };
}
