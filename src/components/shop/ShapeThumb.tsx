import { useId, type CSSProperties } from 'react';
import { shapeDefinitions } from '@/lib/shapes';
import { buildMotif, motifForName } from '@/components/shop/metalArt';

interface Props {
  shapeId: string;
  finish?: string;
  className?: string;
  style?: CSSProperties;
  /** width / height of the plate; defaults to a square so cards and thumbnails stay uniform. */
  aspect?: number;
  /** Design name; picks the motif (Om, mandala, tree of life...). Without it the plain catalogue shape is drawn. */
  name?: string;
}

const STEEL = ['#5c5c5c', '#2c2c2c', '#151515', '#0c0c0c'];
const STAINLESS = ['#ffffff', '#dfdfdf', '#a8a8a8', '#686868', '#383838'];
const BRASS = ['#ffe79a', '#dca842', '#b27b16', '#664103'];
const ANTIQUE_BRASS = ['#d9b56a', '#a8803a', '#7a5a22', '#4a3410'];
const CORTEN = ['#f29f63', '#d9653b', '#963c11', '#4d1902'];

const finishGradients: Record<string, string[]> = {
  steel: STEEL,
  black_patina: STEEL,
  stainless: STAINLESS,
  brushed_hairline: STAINLESS,
  aluminum: ['#f5f5f5', '#cccccc', '#949494', '#5e5e5e'],
  brass: BRASS,
  antique_brass: ANTIQUE_BRASS,
  copper: ['#ffc4a6', '#e0764c', '#b54b20', '#631e05'],
  gold: ['#fff6d1', '#e8c95e', '#bc9a24', '#755b0a'],
  corten: CORTEN,
  corten_rust: CORTEN,
};

/**
 * Draws a design as a laser-cut metal plate in the chosen finish: finish gradient with a hairline brushed
 * texture, bevelled edge, and a standoff drop shadow. Used wherever a product photo is not available yet.
 * Only transform/opacity animate (the `.metal-sheen` sweep and gradient-stop colour transitions are CSS).
 */
export function ShapeThumb({ shapeId, finish = 'brass', className, style, aspect = 1, name }: Props) {
  const shape = shapeDefinitions.find(s => s.id === shapeId) ?? shapeDefinitions[0];
  const w = 200 * Math.max(1, aspect);
  const h = 200 * Math.max(1, 1 / aspect);
  const stops = finishGradients[finish] ?? BRASS;
  const uid = useId().replace(/:/g, '');
  const gid = `g${uid}`;
  const art = buildMotif(motifForName(name), w, h, shape.getPath(w, h));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} style={style} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gid} x1="0.15" y1="0" x2="0.85" y2="1">
          {stops.map((color, index) => (
            <stop key={index} offset={`${(index / (stops.length - 1)) * 100}%`} className="metal-stop" style={{ stopColor: color }} />
          ))}
        </linearGradient>
        <linearGradient id={`${gid}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <pattern id={`${gid}-brush`} width="4" height="2.2" patternUnits="userSpaceOnUse">
          <rect width="4" height="0.7" fill="#fff" opacity="0.09" />
          <rect y="1.3" width="4" height="0.5" fill="#000" opacity="0.07" />
        </pattern>
        <mask id={`${gid}-m`} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>
          <g fill="#fff">{art.solid}</g>
          {art.cut}
        </mask>
        <filter id={`${gid}-bevel`} x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="b" />
          <feOffset in="b" dx="-1.3" dy="-1.3" result="o" />
          <feComposite in="SourceAlpha" in2="o" operator="out" result="edge" />
          <feFlood floodColor="#fff" floodOpacity="0.6" />
          <feComposite in2="edge" operator="in" result="hi" />
          <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="hi" /></feMerge>
        </filter>
        <filter id={`${gid}-shadow`} x="-20%" y="-20%" width="140%" height="145%">
          <feDropShadow dx="2" dy="9" stdDeviation="7" floodColor="#2b2018" floodOpacity="0.3" />
          <feDropShadow dx="0.8" dy="2" stdDeviation="1.4" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter={`url(#${gid}-shadow)`}>
        <g filter={`url(#${gid}-bevel)`}>
          <g mask={`url(#${gid}-m)`}>
            <rect width={w} height={h} fill={`url(#${gid})`} />
            <rect width={w} height={h} fill={`url(#${gid}-brush)`} />
            <g transform="skewX(-18)"><rect className="metal-sheen" x={-w * 0.7} width={w * 0.5} height={h} fill={`url(#${gid}-sheen)`} /></g>
          </g>
        </g>
      </g>
    </svg>
  );
}
