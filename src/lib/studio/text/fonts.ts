/**
 * Cutting fonts. Files are self-hosted under public/fonts/studio (SIL Open Font License
 * 1.1, licence texts alongside) and fetched only when a text first uses them. Add a font
 * by dropping the file there and adding an entry here — nothing else changes.
 */
export type FontScript = 'latin' | 'devanagari';
export type FontStyle = 'sans' | 'serif' | 'display' | 'script' | 'stencil';

export interface StudioFont {
  id: string;
  name: string;
  file: string;
  scripts: readonly FontScript[];
  style: FontStyle;
  /** Connected script: weld letters by default so they cut as one piece. */
  weld?: boolean;
  /** Stencil face: counters already bridged by design. */
  stencil?: boolean;
  /** CSS stack for thumbnails/pickers, where the real font is not loaded. */
  previewFamily: string;
}

const base = '/fonts/studio/';

export const STUDIO_FONTS: readonly StudioFont[] = [
  { id: 'poppins-semibold', name: 'Poppins', file: `${base}Poppins-SemiBold.ttf`, scripts: ['latin', 'devanagari'], style: 'sans', previewFamily: 'system-ui, sans-serif' },
  { id: 'bebas-neue', name: 'Bebas Neue', file: `${base}BebasNeue-Regular.ttf`, scripts: ['latin'], style: 'display', previewFamily: 'Impact, sans-serif' },
  { id: 'abril-fatface', name: 'Abril Fatface', file: `${base}AbrilFatface-Regular.ttf`, scripts: ['latin'], style: 'serif', previewFamily: 'Georgia, serif' },
  { id: 'pacifico', name: 'Pacifico', file: `${base}Pacifico-Regular.ttf`, scripts: ['latin'], style: 'script', weld: true, previewFamily: 'cursive' },
  { id: 'great-vibes', name: 'Great Vibes', file: `${base}GreatVibes-Regular.ttf`, scripts: ['latin'], style: 'script', weld: true, previewFamily: 'cursive' },
  { id: 'allerta-stencil', name: 'Allerta Stencil', file: `${base}AllertaStencil-Regular.ttf`, scripts: ['latin'], style: 'stencil', stencil: true, previewFamily: 'system-ui, sans-serif' },
  { id: 'yatra-one', name: 'Yatra One', file: `${base}YatraOne-Regular.ttf`, scripts: ['latin', 'devanagari'], style: 'display', previewFamily: 'serif' },
  { id: 'rozha-one', name: 'Rozha One', file: `${base}RozhaOne-Regular.ttf`, scripts: ['latin', 'devanagari'], style: 'serif', previewFamily: 'Georgia, serif' },
];

export const DEFAULT_FONT_ID = 'poppins-semibold';

export function fontById(id: string): StudioFont {
  return STUDIO_FONTS.find(f => f.id === id) ?? STUDIO_FONTS[0];
}

const DEVANAGARI = /\p{Script=Devanagari}/u;

export function detectScript(text: string): FontScript {
  return DEVANAGARI.test(text) ? 'devanagari' : 'latin';
}

/** Fonts able to render `text`; a Devanagari string never gets a Latin-only font. */
export function fontsForText(text: string): StudioFont[] {
  const script = detectScript(text);
  return STUDIO_FONTS.filter(f => f.scripts.includes(script));
}
