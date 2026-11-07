/**
 * Razorpay Affordability Widget ("No-cost EMI / pay in instalments from Rs X/month") loader.
 * Docs: https://razorpay.com/docs/payments/payment-gateway/affordability/widget/native-web/
 * The widget script is third-party and heavy, so it is never in the HTML or the first-load bundle: product and cart
 * pages call `renderAffordabilityWidget` after the page is loaded and the browser is idle (`whenPageIdle`). Everything
 * here degrades to "show nothing": no key, a tiny amount, a blocked script or a thrown error leave the page as it was.
 */
export const AFFORDABILITY_SCRIPT_URL = 'https://cdn.razorpay.com/widgets/affordability/affordability.js';
/** The widget renders into the element with this fixed id; only one instance fits on a page. */
export const AFFORDABILITY_CONTAINER_ID = 'razorpay-affordability-widget';
/** Below this (rupees) no EMI plan exists, so nothing is shown. */
export const EMI_MIN_RUPEES = 3000;

interface WidgetConfig { key: string; amount: number }
interface AffordabilitySuite { render: () => void }
type SuiteCtor = new (config: WidgetConfig) => AffordabilitySuite;

const suiteOnWindow = () => (window as unknown as { RazorpayAffordabilitySuite?: SuiteCtor }).RazorpayAffordabilitySuite;

/** The publishable key id from the build environment, or null when unset (the same key checkout uses). */
export function razorpayKeyId(env: Record<string, unknown> = import.meta.env): string | null {
  const key = env.VITE_RAZORPAY_KEY_ID;
  return typeof key === 'string' && key.trim() !== '' ? key.trim() : null;
}

/** Rupees to the paise the widget wants, or null when the widget should not show (no key or amount too small). */
export function affordabilityAmountPaise(rupees: number, keyId: string | null = razorpayKeyId()): number | null {
  if (!keyId || !Number.isFinite(rupees) || rupees < EMI_MIN_RUPEES) return null;
  return Math.round(rupees * 100);
}

let scriptPromise: Promise<SuiteCtor> | null = null;

/** Loads the widget script once; rejects when it is blocked or fails, and a later call may retry. */
export function loadAffordabilityScript(doc: Document = document): Promise<SuiteCtor> {
  const existing = suiteOnWindow();
  if (existing) return Promise.resolve(existing);
  if (!scriptPromise) {
    scriptPromise = new Promise<SuiteCtor>((resolve, reject) => {
      const script = doc.createElement('script');
      script.src = AFFORDABILITY_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        const ctor = suiteOnWindow();
        if (ctor) resolve(ctor);
        else { scriptPromise = null; reject(new Error('Affordability widget did not initialise')); }
      };
      script.onerror = () => { scriptPromise = null; script.remove(); reject(new Error('Affordability widget script failed to load')); };
      doc.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/** Runs `task` once the page has loaded and the browser is idle, so the widget never competes with first paint or LCP. */
export function whenPageIdle(task: () => void): () => void {
  let cancelled = false;
  let idleHandle: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => { if (!cancelled) task(); };
  const run = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === 'function') idleHandle = window.requestIdleCallback(fire, { timeout: 4000 });
    else timer = setTimeout(fire, 1500);
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener('load', run);
    if (idleHandle !== undefined) window.cancelIdleCallback?.(idleHandle);
    if (timer) clearTimeout(timer);
  };
}

/** Renders the widget into the container for `amountPaise`. Resolves false (never throws) when it could not. */
export async function renderAffordabilityWidget(keyId: string, amountPaise: number, container: HTMLElement): Promise<boolean> {
  try {
    const Suite = await loadAffordabilityScript();
    container.replaceChildren(); // an amount change re-renders into a clean container
    new Suite({ key: keyId, amount: amountPaise }).render();
    return true;
  } catch (err) {
    console.warn('[emi] affordability widget unavailable:', err);
    return false;
  }
}
