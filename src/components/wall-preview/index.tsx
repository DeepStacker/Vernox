import { Suspense, lazy } from 'react';
import type { WallPreviewProps } from './WallPreviewImpl';

export type { WallPreviewProps } from './WallPreviewImpl';

// The preview (canvas renderer, scenes, calibration UI) is fetched only when it is first rendered.
const WallPreviewImpl = lazy(() => import('./WallPreviewImpl'));

/**
 * "View on your wall". Pass a catalogue product + size (PDP) or a raw outline in mm (design studio).
 * Heavy dependencies (three.js, model-viewer) load later still, only when the customer opens 3D / AR.
 */
export function WallPreview(props: WallPreviewProps) {
  return (
    <Suspense fallback={<div role="status" aria-label="Loading wall preview" className="aspect-[1200/896] w-full animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />}>
      <WallPreviewImpl {...props} />
    </Suspense>
  );
}
