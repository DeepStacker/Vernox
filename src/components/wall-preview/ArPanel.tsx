import { Suspense, lazy, useEffect, useState } from 'react';
import { Box, Smartphone } from 'lucide-react';
import { trackWallPreview, type EventData } from '@/lib/wallPreview/analytics';
import type { Outline } from '@/lib/wallPreview/types';
import { detectArMode, isMobileDevice, type ArMode } from './arSupport';
import { QrCode } from './QrCode';

// three.js and <model-viewer> live behind this import and are fetched only when the customer asks for AR / 3D.
const ArViewer = lazy(() => import('./ArViewer'));

interface Props {
  outline: Outline;
  finish: string;
  round: boolean;
  /** Stable id of the piece+size+finish combination, used to cache the generated model. */
  cacheKey: string;
  alt: string;
  /** Link that reopens this product, size and finish on a phone. Absent for ad-hoc studio designs. */
  shareUrl?: string;
  eventData: EventData;
}

export function ArPanel({ outline, finish, round, cacheKey, alt, shareUrl, eventData }: Props) {
  const [mode, setMode] = useState<ArMode | null>(null);
  const [probed, setProbed] = useState(false);
  const [started, setStarted] = useState(false);
  const mobile = isMobileDevice();

  useEffect(() => {
    let live = true;
    detectArMode().then(m => {
      if (!live) return;
      setMode(m);
      setProbed(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!probed) return;
    if (mobile && !mode) trackWallPreview('ar_unsupported', eventData);
    else if (!mobile && shareUrl) trackWallPreview('ar_launched', { ...eventData, mode: 'qr' });
    // Fires once per panel open, after support is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probed]);

  return (
    <div className="space-y-4">
      {started ? (
        <Suspense fallback={<div role="status" className="aspect-[4/3] w-full animate-pulse rounded-xl bg-secondary motion-reduce:animate-none"><span className="sr-only">Loading 3D viewer</span></div>}>
          <ArViewer
            cacheKey={cacheKey}
            outline={outline}
            finish={finish}
            round={round}
            alt={alt}
            needsUsdz={mode === 'quick-look'}
            mode={mode}
            onArPlace={() => trackWallPreview('ar_launched', { ...eventData, mode: mode ?? 'webxr' })}
          />
        </Suspense>
      ) : (
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center">
          <Box className="h-8 w-8 text-gold" aria-hidden />
          <button type="button" onClick={() => setStarted(true)} className="min-h-11 rounded-full bg-burgundy px-6 text-sm font-medium text-cream">
            {mobile && mode ? 'View in your room (AR)' : 'View in 3D'}
          </button>
          {mobile && probed && !mode && (
            <p className="max-w-xs text-sm text-muted-foreground">AR is not available in this browser. Try Safari on iPhone or Chrome on Android. The 3D view still works.</p>
          )}
        </div>
      )}

      {!mobile && shareUrl && (
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
          <QrCode value={shareUrl} label="QR code that opens this piece on your phone" />
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Scan with your phone to place it on your wall at true size.
          </p>
        </div>
      )}
    </div>
  );
}
