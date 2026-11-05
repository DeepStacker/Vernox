import { createElement, useEffect, useRef, useState } from 'react';
import { Box } from 'lucide-react';
import type { Outline } from '@/lib/wallPreview/types';
import type { ArMode } from './arSupport';

interface Props {
  cacheKey: string;
  outline: Outline;
  finish: string;
  round: boolean;
  alt: string;
  needsUsdz: boolean;
  mode: ArMode | null;
  onArPlace: () => void;
}

/**
 * Loaded only after the customer taps the AR button: pulls in three.js (to build the GLB/USDZ) and Google's
 * <model-viewer> on demand, so none of it touches the product page's initial download.
 */
export default function ArViewer({ cacheKey, outline, finish, round, alt, needsUsdz, mode, onArPlace }: Props) {
  const [urls, setUrls] = useState<{ glb: string; usdz?: string } | null>(null);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrls(null);
    setError(false);
    (async () => {
      try {
        const [{ getModels }] = await Promise.all([import('@/lib/wallPreview/model3d'), import('@google/model-viewer/dist/model-viewer.min.js')]);
        const models = await getModels(cacheKey, { outline, finish, round }, needsUsdz);
        if (!cancelled) setUrls({ glb: models.glbUrl, usdz: models.usdzUrl });
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, outline, finish, round, needsUsdz]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !urls) return;
    const onStatus = (e: Event) => {
      if ((e as CustomEvent<{ status: string }>).detail?.status === 'session-started') onArPlace();
    };
    el.addEventListener('ar-status', onStatus);
    return () => el.removeEventListener('ar-status', onStatus);
  }, [urls, onArPlace]);

  if (error) return <p role="alert" className="text-sm text-destructive">The 3D model could not be built on this device.</p>;
  if (!urls) {
    return (
      <div role="status" className="grid aspect-[4/3] w-full animate-pulse place-items-center rounded-xl bg-secondary text-sm text-muted-foreground motion-reduce:animate-none">
        Building your piece in 3D
      </div>
    );
  }

  return createElement(
    'model-viewer',
    {
      ref,
      src: urls.glb,
      'ios-src': urls.usdz,
      alt,
      ar: '',
      'ar-modes': mode === 'quick-look' ? 'quick-look' : 'webxr scene-viewer quick-look',
      'ar-placement': 'wall',
      'ar-scale': 'fixed',
      'camera-controls': '',
      'shadow-intensity': '1',
      'environment-image': 'neutral',
      'touch-action': 'pan-y',
      style: { width: '100%', height: '340px', borderRadius: '0.75rem', background: 'hsl(var(--secondary))' },
    },
    createElement(
      'button',
      { slot: 'ar-button', type: 'button', className: 'absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-burgundy px-5 text-sm font-medium text-cream shadow-lg' },
      createElement(Box, { className: 'h-4 w-4', 'aria-hidden': true }),
      'Place on your wall',
    ),
  );
}
