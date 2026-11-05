import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { applyHomography, invertMatrix3, type Matrix3 } from '@/lib/wallPreview/homography';
import type { LightConfig, Outline, Point } from '@/lib/wallPreview/types';
import type { Backdrop, Patch } from './render/backdrop';
import { composeScene, type Overlays, type Pose } from './render/compose';

export interface WallCanvasHandle {
  /** Renders the current view at the backdrop's full resolution with the brand watermark, no helper overlays. */
  exportPng(): Promise<Blob | null>;
}

interface Props {
  backdrop: Backdrop;
  patch?: Patch;
  wallToImage: Matrix3;
  outline: Outline;
  finish: string;
  pose: Pose;
  light: LightConfig;
  overlays?: Overlays;
  /** Wall extent in cm; the piece centre is kept inside it. Omit to allow free placement (own photo). */
  bounds?: { widthCm: number; heightCm: number };
  onPoseChange: (pose: Pose) => void;
  /** Two-finger pinch reports a scale ratio so a photo's calibration can be trimmed. */
  onPinchScale?: (ratio: number) => void;
  label: string;
  className?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const WallCanvas = forwardRef<WallCanvasHandle, Props>(function WallCanvas(props, ref) {
  const { backdrop, patch, wallToImage, outline, finish, pose, light, overlays, bounds, onPoseChange, onPinchScale, label, className } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);
  const pointers = useRef(new Map<number, Point>());
  const poseRef = useRef(pose);
  poseRef.current = pose;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.round((w * backdrop.height) / backdrop.width);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    composeScene(canvas.getContext('2d')!, w, h, { backdrop, patch, wallToImage, outline, finish, pose, light, overlays });
  }, [backdrop, patch, wallToImage, outline, finish, pose, light, overlays]);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame.current);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  useImperativeHandle(ref, () => ({
    exportPng: () => {
      const out = document.createElement('canvas');
      out.width = backdrop.width;
      out.height = backdrop.height;
      composeScene(out.getContext('2d')!, out.width, out.height, { backdrop, patch, wallToImage, outline, finish, pose, light, watermark: true });
      return new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'));
    },
  }), [backdrop, patch, wallToImage, outline, finish, pose, light]);

  const inverse = useCallback(() => invertMatrix3(wallToImage), [wallToImage]);

  /** Client pointer position to wall centimetres. */
  const toWall = useCallback((clientX: number, clientY: number): Point | null => {
    const canvas = canvasRef.current;
    const inv = inverse();
    if (!canvas || !inv) return null;
    const rect = canvas.getBoundingClientRect();
    const k = backdrop.width / rect.width;
    return applyHomography(inv, { x: (clientX - rect.left) * k, y: (clientY - rect.top) * k });
  }, [backdrop.width, inverse]);

  const commit = useCallback((next: Pose) => {
    onPoseChange(bounds
      ? { ...next, cx: clamp(next.cx, 0, bounds.widthCm), cy: clamp(next.cy, 0, bounds.heightCm) }
      : next);
  }, [bounds, onPoseChange]);

  const gesture = useRef<{ angle: number; dist: number } | null>(null);
  const centroid = () => {
    const pts = [...pointers.current.values()];
    return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { angle: Math.atan2(b.y - a.y, b.x - a.x), dist: Math.hypot(b.x - a.x, b.y - a.y) };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const before = centroid();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = centroid();
    const p0 = toWall(before.x, before.y), p1 = toWall(after.x, after.y);
    if (!p0 || !p1) return;
    let next: Pose = { ...poseRef.current, cx: poseRef.current.cx + (p1.x - p0.x), cy: poseRef.current.cy + (p1.y - p0.y) };
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      next = { ...next, rotationDeg: next.rotationDeg + ((angle - gesture.current.angle) * 180) / Math.PI };
      if (onPinchScale && gesture.current.dist > 10) onPinchScale(dist / gesture.current.dist);
      gesture.current = { angle, dist };
    }
    commit(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const p = poseRef.current;
    const moves: Record<string, Pose> = {
      ArrowLeft: { ...p, cx: p.cx - step }, ArrowRight: { ...p, cx: p.cx + step },
      ArrowUp: { ...p, cy: p.cy - step }, ArrowDown: { ...p, cy: p.cy + step },
      '[': { ...p, rotationDeg: p.rotationDeg - step }, ']': { ...p, rotationDeg: p.rotationDeg + step },
    };
    const next = moves[e.key];
    if (next) {
      e.preventDefault();
      commit(next);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      role="application"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className={className}
      style={{ touchAction: 'none', aspectRatio: `${backdrop.width} / ${backdrop.height}`, width: '100%', cursor: 'grab' }}
    />
  );
});
