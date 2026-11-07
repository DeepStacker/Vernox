/**
 * Cold-load metrics for Home, Shop and a product page under a mid-range Android on Slow 4G (Lighthouse
 * mobile settings: 4x CPU, 150 ms RTT, 1.6 Mbps). Prints the median of RUNS loads per page: first paint,
 * LCP, time until the page's content is visible, JS and total bytes, requests, and Firestore / API calls.
 * Usage and the baseline it is compared with: ROADMAP.md "Performance and scale plan" and README.md.
 *
 *   node scripts/perf/measure.mjs [baseUrl]     (RUNS=5 for steadier medians; CHROMIUM_PATH=… to pick a browser)
 */
import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://127.0.0.1:4173';
const pages = [['home', '/', 'h1'], ['shop', '/shop', '[href^="/product/"]'], ['product', '/product/om-symbol-wall-art', 'h1']];
const runs = Number(process.env.RUNS || 3);
// CHROMIUM_PATH: use an already installed Chromium instead of the one `npx playwright install chromium` provides.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const out = {};
for (const [name, url, ready] of pages) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    let jsBytes = 0, totalBytes = 0, firestore = 0, api = 0, requests = 0;
    cdp.on('Network.loadingFinished', e => { totalBytes += e.encodedDataLength; });
    const types = new Map();
    cdp.on('Network.responseReceived', e => { types.set(e.requestId, e.type); });
    cdp.on('Network.loadingFinished', e => { if (types.get(e.requestId) === 'Script') jsBytes += e.encodedDataLength; });
    page.on('request', r => { requests++; const u = r.url(); if (u.includes(':8085') || u.includes('firestore.googleapis')) firestore++; if (u.includes('/api/')) api++; });
    await page.addInitScript(() => {
      window.__lcp = 0;
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const t0 = Date.now();
    await page.goto(base + url, { waitUntil: 'load', timeout: 120000 });
    await page.locator(ready).first().waitFor({ timeout: 120000 });
    const contentMs = Date.now() - t0;
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
      return { fcp: Math.round(fcp), lcp: Math.round(window.__lcp), domInteractive: Math.round(nav.domInteractive), load: Math.round(nav.loadEventEnd) };
    });
    samples.push({ ...m, contentMs, jsKB: Math.round(jsBytes / 1024), totalKB: Math.round(totalBytes / 1024), requests, firestore, api });
    await ctx.close();
  }
  const med = k => samples.map(s => s[k]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  out[name] = Object.fromEntries(Object.keys(samples[0]).map(k => [k, med(k)]));
}
console.table(out);
await browser.close();
