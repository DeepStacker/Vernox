/**
 * Minimal DXF R12 (AC1009) writer for laser CAM: millimetre units, one closed POLYLINE per
 * contour, layers named in cut order. R12 is the most widely accepted DXF dialect (CypCut,
 * RDWorks, LightBurn, AutoCAD, LibreCAD, Inkscape); it needs no handles or OBJECTS section,
 * which is why we write it directly instead of pulling in a general-purpose DXF library
 * (see docs/adr/0001-studio-engine.md). Output is verified by parsing it back with
 * dxf-parser in the tests.
 */
import type { Pt } from '@/lib/studio/geometry/path';

export interface DxfPolyline {
  points: Pt[];
  closed: boolean;
}

export interface DxfLayer {
  name: string;
  /** AutoCAD colour index (1 red, 5 blue, 7 white/black). */
  color: number;
  polylines: DxfPolyline[];
}

const num = (n: number) => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(4).replace(/\.?0+$/, ''));

/**
 * Writes the layers in the given order (entities are emitted in that order, which most
 * CAM software uses as the default cut sequence). `heightMm` flips y into DXF's y-up frame.
 */
export function writeDxfR12(layers: DxfLayer[], widthMm: number, heightMm: number): string {
  const out: string[] = [];
  const pair = (code: number, value: string | number) => out.push(String(code), String(value));

  pair(0, 'SECTION'); pair(2, 'HEADER');
  pair(9, '$ACADVER'); pair(1, 'AC1009');
  pair(9, '$INSUNITS'); pair(70, 4); // millimetres
  pair(9, '$MEASUREMENT'); pair(70, 1); // metric
  pair(9, '$EXTMIN'); pair(10, 0); pair(20, 0); pair(30, 0);
  pair(9, '$EXTMAX'); pair(10, num(widthMm)); pair(20, num(heightMm)); pair(30, 0);
  pair(0, 'ENDSEC');

  pair(0, 'SECTION'); pair(2, 'TABLES');
  pair(0, 'TABLE'); pair(2, 'LTYPE'); pair(70, 1);
  pair(0, 'LTYPE'); pair(2, 'CONTINUOUS'); pair(70, 0); pair(3, 'Solid line'); pair(72, 65); pair(73, 0); pair(40, 0);
  pair(0, 'ENDTAB');
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, layers.length + 1);
  pair(0, 'LAYER'); pair(2, '0'); pair(70, 0); pair(62, 7); pair(6, 'CONTINUOUS');
  for (const l of layers) {
    pair(0, 'LAYER'); pair(2, l.name); pair(70, 0); pair(62, l.color); pair(6, 'CONTINUOUS');
  }
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');

  pair(0, 'SECTION'); pair(2, 'ENTITIES');
  for (const l of layers) {
    for (const pl of l.polylines) {
      if (pl.points.length < 2) continue;
      pair(0, 'POLYLINE'); pair(8, l.name); pair(66, 1); pair(10, 0); pair(20, 0); pair(30, 0); pair(70, pl.closed ? 1 : 0);
      for (const p of pl.points) {
        pair(0, 'VERTEX'); pair(8, l.name); pair(10, num(p.x)); pair(20, num(heightMm - p.y)); pair(30, 0);
      }
      pair(0, 'SEQEND'); pair(8, l.name);
    }
  }
  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return out.join('\n') + '\n';
}
