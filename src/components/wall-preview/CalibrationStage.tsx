import { useEffect, useRef } from 'react';
import type { Point } from '@/lib/wallPreview/types';
import type { Backdrop } from './render/backdrop';

interface Props {
  backdrop: Backdrop;
  /** Points marked so far, in backdrop pixels. */
  points: Point[];
  maxPoints: number;
  onPoints: (points: Point[]) => void;
  /** Shown near each marker, e.g. ['A', 'B'] or ['TL', 'TR', 'BR', 'BL']. */
  labels: string[];
  label: string;
}

/** Shows the photo and lets the customer tap to place (or drag to adjust) marker points. */
export function CalibrationStage({ backdrop, points, maxPoints, onPoints, labels, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = backdrop.width;
    c.height = backdrop.height;
    c.getContext('2d')!.drawImage(backdrop.source, 0, 0);
  }, [backdrop]);

  const toImage = (e: React.PointerEvent): Point => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * backdrop.width, y: ((e.clientY - r.top) / r.height) * backdrop.height };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toImage(e);
    const r = wrapRef.current!.getBoundingClientRect();
    const grab = (28 / r.width) * backdrop.width;
    const near = points.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < grab);
    if (near >= 0) {
      dragging.current = near;
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (points.length < maxPoints) {
      onPoints([...points, p]);
    } else {
      onPoints([...points.slice(0, maxPoints - 1), p]);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current === null) return;
    const next = [...points];
    next[dragging.current] = toImage(e);
    onPoints(next);
  };

  const dot = backdrop.width / 90;
  return (
    <div
      ref={wrapRef}
      role="application"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (dragging.current = null)}
      className="relative overflow-hidden rounded-xl border border-border"
      style={{ touchAction: 'none', cursor: 'crosshair', aspectRatio: `${backdrop.width} / ${backdrop.height}` }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <svg viewBox={`0 0 ${backdrop.width} ${backdrop.height}`} className="absolute inset-0 h-full w-full" aria-hidden>
        {points.length > 1 && (
          <polyline
            points={(maxPoints > 2 && points.length === maxPoints ? [...points, points[0]] : points).map(p => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke="#FAF7F2" strokeWidth={dot / 5} strokeDasharray={`${dot / 2} ${dot / 3}`}
          />
        )}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={dot} fill="#5B262C" stroke="#FAF7F2" strokeWidth={dot / 4} />
            <text x={p.x + dot * 1.4} y={p.y - dot * 1.2} fontSize={dot * 1.5} fontWeight={700} fill="#FAF7F2" stroke="#2B2522" strokeWidth={dot / 5} paintOrder="stroke">{labels[i]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
