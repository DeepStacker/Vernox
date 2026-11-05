import type { SceneConfig } from './types';

/**
 * Curated room scenes. All numbers are calibrated by hand against the photos in public/images:
 * - `wall.corners` is the usable flat wall in image pixels (TL, TR, BR, BL); `widthCm`/`heightCm` are its real size,
 *   estimated from the room's furniture (sofa 210 cm, bed headboard ~150 cm, ceiling ~240 cm). Pixels per cm at the
 *   wall is therefore (corner distance / cm). These are good to roughly +/-10%; the UI says "approximate".
 * - `clearZone` hides the photo's own painting by filling it with the surrounding wall colour.
 * - `light.fromX/fromY` point from the wall towards the light (negative x = light on the left, negative y = above).
 * To add a scene: drop a photo in public/images, measure the four wall corners and one known object, and add an entry.
 */
export const SCENES: SceneConfig[] = [
  {
    id: 'living',
    label: 'Living room',
    image: '/images/hero-art-lounge.jpg',
    imageWidth: 1200,
    imageHeight: 896,
    wall: { corners: [{ x: 342, y: 88 }, { x: 960, y: 88 }, { x: 960, y: 642 }, { x: 342, y: 642 }], widthCm: 269, heightCm: 241 },
    clearZone: { x: 604, y: 228, w: 240, h: 282 },
    defaultCentreCm: { x: 164, y: 96 },
    light: { fromX: -0.7, fromY: -0.35, softness: 0.75, colour: '#fff3e0', ambient: '#e9dcc4', ambientStrength: 0.1 },
    furniture: { label: 'Sofa', widthCm: 210 },
  },
  {
    id: 'bedroom',
    label: 'Bedroom',
    image: '/images/space-bedroom.jpg',
    imageWidth: 1200,
    imageHeight: 896,
    wall: { corners: [{ x: 296, y: 100 }, { x: 1165, y: 100 }, { x: 1165, y: 662 }, { x: 296, y: 662 }], widthCm: 300, heightCm: 194 },
    clearZone: { x: 508, y: 212, w: 444, h: 214 },
    defaultCentreCm: { x: 150, y: 62 },
    light: { fromX: -0.8, fromY: -0.2, softness: 0.85, colour: '#fff6ea', ambient: '#efe2cd', ambientStrength: 0.1 },
    furniture: { label: 'Bed', widthCm: 160 },
  },
  {
    id: 'office',
    label: 'Office',
    image: '/images/office-decor.jpg',
    imageWidth: 1200,
    imageHeight: 896,
    wall: { corners: [{ x: 782, y: 100 }, { x: 1200, y: 100 }, { x: 1200, y: 655 }, { x: 782, y: 655 }], widthCm: 174, heightCm: 231 },
    clearZone: { x: 868, y: 184, w: 236, h: 316 },
    defaultCentreCm: { x: 90, y: 100 },
    light: { fromX: -0.9, fromY: -0.1, softness: 0.65, colour: '#f4f7ff', ambient: '#e8e4d8', ambientStrength: 0.08 },
  },
  {
    id: 'gallery',
    label: 'Gallery wall',
    image: '/images/maroon-collection.jpg',
    imageWidth: 1200,
    imageHeight: 896,
    wall: { corners: [{ x: 213, y: 97 }, { x: 1027, y: 97 }, { x: 1027, y: 665 }, { x: 213, y: 665 }], widthCm: 339, heightCm: 237 },
    clearZone: { x: 296, y: 220, w: 650, h: 392 },
    defaultCentreCm: { x: 169, y: 105 },
    light: { fromX: 0.0, fromY: -1, softness: 0.4, colour: '#ffe2b8', ambient: '#e6cfae', ambientStrength: 0.14 },
  },
];

export const getScene = (id: string): SceneConfig => SCENES.find(s => s.id === id) ?? SCENES[0];
