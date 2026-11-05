import { applyHomography, type Matrix3 } from '@/lib/wallPreview/homography';
import { STANDOFF_MM, type MountingLayout } from '@/lib/wallPreview/outline';
import type { LightConfig, Outline, Point } from '@/lib/wallPreview/types';
import type { Backdrop, Patch } from './backdrop';
import { createPieceSprite, createShadowSprite, type Sprite } from './pieceSprite';
import { drawWarped } from './warp';

export interface Pose {
  /** Centre of the piece in wall centimetres (origin top-left of the wall plane, y down). */
  cx: number;
  cy: number;
  rotationDeg: number;
}

export interface Ghost {
  widthCm: number;
  heightCm: number;
  label: string;
}

export interface Overlays {
  dimensions?: boolean;
  /** Wall height in cm: draws the "height from floor" marker down to the floor. */
  floorHeightCm?: number;
  mounting?: MountingLayout;
  ghosts?: Ghost[];
}

export interface ComposeInput {
  backdrop: Backdrop;
  patch?: Patch;
  /** Wall (cm) to backdrop pixels. */
  wallToImage: Matrix3;
  outline: Outline;
  finish: string;
  pose: Pose;
  light: LightConfig;
  overlays?: Overlays;
  watermark?: boolean;
}

const INK = '#2B2522';

