/**
 * Text → true outline paths with HarfBuzz (harfbuzzjs, WebAssembly). HarfBuzz performs
 * full OpenType shaping — kerning and ligatures for Latin, conjuncts, matra reordering and
 * mark positioning for Devanagari — which a plain glyph-by-glyph outliner cannot do.
 *
 * The ~180 kB (gzip) WASM module and each font file load on first use only. Results are
 * cached by (font, text, size, spacing, line height, alignment).
 */
import svgpath from 'svgpath';
import type { HarfBuzz, HbFont } from 'harfbuzzjs/hbjs.js';
import wasmUrl from 'harfbuzzjs/hb.wasm?url';
import { centrePathData, pathBounds } from '../geometry/path';
import type { TextObject } from '../schema';
import { detectScript, fontById } from './fonts';

export interface TextEngineLoaders {
  loadWasm: () => Promise<ArrayBuffer>;
  loadFont: (url: string) => Promise<ArrayBuffer>;
}

const fetchBuffer = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.arrayBuffer();
};

let loaders: TextEngineLoaders = { loadWasm: () => fetchBuffer(wasmUrl), loadFont: fetchBuffer };
let hbPromise: Promise<HarfBuzz> | null = null;

interface LoadedFont {
  font: HbFont;
  upem: number;
  /** Cap height (Latin "H") and headline-to-baseline height (Devanagari "क") in font units. */
  capHeight: { latin: number; devanagari: number };
}
const fonts = new Map<string, Promise<LoadedFont>>();

/** Overrides how the WASM module and font files are fetched (Node tests, headless use). */
export function configureTextEngine(next: Partial<TextEngineLoaders>) {
  loaders = { ...loaders, ...next };
  hbPromise = null;
  fonts.clear();
  cache.clear();
}

async function harfbuzz(): Promise<HarfBuzz> {
  hbPromise ??= (async () => {
    const [{ default: createHarfBuzz }, { default: hbjs }, wasmBinary] = await Promise.all([
      import('harfbuzzjs/hb.js'),
      import('harfbuzzjs/hbjs.js'),
      loaders.loadWasm(),
    ]);
    return hbjs(await createHarfBuzz({ wasmBinary }));
  })();
  try {
    return await hbPromise;
  } catch (err) {
    hbPromise = null; // allow a retry after a network failure
    throw err;
  }
}

function shapeRun(hb: HarfBuzz, font: HbFont, text: string) {
  const buffer = hb.createBuffer();
  try {
    buffer.addText(text);
    buffer.guessSegmentProperties();
    hb.shape(font, buffer);
    return buffer.json();
  } finally {
    buffer.destroy();
  }
}

function measureHeight(hb: HarfBuzz, font: HbFont, probe: string, fallback: number): number {
  const [glyph] = shapeRun(hb, font, probe);
  if (!glyph || glyph.g === 0) return fallback;
  const b = pathBounds(font.glyphToPath(glyph.g));
  return b ? Math.max(1, b.maxY - Math.max(0, b.minY)) : fallback;
}

export function loadFont(fontId: string): Promise<LoadedFont> {
  const meta = fontById(fontId);
  let entry = fonts.get(meta.id);
  if (!entry) {
    entry = (async () => {
      const [hb, data] = await Promise.all([harfbuzz(), loaders.loadFont(meta.file)]);
      const blob = hb.createBlob(data);
      const face = hb.createFace(blob, 0);
      const font = hb.createFont(face);
      const upem = face.upem;
      const latin = measureHeight(hb, font, 'H', upem * 0.7);
      return { font, upem, capHeight: { latin, devanagari: measureHeight(hb, font, 'क', latin) } };
    })();
    entry.catch(() => fonts.delete(meta.id));
    fonts.set(meta.id, entry);
  }
  return entry;
}

export type ShapeInput = Pick<TextObject, 'text' | 'fontId' | 'sizeMm' | 'letterSpacingMm' | 'lineHeight' | 'align'>;

export interface ShapedText {
  /** Outline in mm, centred on (0,0). Empty string for empty text. */
  d: string;
  widthMm: number;
  heightMm: number;
}

const cache = new Map<string, ShapedText>();
const CACHE_LIMIT = 300;

/** Shapes `text` into an outline whose letter height (cap height) is `sizeMm`. */
export async function shapeText(input: ShapeInput): Promise<ShapedText> {
  const key = JSON.stringify([input.fontId, input.text, input.sizeMm, input.letterSpacingMm, input.lineHeight, input.align]);
  const hit = cache.get(key);
  if (hit) return hit;

  const [hb, loaded] = await Promise.all([harfbuzz(), loadFont(input.fontId)]);
  const script = detectScript(input.text);
  const s = input.sizeMm / loaded.capHeight[script];
  const lineAdvance = loaded.upem * s * input.lineHeight;
  const lines = input.text.split(/\r?\n/);

  const shapedLines = lines.map(line => {
    const glyphs = line ? shapeRun(hb, loaded.font, line) : [];
    let pen = 0;
    const parts: string[] = [];
    glyphs.forEach((gl, i) => {
      const outline = loaded.font.glyphToPath(gl.g);
      if (outline) {
        // Font units are y-up; flip into the studio's y-down millimetre frame.
        parts.push(svgpath(outline).matrix([s, 0, 0, -s, (pen + gl.dx) * s, -gl.dy * s]).toString());
      }
      pen += gl.ax;
      if (gl.ax > 0 && i < glyphs.length - 1) pen += input.letterSpacingMm / s;
    });
    return { d: parts.join(''), width: pen * s };
  });

  const maxWidth = Math.max(0, ...shapedLines.map(l => l.width));
  const parts = shapedLines.map((l, i) => {
    if (!l.d) return '';
    const dx = input.align === 'left' ? 0 : input.align === 'right' ? maxWidth - l.width : (maxWidth - l.width) / 2;
    return svgpath(l.d).translate(dx, i * lineAdvance).toString();
  });
  const joined = parts.join('');
  const centred = joined ? centrePathData(joined) : { d: '', width: 0, height: 0 };
  const result = { d: centred.d, widthMm: centred.width, heightMm: centred.height };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}
