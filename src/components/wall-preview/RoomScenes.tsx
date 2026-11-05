import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Ruler, Target } from 'lucide-react';
import type { ProductSize } from '@/lib/catalog';
import { trackWallPreview, type EventData } from '@/lib/wallPreview/analytics';
import { wallToImage } from '@/lib/wallPreview/homography';
import { mountingLayout } from '@/lib/wallPreview/outline';
import { EYE_LEVEL_CENTRE_CM, centreYForHeightCm, heightFromFloorCm } from '@/lib/wallPreview/recommend';
import { SCENES, getScene } from '@/lib/wallPreview/scenes';
import type { Outline } from '@/lib/wallPreview/types';
import { Chip, Row } from './controls';
import { WallCanvas, type WallCanvasHandle } from './WallCanvas';
import { backdropFromUrl, makePatch, type Backdrop, type Patch } from './render/backdrop';
import type { Pose } from './render/compose';
import { cn } from '@/lib/utils';

interface Props {
  outline: Outline;
  finish: string;
  sizes: ProductSize[];
  sizeIndex: number;
  round: boolean;
  eventData: EventData;
  canvasRef: React.Ref<WallCanvasHandle>;
}

interface Loaded {
  backdrop: Backdrop;
  patch: Patch;
}

export function RoomScenes({ outline, finish, sizes, sizeIndex, round, eventData, canvasRef }: Props) {
  const [sceneId, setSceneId] = useState(SCENES[0].id);
  const scene = getScene(sceneId);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const cacheRef = useRef(new Map<string, Loaded>());
  const [pose, setPose] = useState<Pose>({ cx: scene.defaultCentreCm.x, cy: scene.defaultCentreCm.y, rotationDeg: 0 });
  const [compare, setCompare] = useState(false);
  const [showMounting, setShowMounting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hit = cacheRef.current.get(scene.id);
    if (hit) {
      setLoaded(hit);
      return;
    }
    setLoaded(null);
    setFailed(false);
    backdropFromUrl(scene.image)
      .then(backdrop => {
        if (cancelled) return;
        const entry = { backdrop, patch: makePatch(backdrop, scene.clearZone) };
        cacheRef.current.set(scene.id, entry);
        setLoaded(entry);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [scene]);

  const chooseScene = (id: string) => {
    const next = getScene(id);
    setSceneId(id);
    setPose({ cx: next.defaultCentreCm.x, cy: next.defaultCentreCm.y, rotationDeg: 0 });
    trackWallPreview('room_scene_changed', { sceneId: id, ...eventData });
  };

  const homography = useMemo(() => wallToImage(scene.wall.corners, scene.wall.widthCm, scene.wall.heightCm), [scene]);
  const ghosts = useMemo(() => {
    if (!compare) return [];
    return [sizeIndex - 1, sizeIndex + 1]
      .filter(i => i >= 0 && i < sizes.length)
      .map(i => ({ widthCm: sizes[i].widthMm / 10, heightCm: sizes[i].heightMm / 10, label: `${Math.round(sizes[i].widthMm / 10)} × ${Math.round(sizes[i].heightMm / 10)}` }));
  }, [compare, sizes, sizeIndex]);
  const mounting = useMemo(() => (showMounting ? mountingLayout(outline.widthMm, outline.heightMm, round) : undefined), [showMounting, outline, round]);
  const overlays = useMemo(
    () => ({ dimensions: true, floorHeightCm: scene.wall.heightCm, ghosts, mounting }),
    [scene.wall.heightCm, ghosts, mounting],
  );

  const fromFloor = heightFromFloorCm(pose.cy, scene.wall.heightCm);
  const setFromFloor = (cm: number) => setPose(p => ({ ...p, cy: centreYForHeightCm(Math.max(20, Math.min(scene.wall.heightCm - 10, cm)), scene.wall.heightCm) }));

  return (
    <div className="space-y-3">
      <Row label="Room">
        {SCENES.map(s => (
          <Chip key={s.id} active={s.id === sceneId} onClick={() => chooseScene(s.id)}>{s.label}</Chip>
        ))}
      </Row>

      <div className="relative overflow-hidden rounded-xl border border-border bg-secondary">
        {loaded && homography ? (
          <WallCanvas
            ref={canvasRef}
            backdrop={loaded.backdrop}
            patch={loaded.patch}
            wallToImage={homography}
            outline={outline}
            finish={finish}
            pose={pose}
            light={scene.light}
            overlays={overlays}
            bounds={{ widthCm: scene.wall.widthCm, heightCm: scene.wall.heightCm }}
            onPoseChange={setPose}
            label={`${scene.label} preview. Drag the piece to move it; arrow keys nudge it.`}
            className="block"
          />
        ) : (
          <div className={cn('aspect-[1200/896] w-full', !failed && 'animate-pulse motion-reduce:animate-none')} role="status">
            <span className="sr-only">{failed ? 'Could not load the room photo' : 'Loading room'}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border border-border bg-card" role="group" aria-label="Height of the piece's centre from the floor">
          <button type="button" aria-label="Lower by 5 cm" onClick={() => setFromFloor(fromFloor - 5)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-secondary"><Minus className="h-4 w-4" /></button>
          <span className="min-w-[5.5rem] text-center text-sm tabular-nums" aria-live="polite">{fromFloor} cm high</span>
          <button type="button" aria-label="Raise by 5 cm" onClick={() => setFromFloor(fromFloor + 5)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-secondary"><Plus className="h-4 w-4" /></button>
        </div>
        <Chip onClick={() => setFromFloor(EYE_LEVEL_CENTRE_CM)} active={fromFloor === EYE_LEVEL_CENTRE_CM}><Target className="mr-1.5 inline h-4 w-4" />Eye level</Chip>
        {sizes.length > 1 && <Chip active={compare} onClick={() => setCompare(v => !v)}>Compare sizes</Chip>}
        <Chip active={showMounting} onClick={() => setShowMounting(v => !v)}><Ruler className="mr-1.5 inline h-4 w-4" />Mounting</Chip>
      </div>
      {showMounting && (
        <p className="text-sm text-muted-foreground">
          {mounting?.holes.length} holes of {mounting?.holeDiameterMm} mm, spacers hold it {mounting?.spacerMm} mm off the wall. {mounting?.note}
        </p>
      )}
    </div>
  );
}
