/**
 * Serves a production build the way the CDN does (gzip, SPA fallback, immutable /assets) and proxies /api
 * to the Node API server (server/index.ts), so scripts/perf/measure.mjs measures realistic loads locally.
 *
 *   node scripts/perf/serve.mjs <dist dir> [port=4173] [api=http://127.0.0.1:3001]
 */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const [distArg, port = '4173', api = 'http://127.0.0.1:3001'] = process.argv.slice(2);
if (!distArg) throw new Error('Usage: node scripts/perf/serve.mjs <dist dir> [port] [api origin]');
const dist = path.resolve(distArg);
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.xml': 'application/xml' };
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const u = new URL(req.url, api);
    const p = http.request(u, { method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    req.pipe(p); p.on('error', () => { res.writeHead(502); res.end(); });
    return;
  }
  let file = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  const ext = path.extname(file); const body = fs.readFileSync(file);
  const headers = { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' };
  if (/\.(js|css|html|svg|json|xml|wasm)$/.test(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) { headers['Content-Encoding'] = 'gzip'; res.writeHead(200, headers); res.end(zlib.gzipSync(body)); }
  else { res.writeHead(200, headers); res.end(body); }
}).listen(Number(port), '127.0.0.1', () => console.log(`serving ${dist} on ${port}`));
