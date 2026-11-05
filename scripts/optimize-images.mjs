/**
 * Generates .webp siblings (and downsized .jpg fallbacks) for public/images.
 *
 * Usage: npm run optimize-images
 * - Never upscales; images wider than MAX_WIDTH are resized down.
 * - Writes <name>.webp next to each source and rewrites the .jpg in place only
 *   when the recompressed file is smaller. Safe to re-run (idempotent).
 * - Keeps the original file name for every .jpg so existing references keep working.
 */
import { readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const IMAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../public/images");
const MAX_WIDTH = 1920;
const JPG_QUALITY = 78;
const WEBP_QUALITY = 74;

const files = (await readdir(IMAGE_DIR)).filter((f) => [".jpg", ".jpeg"].includes(extname(f).toLowerCase()));
let before = 0;
let after = 0;

for (const file of files) {
  const src = join(IMAGE_DIR, file);
  const original = (await stat(src)).size;
  const base = file.slice(0, file.length - extname(file).length);

  const pipeline = () => sharp(src).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true });

  const webp = await pipeline().webp({ quality: WEBP_QUALITY }).toBuffer();
  await writeFile(join(IMAGE_DIR, `${base}.webp`), webp);

  const jpg = await pipeline().jpeg({ quality: JPG_QUALITY, mozjpeg: true }).toBuffer();
  const keepJpg = jpg.length < original ? jpg : null;
  if (keepJpg) await writeFile(src, keepJpg);

  before += original;
  after += webp.length;
  console.log(`${file}: ${(original / 1024).toFixed(0)} KB -> jpg ${((keepJpg ?? { length: original }).length / 1024).toFixed(0)} KB, webp ${(webp.length / 1024).toFixed(0)} KB`);
}

console.log(`Total: ${(before / 1048576).toFixed(1)} MB originals -> ${(after / 1048576).toFixed(1)} MB webp`);
