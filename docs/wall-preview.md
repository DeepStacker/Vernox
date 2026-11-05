# Wall preview ("View on your wall")

Code: `src/components/wall-preview/**` (UI and canvas rendering), `src/lib/wallPreview/**` (pure logic, tests in `__tests__`).

## Usage

```tsx
import { WallPreview } from '@/components/wall-preview';

// Product page
<WallPreview product={product} size={selectedSize} finish={finish}
  onChooseSize={setSelectedSize} onFinishChange={setFinish} />

// Design studio (outline path in millimetres, origin top-left of its bounding box)
<WallPreview outline={{ svgPath, widthMm, heightMm }} finish={finish} finishes={['brass', 'copper']} source="studio" />
```

`WallPreview` is a thin `React.lazy` wrapper: the preview code is fetched when it is first rendered. three.js,
`@google/model-viewer` and the GLB/USDZ exporters sit behind a second dynamic import and download only after the
customer taps "View in 3D" / "View in your room (AR)".

## Modes

- **Rooms**: photos from `public/images` described in `src/lib/wallPreview/scenes.ts`. Each scene has the wall plane
  (four image-pixel corners plus real width/height in cm, which gives the homography and therefore pixels per cm), a
  `clearZone` that hides the photo's own painting, and a light (direction, softness, colour, ambient tint). To add a scene,
  add a photo, measure the wall corners and one known object, and add an entry.
- **Your wall**: customer photo (camera or upload), processed in the browser only, downscaled to 1600 px. Scale comes from
  two marked points on a known length, the wall width, or four corners of a known rectangle (angled photos). Light is
  estimated from the photo. "Save" and "Share" render the full-resolution image with a small watermark.
- **3D & AR**: GLB (and USDZ on iOS) generated on demand from the outline: extruded sheet, 2 mm, on four 25 mm standoffs,
  PBR metal per finish. `ar-placement="wall" ar-scale="fixed"`. Desktop shows a QR code to the product, size and finish.
  The product page should read `?size=<size label>&finish=<id>` for that link to preselect them.

## Analytics

Events go through `trackStoreEvent('view', { event, eventData })` (`src/lib/storeAnalytics.ts`, optional `event` and
`eventData` fields) via `trackWallPreview` in `src/lib/wallPreview/analytics.ts`. No photos and no personal data.
Events: `wall_preview_opened`, `room_scene_changed`, `own_photo_used`, `size_changed_in_preview`, `ar_launched`,
`ar_unsupported`, `preview_saved`, `preview_shared`, `fit_recommendation_used`.

## Accuracy

Scene calibration is estimated from furniture and good to about +/-10%; the UI says "approximately". Pieces are drawn flat
with a rendered finish, not photographed metal.
