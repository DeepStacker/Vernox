import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, ImagePlus, Lock, RotateCcw, RotateCw } from 'lucide-react';
import { CALIBRATION_PRESETS, perspectiveHomography, pxPerCmFromTwoPoints, pxPerCmFromWallWidth, scaleOnlyHomography } from '@/lib/wallPreview/calibration';
import { trackWallPreview, type EventData } from '@/lib/wallPreview/analytics';
import { applyHomography, invertMatrix3, type Matrix3 } from '@/lib/wallPreview/homography';
import type { Outline, Point, Quad } from '@/lib/wallPreview/types';
import { Chip, Row } from './controls';
import { CalibrationStage } from './CalibrationStage';
import { WallCanvas, type WallCanvasHandle } from './WallCanvas';
import { backdropFromFile, estimateBackdropLight, type Backdrop } from './render/backdrop';
import type { Pose } from './render/compose';

type Method = 'object' | 'width' | 'corners';

interface Props {
  outline: Outline;
  finish: string;
  eventData: EventData;
  canvasRef: React.Ref<WallCanvasHandle>;
}

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

export function YourWall({ outline, finish, eventData, canvasRef }: Props) {
  const [backdrop, setBackdrop] = useState<Backdrop | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<Method>('object');
  const [points, setPoints] = useState<Point[]>([]);
  const [presetId, setPresetId] = useState(CALIBRATION_PRESETS[0].id);
  const [customLength, setCustomLength] = useState('');
  const [wallWidth, setWallWidth] = useState('');
  const [rectW, setRectW] = useState('');
  const [rectH, setRectH] = useState('');
  const [calibration, setCalibration] = useState<{ h: Matrix3; method: Method; ppcm?: number } | null>(null);
  const [pose, setPose] = useState<Pose>({ cx: 0, cy: 0, rotationDeg: 0 });

  const light = useMemo(() => (backdrop ? estimateBackdropLight(backdrop) : null), [backdrop]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setBackdrop(await backdropFromFile(file));
      setCalibration(null);
      setPoints([]);
    } catch {
      setError('That image could not be opened. Try a JPG or PNG photo.');
    } finally {
      setBusy(false);
    }
  };

  const preset = CALIBRATION_PRESETS.find(p => p.id === presetId)!;
  const lengthCm = preset.lengthCm ?? num(customLength);

  const computed = useMemo((): { h: Matrix3; ppcm?: number } | null => {
    if (!backdrop) return null;
    if (method === 'object' && points.length === 2) {
      const ppcm = pxPerCmFromTwoPoints(points[0], points[1], lengthCm);
      return ppcm ? { h: scaleOnlyHomography(ppcm), ppcm } : null;
    }
    if (method === 'width') {
      const ppcm = pxPerCmFromWallWidth(backdrop.width, num(wallWidth));
      return ppcm ? { h: scaleOnlyHomography(ppcm), ppcm } : null;
    }
    if (method === 'corners' && points.length === 4) {
      const h = perspectiveHomography(points as Quad, num(rectW), num(rectH));
      return h ? { h } : null;
    }
    return null;
  }, [backdrop, method, points, lengthCm, wallWidth, rectW, rectH]);

  const startPlacing = () => {
    if (!computed || !backdrop) return;
    const inv = invertMatrix3(computed.h);
    const centre = inv ? applyHomography(inv, { x: backdrop.width / 2, y: backdrop.height / 2 }) : { x: 0, y: 0 };
    setCalibration({ h: computed.h, method, ppcm: computed.ppcm });
    setPose({ cx: centre.x, cy: centre.y, rotationDeg: 0 });
    trackWallPreview('own_photo_used', { calibration: method === 'corners' ? 'object' : method, ...eventData });
  };

  const trim = useCallback((ratio: number) => {
    setCalibration(c => {
      if (!c?.ppcm) return c;
      const ppcm = Math.max(0.3, c.ppcm * ratio);
      return { ...c, ppcm, h: scaleOnlyHomography(ppcm) };
    });
    setPose(p => ({ ...p, cx: p.cx / ratio, cy: p.cy / ratio }));
  }, []);

  useEffect(() => setPoints([]), [method]);

  if (!backdrop) {
    return (
      <div className="space-y-3">
        <div className="grid place-items-center gap-4 rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center">
          <p className="max-w-xs text-sm text-muted-foreground">Photograph your wall straight on, with something of known size in view.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-burgundy px-5 text-sm font-medium text-cream focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-burgundy">
              <Camera className="h-4 w-4" aria-hidden /> Take photo
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
            </label>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-burgundy">
              <ImagePlus className="h-4 w-4" aria-hidden /> Upload
              <input type="file" accept="image/*" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
            </label>
          </div>
          {busy && <p role="status" className="text-sm text-muted-foreground">Opening photo</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <PrivacyNote />
      </div>
    );
  }

  if (!calibration) {
    const needs = method === 'object' ? 2 : method === 'corners' ? 4 : 0;
    const hint = method === 'object' ? 'Tap both ends of something you know the length of.' : method === 'corners' ? 'Tap the four corners in order: top-left, top-right, bottom-right, bottom-left.' : 'Enter how wide the wall in this photo is.';
    return (
      <div className="space-y-3">
        <Row label="Scale method">
          <Chip active={method === 'object'} onClick={() => setMethod('object')}>Known object</Chip>
          <Chip active={method === 'width'} onClick={() => setMethod('width')}>Wall width</Chip>
          <Chip active={method === 'corners'} onClick={() => setMethod('corners')}>Angled photo</Chip>
        </Row>
        <p className="text-sm text-muted-foreground">{hint}</p>
        {needs > 0 && (
          <CalibrationStage
            backdrop={backdrop}
            points={points}
            maxPoints={needs}
            onPoints={setPoints}
            labels={needs === 2 ? ['A', 'B'] : ['TL', 'TR', 'BR', 'BL']}
            label="Photo. Tap to place marker points; drag a marker to adjust."
          />
        )}
        {method === 'object' && (
          <>
            <Row label="What you marked">
              {CALIBRATION_PRESETS.map(p => <Chip key={p.id} active={p.id === presetId} onClick={() => setPresetId(p.id)}>{p.label}</Chip>)}
            </Row>
            {preset.lengthCm === null && <NumberField label="Length in cm" value={customLength} onChange={setCustomLength} />}
          </>
        )}
        {method === 'width' && <NumberField label="Wall width in cm" value={wallWidth} onChange={setWallWidth} />}
        {method === 'corners' && (
          <div className="flex gap-3">
            <NumberField label="Width in cm" value={rectW} onChange={setRectW} />
            <NumberField label="Height in cm" value={rectH} onChange={setRectH} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!computed} onClick={startPlacing} className="min-h-11 rounded-full bg-burgundy px-6 text-sm font-medium text-cream transition-opacity disabled:opacity-40">
            Place the piece
          </button>
          <button type="button" onClick={() => setBackdrop(null)} className="min-h-11 px-2 text-sm text-muted-foreground underline underline-offset-4">Use another photo</button>
        </div>
        <PrivacyNote />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border">
        <WallCanvas
          ref={canvasRef}
          backdrop={backdrop}
          wallToImage={calibration.h}
          outline={outline}
          finish={finish}
          pose={pose}
          light={light!}
          overlays={{ dimensions: true }}
          onPoseChange={setPose}
          onPinchScale={calibration.ppcm ? trim : undefined}
          label="Your wall with the piece. Drag to move, twist with two fingers to rotate, arrow keys nudge."
          className="block"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip onClick={() => setPose(p => ({ ...p, rotationDeg: p.rotationDeg - 1 }))} label="Rotate left"><RotateCcw className="h-4 w-4" /></Chip>
        <Chip onClick={() => setPose(p => ({ ...p, rotationDeg: p.rotationDeg + 1 }))} label="Rotate right"><RotateCw className="h-4 w-4" /></Chip>
        <Chip onClick={() => setPose(p => ({ ...p, rotationDeg: 0 }))}>Level</Chip>
        <Chip onClick={() => setCalibration(null)}>Recalibrate</Chip>
        <Chip onClick={() => { setBackdrop(null); setCalibration(null); }}>New photo</Chip>
      </div>
      <p className="text-xs text-muted-foreground">{calibration.ppcm ? 'Pinch to fine-tune the scale. ' : ''}Light and shadow follow your photo.</p>
      <PrivacyNote />
    </div>
  );
}

function PrivacyNote() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" aria-hidden /> Your photo stays on this device and is never uploaded.</p>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block flex-1 text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <input
        type="number" inputMode="decimal" min={1} value={value} onChange={e => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-border bg-card px-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-burgundy"
      />
    </label>
  );
}
