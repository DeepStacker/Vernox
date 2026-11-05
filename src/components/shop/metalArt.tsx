import type { ReactNode } from 'react';

/**
 * Lightweight SVG motifs for the storefront placeholder renderer (ShapeThumb). Until real product
 * photography exists, each design is drawn as a laser-cut plate: `solid` is the metal that remains,
 * `cut` is what the laser removes (the wall shows through). Both are drawn in a w x h box.
 * Motifs are chosen from the product name so new catalogue entries get a sensible picture without
 * any per-product configuration; unknown names fall back to a rosette cut into the catalogue shape.
 */
export type MotifId =
  | 'om' | 'ganesha' | 'tree' | 'mandala' | 'sun' | 'peacock' | 'diya' | 'honeycomb' | 'nameplate' | 'rosette' | 'plain';

export interface MotifArt {
  solid: ReactNode;
  cut: ReactNode;
}

const RULES: [RegExp, MotifId][] = [
  [/\bom\b|\bॐ\b/i, 'om'],
  [/ganesh/i, 'ganesha'],
  [/tree/i, 'tree'],
  [/mandala|lotus/i, 'mandala'],
  [/sun|radiance|starburst/i, 'sun'],
  [/peacock/i, 'peacock'],
  [/diya|diwali/i, 'diya'],
  [/hexagon|honeycomb/i, 'honeycomb'],
  [/name ?plate|family|house number/i, 'nameplate'],
];

export function motifForName(name?: string): MotifId {
  if (!name) return 'plain';
  return RULES.find(([re]) => re.test(name))?.[1] ?? 'rosette';
}

const point = (cx: number, cy: number, r: number, angle: number) => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const deg = (d: number) => (d * Math.PI) / 180;

const petals = (cx: number, cy: number, count: number, from: number, length: number, width: number, key: string) =>
  range(count).map(i => {
    const a = (360 / count) * i;
    return <ellipse key={`${key}${i}`} cx={cx} cy={cy - from} rx={width} ry={length} transform={`rotate(${a} ${cx} ${cy})`} />;
  });

const hexPoints = (cx: number, cy: number, r: number) =>
  range(6).map(i => point(cx, cy, r, deg(60 * i - 30)).join(',')).join(' ');

