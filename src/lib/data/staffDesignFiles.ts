/**
 * Design files for custom lines of staff-entered orders, in Firebase Storage (storage.rules `staff-designs/`):
 * uploaded from Admin > New order under a draft id (the order does not exist yet), downloaded by order staff
 * (job sheet, Production console) with a normal download URL. Files are immutable once stored.
 * SVG can carry script, so files are only ever offered as downloads (never inlined into the page); storage is imported lazily.
 */
import { useQuery } from '@tanstack/react-query';
import { appStorage } from '@/lib/appStorage';
import {
  MAX_STAFF_DESIGN_FILE_BYTES,
  STAFF_DESIGN_FILE_TYPES,
  type DesignFile,
  type StaffDesignContentType,
} from '@/types/staffOrders';

const EXTENSION_TYPES: Record<string, StaffDesignContentType> = {
  svg: 'image/svg+xml',
  dxf: 'application/dxf',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const STAFF_DESIGN_FILE_ACCEPT = Object.keys(EXTENSION_TYPES).map(ext => `.${ext}`).join(',');

/** A new id for one order's uploads (storage.rules: 16-64 characters of [A-Za-z0-9_-]). */
export const newDesignDraftId = () => `d-${crypto.randomUUID()}`;

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** The browser's reported type is unreliable for DXF, so the type comes from the extension. Returns an error message, or null when fine. */
export function checkDesignFile(file: File): string | null {
  if (!EXTENSION_TYPES[extensionOf(file.name)]) return `${file.name}: use SVG, DXF, PDF, PNG, JPEG or WebP.`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_STAFF_DESIGN_FILE_BYTES) return `${file.name} is larger than ${MAX_STAFF_DESIGN_FILE_BYTES / 1024 / 1024} MB.`;
  return null;
}

/** Uploads one design file under the draft and returns the reference stored on the order line. */
export async function uploadDesignFile(draftId: string, file: File): Promise<DesignFile> {
  const problem = checkDesignFile(file);
  if (problem) throw new Error(problem);
  const contentType = EXTENSION_TYPES[extensionOf(file.name)];
  const path = `staff-designs/${draftId}/${crypto.randomUUID().slice(0, 12)}.${STAFF_DESIGN_FILE_TYPES[contentType]}`;
  const { ref, uploadBytes } = await import('firebase/storage');
  await uploadBytes(ref(await appStorage(), path), file, { contentType });
  return { path, name: file.name.slice(0, 120), contentType };
}

/** A download URL for one stored design file (shared by the job sheet and the Production console). */
export function useDesignFileUrl(path: string) {
  return useQuery({
    queryKey: ['admin', 'design-file', path],
    queryFn: async () => {
      const { ref, getDownloadURL } = await import('firebase/storage');
      return getDownloadURL(ref(await appStorage(), path));
    },
    staleTime: 30 * 60_000,
    retry: false,
  });
}
