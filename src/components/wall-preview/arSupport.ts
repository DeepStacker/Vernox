export type ArMode = 'webxr' | 'scene-viewer' | 'quick-look';

/**
 * Which AR route this device offers, or null for none (desktop, or a phone without ARCore/ARKit).
 * Quick Look is iOS Safari; Android Chrome opens Scene Viewer, or WebXR when the browser exposes it.
 */
export async function detectArMode(): Promise<ArMode | null> {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return null;
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (isIos) return document.createElement('a').relList?.supports?.('ar') ? 'quick-look' : null;
  if (/Android/.test(ua)) {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
    try {
      if (xr && (await xr.isSessionSupported('immersive-ar'))) return 'webxr';
    } catch {
      // WebXR probing can throw in locked-down webviews; Scene Viewer is the fallback.
    }
    return /Chrome\//.test(ua) ? 'scene-viewer' : null;
  }
  return null;
}

export const isMobileDevice = () =>
  typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1));
