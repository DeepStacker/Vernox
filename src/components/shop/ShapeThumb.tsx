import { useId } from 'react';
import { shapeDefinitions } from '@/lib/shapes';

interface Props {
  shapeId: string;
  finish?: string;
  className?: string;
  /** width / height of the plate; defaults to a square so cards and thumbnails stay uniform. */
  aspect?: number;
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

/** Draws a design as a metal plate in the chosen finish. Used wherever a product photo is not available yet. */
export function ShapeThumb({ shapeId, finish = 'brass', className, aspect = 1 }: Props) {
  const shape = shapeDefinitions.find(s => s.id === shapeId) ?? shapeDefinitions[0];
  const w = 200 * Math.max(1, aspect);
  const h = 200 * Math.max(1, 1 / aspect);
  const path = shape.getPath(w, h);
  const stops = finishGradients[finish] ?? BRASS;
  const uid = useId().replace(/:/g, '');
  const gid = `grad-${uid}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gid} x1="0.2" y1="0" x2="0.8" y2="1">
          {stops.map((color, index) => (
            <stop key={color + index} offset={`${(index / (stops.length - 1)) * 100}%`} stopColor={color} />
          ))}
        </linearGradient>
        <filter id={`${gid}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000000" floodOpacity="0.28" />
        </filter>
      </defs>
      <path d={path} fill={`url(#${gid})`} filter={`url(#${gid}-shadow)`} />
      <path d={path} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
    </svg>
  );
}
