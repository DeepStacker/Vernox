/** Node loaders for the text engine: read the WASM module and fonts from disk. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { configureTextEngine } from '../text/shaper';

const root = path.resolve(__dirname, '../../../..');
const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

export function useDiskFonts() {
  configureTextEngine({
    loadWasm: async () => toArrayBuffer(await readFile(path.join(root, 'node_modules/harfbuzzjs/hb.wasm'))),
    loadFont: async url => toArrayBuffer(await readFile(path.join(root, 'public', url))),
  });
}