export function buildMotif(id: MotifId, w: number, h: number, basePath: string): MotifArt {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 8;
  const line = { fill: 'none', stroke: '#000', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (id) {
    case 'om':
      return {
        solid: <circle cx={cx} cy={cy} r={r} />,
        cut: (
          <>
            <circle cx={cx} cy={cy} r={r - 9} {...line} strokeWidth={2.2} />
            <text x={cx} y={cy + r * 0.34} textAnchor="middle" fontSize={r * 0.95} fontFamily="'Noto Sans Devanagari','Kohinoor Devanagari','Devanagari Sangam MN',serif" fontWeight={600} fill="#000">ॐ</text>
          </>
        ),
      };
    case 'mandala':
      return {
        solid: <circle cx={cx} cy={cy} r={r} />,
        cut: (
          <g fill="#000">
            {petals(cx, cy, 12, r * 0.66, r * 0.2, r * 0.075, 'o')}
            {petals(cx, cy, 8, r * 0.38, r * 0.17, r * 0.1, 'm')}
            <circle cx={cx} cy={cy} r={r * 0.1} />
            <circle cx={cx} cy={cy} r={r * 0.9} {...line} strokeWidth={2} />
          </g>
        ),
      };
    case 'tree': {
      const w2 = { ...line, stroke: '#fff' };
      const leaves = [[0.5, -0.62], [0.2, -0.78], [-0.2, -0.78], [-0.5, -0.62], [0.72, -0.3], [-0.72, -0.3], [0.62, 0.1], [-0.62, 0.1], [0, -0.9]];
      return {
        solid: (
          <>
            <circle cx={cx} cy={cy} r={r - 3} {...w2} strokeWidth={6} />
            <path d={`M${cx},${cy + r * 0.8} V${cy - r * 0.1} M${cx},${cy + r * 0.1} Q${cx + r * 0.2},${cy - r * 0.1} ${cx + r * 0.5},${cy - r * 0.45} M${cx},${cy + r * 0.1} Q${cx - r * 0.2},${cy - r * 0.1} ${cx - r * 0.5},${cy - r * 0.45} M${cx},${cy - r * 0.1} V${cy - r * 0.8} M${cx},${cy + r * 0.4} Q${cx + r * 0.3},${cy + r * 0.2} ${cx + r * 0.6},${cy + r * 0.05} M${cx},${cy + r * 0.4} Q${cx - r * 0.3},${cy + r * 0.2} ${cx - r * 0.6},${cy + r * 0.05}`} {...w2} strokeWidth={4} />
            <path d={`M${cx},${cy + r * 0.8} q${-r * 0.25},${r * 0.1} ${-r * 0.45},${r * 0.05} M${cx},${cy + r * 0.8} q${r * 0.25},${r * 0.1} ${r * 0.45},${r * 0.05}`} {...w2} strokeWidth={4} />
            {leaves.map(([lx, ly], i) => <circle key={i} cx={cx + lx * r} cy={cy + ly * r} r={r * 0.09} fill="#fff" />)}
          </>
        ),
        cut: null,
      };
    }
    case 'sun': {
      const pts = range(32).map(i => point(cx, cy, i % 2 ? r * 0.72 : r, deg(11.25 * i - 90)).join(',')).join(' ');
      return {
        solid: <polygon points={pts} />,
        cut: (
          <>
            <circle cx={cx} cy={cy} r={r * 0.5} {...line} strokeWidth={2.2} />
            <circle cx={cx} cy={cy} r={r * 0.3} fill="#000" />
          </>
        ),
      };
    }
    case 'peacock': {
      const base = cy + r * 0.78;
      return {
        solid: (
          <>
            {range(9).map(i => {
              const a = -80 + i * 20;
              return <ellipse key={i} cx={cx} cy={base - r * 0.68} rx={r * 0.17} ry={r * 0.5} transform={`rotate(${a} ${cx} ${base})`} />;
            })}
            <ellipse cx={cx} cy={base - r * 0.12} rx={r * 0.18} ry={r * 0.26} />
            <circle cx={cx} cy={base - r * 0.42} r={r * 0.11} />
          </>
        ),
        cut: (
          <>
            {range(9).map(i => {
              const a = -80 + i * 20;
              return <ellipse key={i} cx={cx} cy={base - r * 0.98} rx={r * 0.07} ry={r * 0.12} transform={`rotate(${a} ${cx} ${base})`} />;
            })}
            <circle cx={cx + r * 0.045} cy={base - r * 0.43} r={r * 0.03} />
          </>
        ),
      };
    }
    case 'diya':
      return {
        solid: (
          <>
            <path d={`M${cx - r * 0.78},${cy + r * 0.05} H${cx + r * 0.78} Q${cx + r * 0.6},${cy + r * 0.62} ${cx},${cy + r * 0.62} Q${cx - r * 0.6},${cy + r * 0.62} ${cx - r * 0.78},${cy + r * 0.05} Z`} />
            <path d={`M${cx},${cy - r * 0.78} Q${cx + r * 0.3},${cy - r * 0.35} ${cx},${cy - r * 0.1} Q${cx - r * 0.3},${cy - r * 0.35} ${cx},${cy - r * 0.78} Z`} />
            <rect x={cx - r * 0.3} y={cy + r * 0.62} width={r * 0.6} height={r * 0.1} rx={4} />
          </>
        ),
        cut: <path d={`M${cx - r * 0.58},${cy + r * 0.2} Q${cx},${cy + r * 0.5} ${cx + r * 0.58},${cy + r * 0.2}`} {...line} strokeWidth={3} />,
      };
    case 'honeycomb':
      return {
        solid: <polygon points={hexPoints(cx, cy, r)} />,
        cut: (
          <g {...line} strokeWidth={2.4}>
            <polygon points={hexPoints(cx, cy, r * 0.28)} />
            {range(6).map(i => {
              const [px, py] = point(cx, cy, r * 0.5, deg(60 * i));
              return <polygon key={i} points={hexPoints(px, py, r * 0.28)} />;
            })}
          </g>
        ),
      };
    case 'nameplate':
      return {
        solid: <rect x={6} y={cy - r * 0.55} width={w - 12} height={r * 1.1} rx={r * 0.12} />,
        cut: (
          <>
            <rect x={14} y={cy - r * 0.47} width={w - 28} height={r * 0.94} rx={r * 0.07} {...line} strokeWidth={1.8} />
            <text x={cx} y={cy + r * 0.14} textAnchor="middle" fontSize={r * 0.3} textLength={w * 0.6} lengthAdjust="spacingAndGlyphs" fontFamily="'Cormorant Garamond',Georgia,serif" fontWeight={700} fill="#000">The Sharmas</text>
          </>
        ),
      };
    case 'ganesha':
      return {
        solid: <path d={`M${cx - r * 0.85},${cy + r} V${cy - r * 0.1} A${r * 0.85},${r * 0.85} 0 0 1 ${cx + r * 0.85},${cy - r * 0.1} V${cy + r} Z`} />,
        cut: (
          <g {...line} strokeWidth={2.6}>
            <path d={`M${cx - r * 0.38},${cy - r * 0.5} L${cx - r * 0.2},${cy - r * 0.8} L${cx},${cy - r * 0.6} L${cx + r * 0.2},${cy - r * 0.8} L${cx + r * 0.38},${cy - r * 0.5}`} />
            <circle cx={cx} cy={cy - r * 0.2} r={r * 0.34} />
            <ellipse cx={cx - r * 0.55} cy={cy - r * 0.15} rx={r * 0.2} ry={r * 0.36} />
            <ellipse cx={cx + r * 0.55} cy={cy - r * 0.15} rx={r * 0.2} ry={r * 0.36} />
            <path d={`M${cx},${cy - r * 0.1} Q${cx - r * 0.05},${cy + r * 0.45} ${cx - r * 0.2},${cy + r * 0.62} Q${cx - r * 0.1},${cy + r * 0.8} ${cx + r * 0.05},${cy + r * 0.66}`} strokeWidth={4} />
            <path d={`M${cx - r * 0.2},${cy - r * 0.3} h${r * 0.1} M${cx + r * 0.1},${cy - r * 0.3} h${r * 0.1}`} strokeWidth={3.4} />
            <path d={`M${cx - r * 0.55},${cy + r * 0.75} q${r * 0.55},${r * 0.3} ${r * 1.1},0`} />
          </g>
        ),
      };
    case 'rosette':
      return {
        solid: <path d={basePath} />,
        cut: (
          <g fill="#000">
            {petals(cx, cy, 8, r * 0.3, r * 0.17, r * 0.055, 'r')}
            <circle cx={cx} cy={cy} r={r * 0.07} />
          </g>
        ),
      };
    default:
      return { solid: <path d={basePath} />, cut: null };
  }
}
