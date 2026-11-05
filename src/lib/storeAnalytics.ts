/**
 * Lightweight storefront visit tracker. Sessions are kept in this browser only (localStorage) for
 * the storefront's own use; the admin analytics screen does NOT read them (it reports real orders
 * only, see src/lib/orders/orderMetrics.ts).
 */

import { safeLocal } from './safeStorage';

export interface VisitorSession {
  id: string;
  timestamp: number;
  path: string;
  trafficSource: 'Direct' | 'Search' | 'Social' | 'Referrals' | 'Email';
  socialSource?: 'Facebook' | 'Instagram' | 'Twitter' | 'Pinterest' | 'Reddit';
  deviceType: 'Desktop' | 'Mobile' | 'Tablet';
  country: string;
  funnelStep: 'view' | 'cart' | 'checkout' | 'purchase';
  orderId?: string;
  orderTotal?: number;
  /** Named interaction (e.g. `wall_preview_opened`) recorded on a `view` step; funnel steps leave it unset. */
  event?: string;
  /** Small, non-personal parameters of `event` (ids, sizes, finishes). Never photos or free text. */
  eventData?: Record<string, string | number | boolean>;
}

const STORAGE_KEY = 'vernox-store-analytics-sessions';

/**
 * Record a live storefront visitor event
 */
export function trackStoreEvent(step: 'view' | 'cart' | 'checkout' | 'purchase', metadata: Partial<VisitorSession> = {}) {
  try {
    if (typeof window === 'undefined') return;

    // Detect device
    const width = window.innerWidth;
    const deviceType: 'Desktop' | 'Mobile' | 'Tablet' = 
      width < 768 ? 'Mobile' : width < 1024 ? 'Tablet' : 'Desktop';

    // Detect traffic source from referrer or UTM params
    const referrer = document.referrer.toLowerCase();
    const urlParams = new URLSearchParams(window.location.search);
    const utmSource = urlParams.get('utm_source')?.toLowerCase() || '';

    let trafficSource: VisitorSession['trafficSource'] = 'Direct';
    let socialSource: VisitorSession['socialSource'] | undefined = undefined;

    if (utmSource.includes('facebook') || referrer.includes('facebook.com') || referrer.includes('fb.com')) {
      trafficSource = 'Social';
      socialSource = 'Facebook';
    } else if (utmSource.includes('instagram') || referrer.includes('instagram.com')) {
      trafficSource = 'Social';
      socialSource = 'Instagram';
    } else if (utmSource.includes('twitter') || utmSource.includes('x.com') || referrer.includes('twitter.com') || referrer.includes('t.co')) {
      trafficSource = 'Social';
      socialSource = 'Twitter';
    } else if (utmSource.includes('pinterest') || referrer.includes('pinterest.com')) {
      trafficSource = 'Social';
      socialSource = 'Pinterest';
    } else if (utmSource.includes('reddit') || referrer.includes('reddit.com')) {
      trafficSource = 'Social';
      socialSource = 'Reddit';
    } else if (referrer.includes('google.') || referrer.includes('bing.') || referrer.includes('duckduckgo.')) {
      trafficSource = 'Search';
    } else if (referrer && !referrer.includes(window.location.hostname)) {
      trafficSource = 'Referrals';
    } else if (utmSource.includes('email') || utmSource.includes('newsletter')) {
      trafficSource = 'Email';
    }

    // Locale-inferred default country
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let country = 'USA';
    if (timeZone.includes('Calcutta') || timeZone.includes('Kolkata') || timeZone.includes('India')) country = 'India';
    else if (timeZone.includes('Brussels') || timeZone.includes('Europe/Brussels')) country = 'Belgium';
    else if (timeZone.includes('Toronto') || timeZone.includes('Vancouver') || timeZone.includes('Canada')) country = 'Canada';
    else if (timeZone.includes('Berlin') || timeZone.includes('Germany')) country = 'Germany';
    else if (timeZone.includes('Paris') || timeZone.includes('France')) country = 'France';
    else if (timeZone.includes('London') || timeZone.includes('Europe/London')) country = 'United Kingdom';

    const session: VisitorSession = {
      id: 'ses-' + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      path: window.location.pathname,
      trafficSource,
      socialSource,
      deviceType,
      country,
      funnelStep: step,
      ...metadata,
    };

    const list = safeLocal.getJson<VisitorSession[]>(STORAGE_KEY, []);
    list.push(session);
    // Keep last 1,000 live sessions in local cache
    if (list.length > 1000) list.splice(0, list.length - 1000);
    safeLocal.setJson(STORAGE_KEY, list);
  } catch (err) {
    console.debug('Analytics track error:', err);
  }
}
