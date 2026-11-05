/**
 * Customer-side calls for the post-purchase APIs (API.md: order-status, order-cancel, return-request, invoice).
 * Access mirrors the server: a signed-in owner sends a bearer token; guests identify the order by its email.
 */
import { fetchPublicOrderStatus } from '@/lib/data/orders';
import { auth, app } from '@/lib/firebase';

export interface OrderActionState {
  paymentMethod?: 'prepaid' | 'cod' | 'replacement';
  invoiceNumber?: string | null;
  canCancel: boolean;
  returnEligibleUntil: number | null;
  trackingUrl?: string;
}

export const RETURN_REASONS = [
  { id: 'damaged', label: 'Arrived damaged', needsPhoto: true },
  { id: 'defective', label: 'Manufacturing defect', needsPhoto: true },
  { id: 'wrong_item', label: 'Wrong item', needsPhoto: false },
  { id: 'not_as_described', label: 'Not as described', needsPhoto: false },
  { id: 'changed_mind', label: 'Changed my mind', needsPhoto: false },
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number]['id'];

export const MAX_RETURN_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

async function headers(json = true): Promise<Record<string, string>> {
  const h: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
  const user = auth.currentUser;
  if (user) h.Authorization = `Bearer ${await user.getIdToken()}`;
  return h;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !body || body.success === false) {
    throw new Error((body?.message as string) || (body?.error as string) || `Request failed (${res.status}).`);
  }
  return body;
}

/** The action fields (canCancel, returnEligibleUntil, invoiceNumber, paymentMethod) come from the same API summary as every other customer lookup. */
export async function fetchOrderActionState(orderId: string, email?: string): Promise<OrderActionState> {
  const s = await fetchPublicOrderStatus(orderId, email);
  return {
    paymentMethod: s.paymentMethod,
    invoiceNumber: s.invoiceNumber ?? null,
    canCancel: s.canCancel === true,
    returnEligibleUntil: s.returnEligibleUntil ?? null,
    trackingUrl: s.tracking?.url,
  };
}

export async function cancelOrder(orderId: string, email: string | undefined, reason: string): Promise<string> {
  const body = await readJson(await fetch('/api/order-cancel', {
    method: 'POST', headers: await headers(), body: JSON.stringify({ orderId, email, reason: reason || undefined }),
  }));
  return (body.message as string) || 'Your order has been cancelled.';
}

/** Uploads up to 3 images to `returns/{orderId}/...` (storage.rules: owner or verified email, images up to 5 MB) and returns their paths. */
export async function uploadReturnPhotos(orderId: string, files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  if (!auth.currentUser) throw new Error('Please sign in with the email used for this order to add photos.');
  const { getStorage, ref, uploadBytes, connectStorageEmulator } = await import('firebase/storage');
  const storage = getStorage(app);
  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    try { connectStorageEmulator(storage, import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1', 9199); } catch { /* already connected */ }
  }
  return Promise.all(files.map(async (file, i) => {
    const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-60);
    const path = `returns/${orderId}/${Date.now()}-${i}-${safe}`;
    await uploadBytes(ref(storage, path), file, { contentType: file.type });
    return path;
  }));
}

export async function requestReturn(input: { orderId: string; email?: string; reason: ReturnReason; details: string; photoPaths: string[] }): Promise<void> {
  await readJson(await fetch('/api/return-request', {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ ...input, details: input.details || undefined, photoPaths: input.photoPaths.length ? input.photoPaths : undefined }),
  }));
}

/** Fetches the tax invoice PDF and hands it to the browser as a download. */
export async function downloadInvoice(orderId: string, email: string | undefined, number: string): Promise<void> {
  const params = new URLSearchParams({ orderId });
  if (email) params.set('email', email);
  const res = await fetch(`/api/invoice?${params.toString()}`, { headers: await headers(false) });
  if (!res.ok) await readJson(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${number}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
