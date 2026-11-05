import { useEffect, useMemo, useState } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import { CalibrationStage } from '@/components/wall-preview/CalibrationStage';
import { Chip, Row } from '@/components/wall-preview/controls';
import { backdropFromUrl, type Backdrop } from '@/components/wall-preview/render/backdrop';
import { CALIBRATION_PRESETS, pxPerCmFromTwoPoints, wallSizeFromScale } from '@/lib/wallPreview/calibration';
import type { Point } from '@/lib/wallPreview/types';
import { preparePhoto, type PreparedPhoto } from '@/lib/spaces/photoStorage';
import { buildWall, newId, wallInputError, wallPhotoPath } from '@/lib/spaces/spaceModel';
import { usePhotoUrl } from '@/lib/spaces/usePhotoUrl';
import type { SpaceDoc, SpaceWall } from '@/types/consultation';

interface Props {
  uid: string;
  space: SpaceDoc;
  /** Wall being edited; omit to add a new one. */
  wall?: SpaceWall;
  onSave: (wall: SpaceWall, photo: Blob | null) => Promise<void>;
  onCancel: () => void;
}

type Method = 'type' | 'measure';

const asNumber = (v: string) => (v.trim() === '' ? NaN : Number(v));

/** One wall: a photo, its size in cm (typed, or measured by marking something of known length), and notes. */
export function WallEditor({ uid, space, wall, onSave, onCancel }: Props) {
  const [wallId] = useState(() => wall?.id ?? newId());
  const [name, setName] = useState(wall?.name ?? `Wall ${space.walls.length + 1}`);
  const [notes, setNotes] = useState(wall?.notes ?? '');
  const [widthCm, setWidthCm] = useState(wall ? String(wall.widthCm) : '');
  const [heightCm, setHeightCm] = useState(wall ? String(wall.heightCm) : '');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [method, setMethod] = useState<Method>('type');
  const [points, setPoints] = useState<Point[]>([]);
  const [presetId, setPresetId] = useState(CALIBRATION_PRESETS[0].id);
  const [customLength, setCustomLength] = useState('');
  const [existingBackdrop, setExistingBackdrop] = useState<Backdrop | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const existing = usePhotoUrl(wall?.photoPath, !photo);
  useEffect(() => {
    if (!existing.url || photo) return;
    let cancelled = false;
    backdropFromUrl(existing.url).then(b => !cancelled && setExistingBackdrop(b)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [existing.url, photo]);

  const backdrop = photo?.backdrop ?? existingBackdrop;
  const preset = CALIBRATION_PRESETS.find(p => p.id === presetId)!;
  const knownLength = preset.lengthCm ?? asNumber(customLength);
  const measuredScale = useMemo(
    () => (method === 'measure' && points.length === 2 ? pxPerCmFromTwoPoints(points[0], points[1], knownLength) : null),
    [method, points, knownLength],
  );
  const measuredSize = backdrop && measuredScale ? wallSizeFromScale(backdrop.width, backdrop.height, measuredScale) : null;

  // A measurement fills the size fields (still editable): the photo covers this much wall.
  useEffect(() => {
    if (!measuredSize) return;
    setWidthCm(String(measuredSize.widthCm));
    setHeightCm(String(measuredSize.heightCm));
  }, [measuredSize]);

  const [newPhotoUrl, setNewPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) return setNewPhotoUrl(null);
    const url = URL.createObjectURL(photo.blob);
    setNewPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setPhoto(await preparePhoto(file));
      setPoints([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That image could not be opened. Try a JPG or PNG photo.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const input = { name, widthCm: asNumber(widthCm), heightCm: asNumber(heightCm), notes };
    const problem = wallInputError(input);
    if (problem) return setError(problem);
    const photoInfo = photo
      ? { path: wallPhotoPath(uid, space.id, wallId), width: photo.width, height: photo.height }
      : wall?.photoPath ? { path: wall.photoPath, width: wall.photoWidth ?? 1, height: wall.photoHeight ?? 1 } : null;
    // Keep the stored scale when only the notes or name changed; a new photo or a new measurement sets it again.
    const keepScale = !photo && wall?.pxPerCm && wall.widthCm === Math.round(input.widthCm) ? wall.pxPerCm : null;
    const built = buildWall(wallId, input, photoInfo, measuredScale ?? keepScale);
    setSaving(true);
    setError('');
    try {
      await onSave(built, photo?.blob ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this wall. Please try again.');
      setSaving(false);
    }
  };

  const previewUrl = newPhotoUrl ?? existing.url;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {previewUrl ? (
          method === 'measure' && backdrop ? (
            <CalibrationStage backdrop={backdrop} points={points} maxPoints={2} onPoints={setPoints} labels={['A', 'B']} label="Wall photo. Tap both ends of something you know the length of." />
          ) : (
            <img src={previewUrl} alt="Wall photo" className="max-h-72 w-full rounded-xl border border-border object-contain" />
          )
        ) : (
          <div className="grid place-items-center rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Photograph the wall straight on.
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <label className="btn-primary cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-burgundy">
            <Camera className="h-4 w-4" aria-hidden /> Take photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
          </label>
          <label className="btn-secondary cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-burgundy">
            <ImagePlus className="h-4 w-4" aria-hidden /> {photo || wall?.photoPath ? 'Replace' : 'Upload'}
            <input type="file" accept="image/*" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
          </label>
          {busy && <span role="status" className="self-center text-sm text-muted-foreground">Preparing photo</span>}
        </div>
      </div>

      {backdrop && (
        <div className="space-y-3">
          <Row label="How to set the size">
            <Chip active={method === 'type'} onClick={() => setMethod('type')}>Type the size</Chip>
            <Chip active={method === 'measure'} onClick={() => { setMethod('measure'); setPoints([]); }}>Measure from photo</Chip>
          </Row>
          {method === 'measure' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Tap both ends of something you know the length of, then say what it is.</p>
              <Row label="What you marked">
                {CALIBRATION_PRESETS.map(p => <Chip key={p.id} active={p.id === presetId} onClick={() => setPresetId(p.id)}>{p.label}</Chip>)}
              </Row>
              {preset.lengthCm === null && (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Length in cm</span>
                  <input type="number" inputMode="decimal" min={1} value={customLength} onChange={e => setCustomLength(e.target.value)} className="field" />
                </label>
              )}
              {measuredSize && <p role="status" className="text-sm">The photo shows about {measuredSize.widthCm} × {measuredSize.heightCm} cm of wall.</p>}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-muted-foreground">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={80} className="field" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Wall width (cm){backdrop ? ', as shown in the photo' : ''}</span>
          <input type="number" inputMode="decimal" min={1} value={widthCm} onChange={e => setWidthCm(e.target.value)} className="field" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Wall height (cm)</span>
          <input type="number" inputMode="decimal" min={1} value={heightCm} onChange={e => setHeightCm(e.target.value)} className="field" />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-muted-foreground">Notes: furniture below, colours, anything we should know</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={1000} className="field" />
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" onClick={save} disabled={saving || busy} className="btn-primary">{saving ? 'Saving…' : 'Save wall'}</button>
      </div>
    </div>
  );
}
