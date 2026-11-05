/**
 * My Space data access: `users/{uid}/spaces/{spaceId}` in Firestore (owner-only rules, walls kept as an
 * array on the space document: at most 8 small objects, always read and written together) and the wall
 * photos in Storage. The query cache is the single store, so every screen sees the same spaces.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, deleteDoc, doc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { stripUndefined } from '@/lib/data/optimistic';
import type { SpaceDoc, SpaceWall } from '@/types/consultation';
import { deleteImage, uploadImage } from './photoStorage';
import { normalizeSpace } from './spaceModel';

const spacesKey = (uid: string | undefined) => ['spaces', uid ?? 'none'] as const;

async function fetchSpaces(uid: string): Promise<SpaceDoc[]> {
  const snap = await getDocs(query(collection(db, 'users', uid, 'spaces'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => normalizeSpace(d.id, d.data()));
}

export function useSpaces(uid: string | undefined) {
  return useQuery({ queryKey: spacesKey(uid), queryFn: () => fetchSpaces(uid!), enabled: !!uid, staleTime: 60_000 });
}

export function useSpace(uid: string | undefined, spaceId: string | undefined) {
  const { data, ...rest } = useSpaces(uid);
  return { ...rest, space: data?.find(s => s.id === spaceId) };
}

export function useSpaceActions(uid: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: spacesKey(uid) });

  const saveSpace = async (space: SpaceDoc) => {
    await setDoc(doc(db, 'users', uid, 'spaces', space.id), stripUndefined({ ...space, updatedAt: Date.now() }));
    await refresh();
  };

  /** Uploads the photo first, so a failed upload never leaves a wall pointing at a missing file. */
  const saveWallWithPhoto = async (space: SpaceDoc, wall: SpaceWall, photo: Blob | null) => {
    if (photo && wall.photoPath) await uploadImage(wall.photoPath, photo);
    const exists = space.walls.some(w => w.id === wall.id);
    await saveSpace({ ...space, walls: exists ? space.walls.map(w => (w.id === wall.id ? wall : w)) : [...space.walls, wall] });
  };

  const removeWall = async (space: SpaceDoc, wall: SpaceWall) => {
    await saveSpace({ ...space, walls: space.walls.filter(w => w.id !== wall.id) });
    if (wall.photoPath) await deleteImage(wall.photoPath).catch(err => console.warn('[spaces] could not delete wall photo', err));
  };

  const removeSpace = async (space: SpaceDoc) => {
    await deleteDoc(doc(db, 'users', uid, 'spaces', space.id));
    await Promise.all(space.walls.filter(w => w.photoPath).map(w => deleteImage(w.photoPath!).catch(err => console.warn('[spaces] could not delete wall photo', err))));
    await refresh();
  };

  return { saveSpace, saveWallWithPhoto, removeWall, removeSpace };
}
