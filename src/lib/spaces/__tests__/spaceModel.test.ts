import { describe, expect, it } from 'vitest';
import { wallSizeFromScale, pxPerCmFromTwoPoints } from '@/lib/wallPreview/calibration';
import { buildWall, newSpace, normalizeSpace, spaceReadyForConsultation, wallInputError, wallIsPreviewable, wallPhotoPath } from '../spaceModel';

describe('wall measurements from a photo scale', () => {
  it('turns a marked A4 sheet into the wall area the photo covers', () => {
    // A4 long side (29.7 cm) marked over 297 px: 10 px per cm; a 1200 x 960 photo shows 120 x 96 cm.
    const ppcm = pxPerCmFromTwoPoints({ x: 0, y: 0 }, { x: 297, y: 0 }, 29.7)!;
    expect(wallSizeFromScale(1200, 960, ppcm)).toEqual({ widthCm: 120, heightCm: 96 });
  });

  it('rejects an unusable scale or image size', () => {
    expect(wallSizeFromScale(1200, 960, 0)).toBeNull();
    expect(wallSizeFromScale(0, 960, 4)).toBeNull();
  });
});

describe('walls', () => {
  it('validates typed dimensions', () => {
    expect(wallInputError({ widthCm: 300, heightCm: 240 })).toBeNull();
    expect(wallInputError({ widthCm: NaN, heightCm: 240 })).toMatch(/Enter the wall/);
    expect(wallInputError({ widthCm: 10, heightCm: 240 })).toMatch(/at least/);
    expect(wallInputError({ widthCm: 5000, heightCm: 240 })).toMatch(/larger than/);
  });

  it('derives the photo scale from the typed width when nothing was measured', () => {
    const photo = { path: wallPhotoPath('u1', 's1', 'w1'), width: 1200, height: 900 };
    const wall = buildWall('w1', { name: ' ', widthCm: 300, heightCm: 225, notes: ' sofa below ' }, photo, null);
    expect(wall).toMatchObject({ name: 'Wall', pxPerCm: 4, photoPath: 'spaces/u1/s1/w1.jpg', notes: 'sofa below' });
    expect(wallIsPreviewable(wall)).toBe(true);
  });

  it('keeps a measured scale, and has no scale without a photo', () => {
    const photo = { path: 'spaces/u1/s1/w1.jpg', width: 1200, height: 900 };
    expect(buildWall('w1', { name: 'A', widthCm: 120, heightCm: 90, notes: '' }, photo, 10).pxPerCm).toBe(10);
    const bare = buildWall('w2', { name: 'B', widthCm: 120, heightCm: 90, notes: '' }, null, null);
    expect(bare.pxPerCm).toBeNull();
    expect(wallIsPreviewable(bare)).toBe(false);
  });
});

describe('spaces', () => {
  it('creates an empty space with trimmed fields', () => {
    const space = newSpace({ name: '  Living room ', roomType: 'living', budgetBand: '10k_25k' }, 5);
    expect(space).toMatchObject({ name: 'Living room', walls: [], createdAt: 5, budgetBand: '10k_25k' });
    expect(space.id).toMatch(/^[a-z0-9]{9}$/);
  });

  it('is ready for a consultation only with a photographed wall', () => {
    expect(spaceReadyForConsultation({ walls: [] })).toBe(false);
    const bare = buildWall('w', { name: 'A', widthCm: 100, heightCm: 100, notes: '' }, null, null);
    expect(spaceReadyForConsultation({ walls: [bare] })).toBe(false);
    expect(spaceReadyForConsultation({ walls: [{ ...bare, photoPath: 'spaces/u/s/w.jpg' }] })).toBe(true);
  });

  it('normalises a stored document, dropping malformed walls', () => {
    const space = normalizeSpace('s1', { name: 'Hall', roomType: 'entrance', walls: [{ id: 'w1', widthCm: 200, heightCm: 100, pxPerCm: -1 }, { widthCm: 1 }] });
    expect(space.walls).toHaveLength(1);
    expect(space.walls[0]).toMatchObject({ id: 'w1', name: 'Wall', pxPerCm: null, photoPath: null });
  });
});