function pillText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.font = `600 ${size}px "Plus Jakarta Sans", system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size * 1.1;
  const h = size * 1.7;
  ctx.fillStyle = 'rgba(250,247,242,0.94)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + size * 0.05);
}

/** Draws one full frame (backdrop, shadow, metal, helpers) at `width` x `height` device pixels. */
export function composeScene(ctx: CanvasRenderingContext2D, width: number, height: number, input: ComposeInput): void {
  const { backdrop, patch, wallToImage, outline, finish, pose, light, overlays = {} } = input;
  const s = width / backdrop.width;
  const unit = Math.max(1, width / 720); // overlay sizes scale with canvas resolution
  const toScreen = (wall: Point): Point => {
    const p = applyHomography(wallToImage, wall);
    return { x: p.x * s, y: p.y * s };
  };
  const wCm = outline.widthMm / 10, hCm = outline.heightMm / 10;
  const th = (pose.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(th), sin = Math.sin(th);
  /** Local piece offset (cm, from its centre) to wall coordinates. */
  const local = (x: number, y: number, extra: Point = { x: 0, y: 0 }): Point => ({
    x: pose.cx + x * cos - y * sin + extra.x,
    y: pose.cy + x * sin + y * cos + extra.y,
  });

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(backdrop.source, 0, 0, width, height);
  if (patch) ctx.drawImage(patch.canvas, patch.x * s, patch.y * s, patch.canvas.width * s, patch.canvas.height * s);

  const spriteMap = (sprite: Sprite, offset: Point) => (p: Point): Point =>
    toScreen(local(p.x / sprite.pxPerCm - sprite.padCm - sprite.widthCm / 2, p.y / sprite.pxPerCm - sprite.padCm - sprite.heightCm / 2, offset));

  // Shadow: the piece floats 2.5 cm off the wall, so light from one side throws a soft shadow to the other.
  const len = Math.hypot(light.fromX, light.fromY) || 1;
  const dirX = -light.fromX / len, dirY = -light.fromY / len;
  const gapCm = STANDOFF_MM / 10;
  const soft = createShadowSprite(outline, 0.8 + light.softness * 3.2);
  const tight = createShadowSprite(outline, 0.5);
  ctx.save();
  ctx.globalAlpha = 0.45 * (1 - light.softness * 0.3);
  drawWarped(ctx, soft.canvas, spriteMap(soft, { x: dirX * gapCm * 1.1, y: dirY * gapCm * 1.1 + 0.6 }));
  ctx.globalAlpha = 0.3;
  drawWarped(ctx, tight.canvas, spriteMap(tight, { x: dirX * 0.7, y: dirY * 0.7 + 0.3 }));
  ctx.restore();

  const piece = createPieceSprite(outline, finish, light);
  drawWarped(ctx, piece.canvas, spriteMap(piece, { x: 0, y: 0 }));

  const line = (a: Point, b: Point) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  for (const ghost of overlays.ghosts ?? []) {
    const corners = [
      local(-ghost.widthCm / 2, -ghost.heightCm / 2), local(ghost.widthCm / 2, -ghost.heightCm / 2),
      local(ghost.widthCm / 2, ghost.heightCm / 2), local(-ghost.widthCm / 2, ghost.heightCm / 2),
    ].map(toScreen);
    ctx.save();
    ctx.setLineDash([6 * unit, 5 * unit]);
    ctx.lineWidth = 1.6 * unit;
    ctx.strokeStyle = 'rgba(250,247,242,0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 3 * unit;
    ctx.beginPath();
    corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    pillText(ctx, ghost.label, corners[0].x + 28 * unit, corners[0].y - 12 * unit, 11 * unit);
  }

  if (overlays.mounting) {
    ctx.save();
    for (const hole of overlays.mounting.holes) {
      const p = toScreen(local(hole.x / 10 - wCm / 2, hole.y / 10 - hCm / 2));
      ctx.fillStyle = 'rgba(91,38,44,0.95)';
      ctx.strokeStyle = '#FAF7F2';
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  if (overlays.dimensions) {
    ctx.save();
    ctx.strokeStyle = 'rgba(250,247,242,0.95)';
    ctx.lineWidth = 1.6 * unit;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 3 * unit;
    const off = 5; // cm
    const a = toScreen(local(-wCm / 2, hCm / 2 + off)), b = toScreen(local(wCm / 2, hCm / 2 + off));
    line(a, b);
    line(toScreen(local(-wCm / 2, hCm / 2 + off - 1.5)), toScreen(local(-wCm / 2, hCm / 2 + off + 1.5)));
    line(toScreen(local(wCm / 2, hCm / 2 + off - 1.5)), toScreen(local(wCm / 2, hCm / 2 + off + 1.5)));
    const c = toScreen(local(wCm / 2 + off, -hCm / 2)), d = toScreen(local(wCm / 2 + off, hCm / 2));
    line(c, d);
    line(toScreen(local(wCm / 2 + off - 1.5, -hCm / 2)), toScreen(local(wCm / 2 + off + 1.5, -hCm / 2)));
    line(toScreen(local(wCm / 2 + off - 1.5, hCm / 2)), toScreen(local(wCm / 2 + off + 1.5, hCm / 2)));
    ctx.restore();
    pillText(ctx, `${Math.round(wCm)} cm`, (a.x + b.x) / 2, (a.y + b.y) / 2, 12 * unit);
    pillText(ctx, `${Math.round(hCm)} cm`, (c.x + d.x) / 2, (c.y + d.y) / 2, 12 * unit);
  }

  if (overlays.floorHeightCm !== undefined) {
    const from = toScreen({ x: pose.cx, y: pose.cy });
    const to = toScreen({ x: pose.cx, y: overlays.floorHeightCm });
    ctx.save();
    ctx.setLineDash([5 * unit, 5 * unit]);
    ctx.strokeStyle = 'rgba(250,247,242,0.95)';
    ctx.lineWidth = 1.4 * unit;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 3 * unit;
    line(from, to);
    ctx.restore();
    pillText(ctx, `${Math.round(overlays.floorHeightCm - pose.cy)} cm from floor`, (from.x + to.x) / 2, (from.y + to.y) / 2, 11 * unit);
  }

  if (input.watermark) {
    ctx.save();
    ctx.font = `600 ${Math.max(11, width / 70)}px "Cormorant Garamond", Georgia, serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 4;
    ctx.fillText('VERNOX', width - width / 50, height - width / 60);
    ctx.restore();
  }
}
