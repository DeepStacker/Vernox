/** Type declarations for the untyped studio dependencies (only the surface we use). */

declare module 'harfbuzzjs/hb.js' {
  const createHarfBuzz: (module?: { wasmBinary?: ArrayBuffer | Uint8Array }) => Promise<unknown>;
  export default createHarfBuzz;
}

declare module 'harfbuzzjs/hbjs.js' {
  export interface HbBlob { destroy(): void }
  export interface HbFace { upem: number; destroy(): void }
  export interface HbFont {
    glyphToPath(glyphId: number): string;
    setScale(x: number, y: number): void;
    destroy(): void;
  }
  export interface HbGlyph { g: number; cl: number; ax: number; ay: number; dx: number; dy: number }
  export interface HbBuffer {
    addText(text: string): void;
    guessSegmentProperties(): void;
    json(): HbGlyph[];
    destroy(): void;
  }
  export interface HarfBuzz {
    createBlob(data: ArrayBuffer): HbBlob;
    createFace(blob: HbBlob, index: number): HbFace;
    createFont(face: HbFace): HbFont;
    createBuffer(): HbBuffer;
    shape(font: HbFont, buffer: HbBuffer, features?: string): void;
  }
  const hbjs: (module: unknown) => HarfBuzz;
  export default hbjs;
}

declare module 'imagetracerjs' {
  export interface TraceSegment { type: 'L' | 'Q'; x1: number; y1: number; x2: number; y2: number; x3?: number; y3?: number }
  export interface TracePath { segments: TraceSegment[]; isholepath: boolean; boundingbox: number[]; holechildren: number[] }
  export interface TraceData { layers: TracePath[][]; palette: { r: number; g: number; b: number; a: number }[]; width: number; height: number }
  export interface ImageDataLike { width: number; height: number; data: Uint8ClampedArray }
  const ImageTracer: {
    imagedataToTracedata(img: ImageDataLike, options?: Record<string, unknown>): TraceData;
  };
  export default ImageTracer;
}
