/**
 * Interactive design canvas (Konva). The stage is scaled so one unit = one millimetre.
 *
 * Performance: React renders objects only when the document changes; dragging, snapping,
 * zooming, panning and marquee selection run imperatively on Konva nodes, so the drag loop
 * never re-renders React. Results are committed to the store once, on drag/transform end.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// Konva core + only the shapes we draw (the full bundle is ~40 kB gzip larger).
import Konva from 'konva/lib/Core';
import 'konva/lib/shapes/Path';
import 'konva/lib/shapes/Circle';
import 'konva/lib/shapes/Rect';
import 'konva/lib/shapes/Line';
import 'konva/lib/shapes/Transformer';
import type { Line as KonvaLine } from 'konva/lib/shapes/Line';
import type { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import type { Transformer as KonvaTransformer } from 'konva/lib/shapes/Transformer';
import type { Node as KonvaNode, KonvaEventObject } from 'konva/lib/Node';
import { Circle, Layer, Line, Path, Rect, Stage, Transformer } from 'react-konva/es/ReactKonvaCore';
import { plateOutline, plateRings } from '@/lib/studio/compose';
import { ringsToPathData, transformPathData } from '@/lib/studio/geometry/path';
import { finishPreset } from '@/lib/studio/materials';
import { useStudio, type ObjectPatch } from '@/lib/studio/store';
import type { StudioObject } from '@/lib/studio/schema';
import { useStudioUi } from '../uiStore';
import { withGroups } from '../actions';
import { ObjectNode, type ObjectPaint } from './ObjectNode';
import { Rulers, type ViewState } from './Rulers';

Konva.hitOnDragEnabled = true;

const SNAP_PX = 6;
const GRID_MM = 10;
const MIN_SCALE = 0.05;
const MAX_SCALE = 40;

function cssColor(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : fallback;
}

function gradientStops(stops: readonly string[]): (string | number)[] {
  return stops.flatMap((c, i) => [i / Math.max(1, stops.length - 1), c]);
}

interface Rect { x: number; y: number; width: number; height: number }

const coarsePointer = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export default function StudioCanvas({ showRulers }: { showRulers: boolean }) {
  const doc = useStudio(s => s.doc);
  const selection = useStudio(s => s.selection);
  const geometry = useStudioUi(s => s.geometry);
  const fitRequest = useStudioUi(s => s.fitRequest);
  const showGrid = useStudioUi(s => s.showGrid);
  const snap = useStudioUi(s => s.snap);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const objectsLayerRef = useRef<Konva.Layer>(null);
  const transformerRef = useRef<KonvaTransformer>(null);
  const guideV = useRef<KonvaLine>(null);
  const guideH = useRef<KonvaLine>(null);
  const marqueeRef = useRef<KonvaRect>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const viewFrame = useRef(0);
  const snapTargets = useRef<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const gesture = useRef<{ mode: 'none' | 'pan' | 'marquee' | 'pinch'; start?: { x: number; y: number }; last?: { x: number; y: number }; dist?: number }>({ mode: 'none' });
  const spaceDown = useRef(false);

  const { widthMm: W, heightMm: H } = doc.plate;
  const preset = finishPreset(doc.material.finish);
  const wall = useMemo(() => cssColor('--muted', '#ece7df'), []);
  const paint: ObjectPaint = useMemo(() => ({ wall, stops: gradientStops(preset.swatch), score: '#1d4ed8' }), [wall, preset]);
  // Solid plate or frame ring (exact, from the same code that composes the part); dashed outline when plate-less.
  const plateD = useMemo(
    () => ringsToPathData(doc.plate.style === 'none' ? plateOutline(doc.plate) : plateRings(doc.plate)),
    [doc.plate],
  );

  // ---------- view ----------

  const applyView = useCallback((next: ViewState) => {
    viewRef.current = next;
    const stage = stageRef.current;
    if (stage) {
      stage.scale({ x: next.scale, y: next.scale });
      stage.position({ x: next.x, y: next.y });
      stage.batchDraw();
    }
    // React state only feeds the rulers; coalesce to one update per frame.
    if (!viewFrame.current) {
      viewFrame.current = requestAnimationFrame(() => {
        viewFrame.current = 0;
        setView(viewRef.current);
      });
    }
  }, []);

  const fit = useCallback(() => {
    if (!size.width || !size.height) return;
    const pad = Math.min(64, size.width * 0.08);
    const scale = Math.min((size.width - pad * 2) / W, (size.height - pad * 2) / H);
    applyView({ scale, x: (size.width - W * scale) / 2, y: (size.height - H * scale) / 2 });
  }, [size.width, size.height, W, H, applyView]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setSize({ width: Math.round(r.width), height: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { fit(); }, [fit, fitRequest]);

  const zoomAt = useCallback((point: { x: number; y: number }, factor: number) => {
    const v = viewRef.current;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
    const k = scale / v.scale;
    applyView({ scale, x: point.x - (point.x - v.x) * k, y: point.y - (point.y - v.y) * k });
  }, [applyView]);

  const onWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const p = stage.getPointerPosition() ?? { x: size.width / 2, y: size.height / 2 };
      zoomAt(p, Math.exp(-e.evt.deltaY * 0.01));
    } else {
      const v = viewRef.current;
      applyView({ ...v, x: v.x - e.evt.deltaX, y: v.y - e.evt.deltaY });
    }
  }, [applyView, zoomAt, size.width, size.height]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('input,textarea,[contenteditable]')) spaceDown.current = true; };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false; };
    const zoom = (e: Event) => {
      const f = (e as CustomEvent<number>).detail;
      zoomAt({ x: size.width / 2, y: size.height / 2 }, f);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('vernox-studio:zoom', zoom);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('vernox-studio:zoom', zoom);
    };
  }, [zoomAt, size.width, size.height]);

  // ---------- selection ----------

  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = selection
      .map(id => stage.findOne(`#${id}`))
      .filter((n): n is KonvaNode => Boolean(n))
      .filter(n => doc.objects.find(o => o.id === n.id())?.locked !== true);
    tr.nodes(nodes);
    const only = nodes.length === 1 ? doc.objects.find(o => o.id === nodes[0].id()) : undefined;
    // Text and holes keep their proportions; shapes and paths can stretch.
    tr.keepRatio(nodes.length > 1 || only?.kind === 'text' || only?.kind === 'hole');
    tr.enabledAnchors(only?.kind === 'text' || only?.kind === 'hole' || nodes.length > 1
      ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
      : ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right']);
    tr.getLayer()?.batchDraw();
  }, [selection, doc.objects]);

  const select = useStudio(s => s.select);
  const onPointerDown = useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>, id: string) => {
    e.cancelBubble = true;
    const s = useStudio.getState();
    const additive = 'shiftKey' in e.evt && (e.evt.shiftKey || e.evt.metaKey);
    const ids = withGroups([id], s.doc.objects);
    if (additive) {
      const has = s.selection.includes(id);
      select(has ? s.selection.filter(x => !ids.includes(x)) : [...new Set([...s.selection, ...ids])]);
    } else if (!s.selection.includes(id)) {
      select(ids);
    }
  }, [select]);

  // ---------- drag with snapping ----------

  const hideGuides = () => {
    guideV.current?.visible(false);
    guideH.current?.visible(false);
  };

  const onDragStart = useCallback(() => {
    const layer = objectsLayerRef.current;
    if (!layer) return;
    const sel = new Set(useStudio.getState().selection);
    const v = [0, W / 2, W], h = [0, H / 2, H];
    layer.find('.studio-object').forEach(n => {
      if (sel.has(n.id())) return;
      const r = n.getClientRect({ relativeTo: layer });
      v.push(r.x, r.x + r.width / 2, r.x + r.width);
      h.push(r.y, r.y + r.height / 2, r.y + r.height);
    });
    snapTargets.current = { v, h };
  }, [W, H]);

  const onDragMove = useCallback((e: KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const layer = objectsLayerRef.current;
    const ui = useStudioUi.getState();
    if (!layer || useStudio.getState().selection.length > 1) return;
    if (ui.showGrid && ui.snap) {
      node.x(Math.round(node.x() / GRID_MM) * GRID_MM);
      node.y(Math.round(node.y() / GRID_MM) * GRID_MM);
      return;
    }
    if (!ui.snap) return;
    const r = node.getClientRect({ relativeTo: layer });
    const tol = SNAP_PX / viewRef.current.scale;
    const best = (edges: number[], targets: number[]) => {
      let out: { delta: number; at: number } | null = null;
      for (const e1 of edges) for (const t of targets) {
        const d = t - e1;
        if (Math.abs(d) <= tol && (!out || Math.abs(d) < Math.abs(out.delta))) out = { delta: d, at: t };
      }
      return out;
    };
    const sx = best([r.x, r.x + r.width / 2, r.x + r.width], snapTargets.current.v);
    const sy = best([r.y, r.y + r.height / 2, r.y + r.height], snapTargets.current.h);
    if (sx) node.x(node.x() + sx.delta);
    if (sy) node.y(node.y() + sy.delta);
    const span = Math.max(W, H) * 4;
    guideV.current?.points(sx ? [sx.at, -span, sx.at, span] : []).visible(Boolean(sx));
    guideH.current?.points(sy ? [-span, sy.at, span, sy.at] : []).visible(Boolean(sy));
  }, [W, H]);

  const commitNodes = useCallback((nodes: KonvaNode[]) => {
    const s = useStudio.getState();
    const patches: Record<string, ObjectPatch> = {};
    for (const node of nodes) {
      const o = s.doc.objects.find(x => x.id === node.id());
      if (!o) continue;
      const sx = node.scaleX(), sy = node.scaleY();
      const base: ObjectPatch = { x: node.x(), y: node.y(), rotation: node.rotation() };
      const kx = Math.abs(sx / o.scaleX), ky = Math.abs(sy / o.scaleY);
      if (o.kind === 'text' && (Math.abs(kx - 1) > 1e-6 || Math.abs(ky - 1) > 1e-6)) {
        // Shaping is linear in size: scale the cached outline exactly instead of re-shaping.
        const k = (kx + ky) / 2;
        Object.assign(base, {
          sizeMm: Math.round(o.sizeMm * k * 100) / 100,
          letterSpacingMm: o.letterSpacingMm * k,
          ...(o.outline ? { outline: transformPathData(o.outline, [k, 0, 0, k, 0, 0]) } : {}),
        });
        node.scale({ x: o.scaleX, y: o.scaleY });
      } else if (o.kind === 'shape') {
        Object.assign(base, { widthMm: Math.max(1, o.widthMm * kx), heightMm: Math.max(1, o.heightMm * ky) });
        node.scale({ x: o.scaleX, y: o.scaleY });
      } else if (o.kind === 'hole') {
        Object.assign(base, { diameterMm: Math.max(0.5, o.diameterMm * Math.max(kx, ky)) });
        node.scale({ x: o.scaleX, y: o.scaleY });
      } else {
        Object.assign(base, { scaleX: sx, scaleY: sy });
      }
      patches[o.id] = base;
    }
    s.updateObjects(patches);
  }, []);

  const onDragEnd = useCallback((e: KonvaEventObject<DragEvent>) => {
    hideGuides();
    // The dragged node may not be attached to the transformer yet (very quick drag of an unselected object).
    commitNodes([...new Set([...(transformerRef.current?.nodes() ?? []), e.target])]);
  }, [commitNodes]);

  const onTransformEnd = useCallback((e: KonvaEventObject<Event>) => {
    // Fired once per node; commit them all when the last one reports.
    const nodes = transformerRef.current?.nodes() ?? [];
    if (e.target === nodes[nodes.length - 1]) commitNodes(nodes);
  }, [commitNodes]);

  // ---------- stage gestures: pan, marquee, pinch ----------

  const pointer = () => stageRef.current?.getPointerPosition() ?? { x: 0, y: 0 };
  const toWorld = (p: { x: number; y: number }) => {
    const v = viewRef.current;
    return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
  };

  const onStageDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const evt = e.evt;
    if ('touches' in evt && evt.touches.length === 2) {
      const [a, b] = [evt.touches[0], evt.touches[1]];
      gesture.current = { mode: 'pinch', dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), last: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 } };
      return;
    }
    const onObject = e.target.hasName('studio-object') || e.target.getParent()?.className === 'Transformer';
    if (onObject) return;
    const p = pointer();
    const middle = 'button' in evt && evt.button === 1;
    const touch = 'touches' in evt;
    const pro = useStudioUi.getState().mode === 'pro';
    if (middle || spaceDown.current || touch || !pro) {
      gesture.current = { mode: 'pan', last: p, start: p };
    } else {
      const w = toWorld(p);
      gesture.current = { mode: 'marquee', start: w };
      marqueeRef.current?.setAttrs({ x: w.x, y: w.y, width: 0, height: 0, visible: true });
    }
  };

  const onStageMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const g = gesture.current;
    const evt = e.evt;
    if (g.mode === 'pinch' && 'touches' in evt && evt.touches.length === 2) {
      evt.preventDefault();
      const [a, b] = [evt.touches[0], evt.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const rect = containerRef.current?.getBoundingClientRect();
      const c = { x: (a.clientX + b.clientX) / 2 - (rect?.left ?? 0), y: (a.clientY + b.clientY) / 2 - (rect?.top ?? 0) };
      const v = viewRef.current;
      const lastC = g.last ? { x: g.last.x - (rect?.left ?? 0), y: g.last.y - (rect?.top ?? 0) } : c;
      applyView({ ...v, x: v.x + (c.x - lastC.x), y: v.y + (c.y - lastC.y) });
      if (g.dist) zoomAt(c, dist / g.dist);
      gesture.current = { mode: 'pinch', dist, last: { x: c.x + (rect?.left ?? 0), y: c.y + (rect?.top ?? 0) } };
      return;
    }
    if (g.mode === 'pan' && g.last) {
      const p = pointer();
      const v = viewRef.current;
      applyView({ ...v, x: v.x + p.x - g.last.x, y: v.y + p.y - g.last.y });
      g.last = p;
    } else if (g.mode === 'marquee' && g.start) {
      const w = toWorld(pointer());
      marqueeRef.current?.setAttrs({ x: Math.min(w.x, g.start.x), y: Math.min(w.y, g.start.y), width: Math.abs(w.x - g.start.x), height: Math.abs(w.y - g.start.y) });
      marqueeRef.current?.getLayer()?.batchDraw();
    }
  };

  const onStageUp = () => {
    const g = gesture.current;
    if (g.mode === 'marquee' && g.start) {
      const m = marqueeRef.current;
      const box: Rect = { x: m?.x() ?? 0, y: m?.y() ?? 0, width: m?.width() ?? 0, height: m?.height() ?? 0 };
      m?.visible(false);
      const layer = objectsLayerRef.current;
      if (box.width < 1 && box.height < 1) select([]);
      else if (layer) {
        const hits = layer.find('.studio-object').filter(n => Konva.Util.haveIntersection(box, n.getClientRect({ relativeTo: layer }))).map(n => n.id());
        select(withGroups(hits, useStudio.getState().doc.objects));
      }
    } else if (g.mode === 'pan' && g.start && g.last && Math.hypot(g.last.x - g.start.x, g.last.y - g.start.y) < 4) {
      select([]); // a tap on empty space clears the selection
    }
    gesture.current = { mode: 'none' };
  };

  // ---------- rendering ----------

  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const issues = geometry?.analysis.issues.filter(i => i.at) ?? [];
  const anchorSize = coarsePointer() ? 18 : 9;
  const gridLines = useMemo(() => {
    if (!showGrid) return null;
    const lines: number[][] = [];
    for (let x = 0; x <= W; x += GRID_MM) lines.push([x, 0, x, H]);
    for (let y = 0; y <= H; y += GRID_MM) lines.push([0, y, W, y]);
    return lines;
  }, [showGrid, W, H]);

  return (
    <div ref={containerRef} className="relative h-full w-full touch-none select-none overflow-hidden" style={{ background: wall }} role="application" aria-label="Design canvas">
      {showRulers && <Rulers view={view} width={size.width} height={size.height} />}
      {size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          scaleX={viewRef.current.scale}
          scaleY={viewRef.current.scale}
          x={viewRef.current.x}
          y={viewRef.current.y}
          onWheel={onWheel}
          onMouseDown={onStageDown}
          onTouchStart={onStageDown}
          onMouseMove={onStageMove}
          onTouchMove={onStageMove}
          onMouseUp={onStageUp}
          onTouchEnd={onStageUp}
        >
          <Layer listening={false}>
            {doc.plate.style === 'none' ? (
              <Path data={plateD} stroke="rgba(0,0,0,0.25)" strokeWidth={1} dash={[6, 6]} strokeScaleEnabled={false} />
            ) : (
              <Path
                  data={plateD}
                  fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                  fillLinearGradientEndPoint={{ x: W, y: H }}
                  fillLinearGradientColorStops={paint.stops}
                  shadowColor="black"
                  shadowBlur={18}
                  shadowOpacity={0.25}
                  shadowOffset={{ x: 0, y: 6 / Math.max(viewRef.current.scale, 0.01) }}
                  perfectDrawEnabled={false}
                />
            )}
            {gridLines?.map((p, i) => <Line key={i} points={p} stroke="rgba(0,0,0,0.08)" strokeWidth={1} strokeScaleEnabled={false} />)}
          </Layer>
          <Layer ref={objectsLayerRef}>
            {doc.objects.map((o: StudioObject) => (
              <ObjectNode
                key={o.id}
                obj={o}
                paint={paint}
                draggable={!o.locked}
                onPointerDown={onPointerDown}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onTransformEnd={onTransformEnd}
              />
            ))}
          </Layer>
          <Layer listening={false}>
            {geometry?.bridgesD && <Path data={geometry.bridgesD} fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: W, y: H }} fillLinearGradientColorStops={paint.stops} />}
            {geometry?.mountingHoles.map((h, i) => <Circle key={i} x={h.x} y={h.y} radius={h.r} fill={paint.wall} stroke="rgba(0,0,0,0.3)" strokeWidth={0.6} strokeScaleEnabled={false} />)}
            {issues.map(i => (
              <Rect
                key={i.id}
                x={(i.at?.minX ?? 0) - 2}
                y={(i.at?.minY ?? 0) - 2}
                width={(i.at?.maxX ?? 0) - (i.at?.minX ?? 0) + 4}
                height={(i.at?.maxY ?? 0) - (i.at?.minY ?? 0) + 4}
                stroke={i.severity === 'error' ? '#dc2626' : '#d97706'}
                strokeWidth={1.5}
                dash={[5, 4]}
                strokeScaleEnabled={false}
                cornerRadius={2}
              />
            ))}
          </Layer>
          <Layer>
            <Transformer
              ref={transformerRef}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={4}
              anchorSize={anchorSize}
              anchorCornerRadius={anchorSize / 2}
              borderStroke="hsl(353 42% 25%)"
              anchorStroke="hsl(353 42% 25%)"
              anchorFill="#fff"
              ignoreStroke
              flipEnabled={false}
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 2 || Math.abs(newBox.height) < 2 ? oldBox : newBox)}
            />
            <Line ref={guideV} stroke="#e11d48" strokeWidth={1} strokeScaleEnabled={false} visible={false} listening={false} />
            <Line ref={guideH} stroke="#e11d48" strokeWidth={1} strokeScaleEnabled={false} visible={false} listening={false} />
            <Rect ref={marqueeRef} fill="rgba(91,38,44,0.08)" stroke="hsl(353 42% 25%)" strokeWidth={1} strokeScaleEnabled={false} visible={false} listening={false} />
          </Layer>
        </Stage>
      )}
      <span className="sr-only" aria-live="polite">{selectedSet.size ? `${selectedSet.size} selected` : ''}</span>
    </div>
  );
}
