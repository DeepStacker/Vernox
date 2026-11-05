/**
 * My Space: pure helpers for spaces and their walls (no Firebase, no React), so the rules the UI
 * and the tests rely on live in one place. Document shapes: src/types/consultation.ts.
 */
import { MAX_WALLS_PER_SPACE, type BudgetBandId, type SpaceDoc, type SpaceWall } from '@/types/consultation';
import { pxPerCmFromWallWidth } from '@/lib/wallPreview/calibration';

export const MIN_WALL_CM = 30;
export const MAX_WALL_WIDTH_CM = 3000;
export const MAX_WALL_HEIGHT_CM = 1500;

/** Random id safe for Firestore document ids and Storage file names (`[A-Za-z0-9_-]`). */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

export function newSpace(input: { name: string; roomType: string; budgetBand?: BudgetBandId | null; notes?: string }, now = Date.now()): SpaceDoc {
  return {
    id: newId(),
    name: input.name.trim().slice(0, 80),
    roomType: input.roomType,
    budgetBand: input.budgetBand ?? null,
    notes: (input.notes ?? '').trim().slice(0, 2000),
    walls: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const wallPhotoPath = (uid: string, spaceId: string, wallId: string) => `spaces/${uid}/${spaceId}/${wallId}.jpg`;

export interface WallInput {
  name: string;
  widthCm: number;
  heightCm: number;
  notes: string;
}

/** Message for the first problem with typed wall dimensions, or null when they are usable. */
export function wallInputError(input: Pick<WallInput, 'widthCm' | 'heightCm'>): string | null {
  const { widthCm, heightCm } = input;
  if (!Number.isFinite(widthCm) || !Number.isFinite(heightCm) || widthCm <= 0 || heightCm <= 0) return 'Enter the wall width and height in cm.';
  if (widthCm < MIN_WALL_CM || heightCm < MIN_WALL_CM) return `A wall should be at least ${MIN_WALL_CM} cm each way.`;
  if (widthCm > MAX_WALL_WIDTH_CM || heightCm > MAX_WALL_HEIGHT_CM) return `That is larger than ${MAX_WALL_WIDTH_CM} × ${MAX_WALL_HEIGHT_CM} cm. Check the numbers.`;
  return null;
}

export interface WallPhoto {
  path: string;
  width: number;
  height: number;
}

/**
 * Builds a wall. When the dimensions were typed, the photo is taken to show the wall edge to edge, so its
 * scale is photo width / wall width. When they were measured from a known object, the caller passes that
 * scale (`pxPerCm`) and the dimensions are the area the photo covers.
 */
export function buildWall(id: string, input: WallInput, photo: WallPhoto | null, pxPerCm: number | null): SpaceWall {
  const scale = photo ? (pxPerCm ?? pxPerCmFromWallWidth(photo.width, input.widthCm)) : null;
  return {
    id,
    name: input.name.trim().slice(0, 80) || 'Wall',
    widthCm: Math.round(input.widthCm),
    heightCm: Math.round(input.heightCm),
    pxPerCm: scale,
    photoPath: photo?.path ?? null,
    photoWidth: photo?.width ?? null,
    photoHeight: photo?.height ?? null,
    notes: input.notes.trim().slice(0, 1000),
  };
}

/** Whether a wall can be opened in the wall preview (it has a photo and a usable scale). */
export function wallIsPreviewable(wall: SpaceWall): wall is SpaceWall & { photoPath: string; pxPerCm: number } {
  return !!wall.photoPath && typeof wall.pxPerCm === 'number' && wall.pxPerCm > 0;
}

export function canAddWall(space: Pick<SpaceDoc, 'walls'>): boolean {
  return space.walls.length < MAX_WALLS_PER_SPACE;
}

/** A space as stored; anything unexpected is dropped so one bad document never breaks the list. */
export function normalizeSpace(id: string, raw: Record<string, unknown>): SpaceDoc {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const walls = Array.isArray(raw.walls) ? raw.walls : [];
  return {
    id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'My space',
    roomType: typeof raw.roomType === 'string' ? raw.roomType : 'living',
    budgetBand: typeof raw.budgetBand === 'string' ? (raw.budgetBand as BudgetBandId) : null,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    walls: walls
      .map((w: Record<string, unknown>) => ({
        id: String(w.id ?? ''),
        name: typeof w.name === 'string' && w.name ? w.name : 'Wall',
        widthCm: num(w.widthCm, 0),
        heightCm: num(w.heightCm, 0),
        pxPerCm: typeof w.pxPerCm === 'number' && w.pxPerCm > 0 ? w.pxPerCm : null,
        photoPath: typeof w.photoPath === 'string' ? w.photoPath : null,
        photoWidth: typeof w.photoWidth === 'number' ? w.photoWidth : null,
        photoHeight: typeof w.photoHeight === 'number' ? w.photoHeight : null,
        notes: typeof w.notes === 'string' ? w.notes : '',
      }))
      .filter(w => w.id),
    createdAt: num(raw.createdAt, 0),
    updatedAt: num(raw.updatedAt, 0),
  };
}

/** A space can be sent for design help once it has a wall with a photo (the server checks again). */
export function spaceReadyForConsultation(space: Pick<SpaceDoc, 'walls'>): boolean {
  return space.walls.some(w => !!w.photoPath);
}
