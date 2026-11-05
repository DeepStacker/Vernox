import { memo } from 'react';

export interface ViewState {
  scale: number;
  x: number;
  y: number;
}

const RULER = 18;

/** Picks a tick step (mm) that keeps labels ~60 px apart at the current zoom. */
function tickStep(scale: number): number {
  const target = 60 / scale;
  for (const s of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) if (s >= target) return s;
  return 1000;
}

/** Millimetre rulers along the top and left edges (Pro mode). Pure SVG, redrawn on view change. */
export const Rulers = memo(function Rulers({ view, width, height }: { view: ViewState; width: number; height: number }) {
  const step = tickStep(view.scale);
  const ticks = (length: number, origin: number) => {
    const out: number[] = [];
    const first = Math.floor(-origin / view.scale / step) * step;
    for (let mm = first; (mm * view.scale + origin) < length; mm += step) out.push(mm);
    return out;
  };
  const cls = 'pointer-events-none absolute z-10 bg-card/90 text-[9px] text-muted-foreground';
  return (
    <>
      <svg className={`${cls} left-0 top-0`} width={width} height={RULER} aria-hidden="true">
        {ticks(width, view.x).map(mm => {
          const x = mm * view.scale + view.x;
          return (
            <g key={mm}>
              <line x1={x} x2={x} y1={RULER - 6} y2={RULER} stroke="currentColor" />
              <text x={x + 2} y={9} fill="currentColor">{mm}</text>
            </g>
          );
        })}
      </svg>
      <svg className={`${cls} left-0 top-0`} width={RULER} height={height} aria-hidden="true">
        {ticks(height, view.y).map(mm => {
          const y = mm * view.scale + view.y;
          return (
            <g key={mm}>
              <line x1={RULER - 6} x2={RULER} y1={y} y2={y} stroke="currentColor" />
              <text x={2} y={y - 2} fill="currentColor">{mm}</text>
            </g>
          );
        })}
      </svg>
    </>
  );
});
