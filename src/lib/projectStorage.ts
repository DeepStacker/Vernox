/**
 * Saved studio projects and the crash-safe autosave, in this browser's localStorage
 * (safeStorage). Projects hold studio documents (schema v4). Projects saved by the old
 * raster editor (key `metalshape-projects`) are migrated once into plate-only documents
 * — their shape, size and finish — since their image layers have no cut geometry.
 */
import { createDocument } from './studio/document';
import { FINISH_PRESETS } from './studio/materials';
import { studioDocumentSchema, type StudioDocument } from './studio/schema';
import { safeLocal } from './safeStorage';

const STORAGE_KEY = 'vernox-studio-projects';
const LEGACY_KEY = 'metalshape-projects';
const AUTOSAVE_KEY = 'vernox-studio-autosave';
const MAX_PROJECTS = 30;

export interface SavedProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  doc: StudioDocument;
}

interface LegacyProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  state?: { selectedShapeId?: string; shapeWidth?: number; shapeHeight?: number; shapeCornerRadius?: number; metalFinish?: string };
}

function migrateLegacy(p: LegacyProject): SavedProject {
  const s = p.state ?? {};
  const finish = s.metalFinish === 'stainless' || s.metalFinish === 'brass' || s.metalFinish === 'copper' || s.metalFinish === 'gold' || s.metalFinish === 'corten'
    ? (s.metalFinish === 'corten' ? 'corten_rust' : s.metalFinish)
    : 'black_patina';
  const doc = createDocument({
    name: p.name,
    plate: {
      shapeId: s.selectedShapeId ?? 'rectangle',
      widthMm: s.shapeWidth && s.shapeWidth > 0 ? s.shapeWidth : 300,
      heightMm: s.shapeHeight && s.shapeHeight > 0 ? s.shapeHeight : 200,
      cornerRadiusMm: s.shapeCornerRadius ?? 0,
    },
    material: { finish: finish in FINISH_PRESETS ? finish : 'black_patina' },
  });
  return { id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, doc };
}

function readAll(): SavedProject[] {
  const raw = safeLocal.getJson<unknown[]>(STORAGE_KEY, []);
  const projects: SavedProject[] = [];
  for (const entry of raw) {
    const p = entry as SavedProject;
    const parsed = studioDocumentSchema.safeParse(p?.doc);
    if (parsed.success) projects.push({ ...p, doc: parsed.data });
  }
  const legacy = safeLocal.getJson<LegacyProject[]>(LEGACY_KEY, []);
  if (legacy.length > 0) {
    const migrated = legacy.filter(l => l && l.id && !projects.some(p => p.id === l.id)).map(migrateLegacy);
    projects.push(...migrated);
    if (safeLocal.setJson(STORAGE_KEY, projects)) safeLocal.remove(LEGACY_KEY);
  }
  return projects;
}

export function listProjects(): SavedProject[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveProject(name: string, doc: StudioDocument, id?: string): SavedProject {
  const projects = readAll();
  const now = Date.now();
  const stored: StudioDocument = { ...doc, name, production: undefined };
  const idx = id ? projects.findIndex(p => p.id === id) : -1;
  let project: SavedProject;
  if (idx >= 0) {
    project = { ...projects[idx], name, doc: stored, updatedAt: now };
    projects[idx] = project;
  } else {
    project = { id: doc.id, name, doc: stored, createdAt: now, updatedAt: now };
    projects.push(project);
  }
  const trimmed = projects.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PROJECTS);
  if (!safeLocal.setJson(STORAGE_KEY, trimmed)) throw new Error('Could not save the project: browser storage is unavailable or full.');
  return project;
}

export function deleteProject(id: string) {
  safeLocal.setJson(STORAGE_KEY, readAll().filter(p => p.id !== id));
}

export function loadProject(id: string): SavedProject | null {
  return readAll().find(p => p.id === id) ?? null;
}

/** Writes the working document (crash-safe recovery). Returns false when storage is unavailable. */
export function writeAutosave(doc: StudioDocument): boolean {
  return safeLocal.setJson(AUTOSAVE_KEY, { savedAt: Date.now(), doc: { ...doc, production: undefined } });
}

export function readAutosave(): { savedAt: number; doc: StudioDocument } | null {
  const raw = safeLocal.getJson<{ savedAt?: number; doc?: unknown } | null>(AUTOSAVE_KEY, null);
  if (!raw?.doc) return null;
  const parsed = studioDocumentSchema.safeParse(raw.doc);
  return parsed.success ? { savedAt: raw.savedAt ?? 0, doc: parsed.data } : null;
}

export function clearAutosave() {
  safeLocal.remove(AUTOSAVE_KEY);
}
