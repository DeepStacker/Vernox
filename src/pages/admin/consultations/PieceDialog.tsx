import { useEffect, useMemo, useState } from 'react';
import { WallPreview, type WallComposition } from '@/components/wall-preview';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Segmented, Field } from '@/components/admin/AdminUi';
import { useCatalog } from '@/lib/catalogContext';
import { listProjects } from '@/lib/projectStorage';
import { newId, wallIsPreviewable } from '@/lib/spaces/spaceModel';
import { usePhotoUrl } from '@/lib/spaces/usePhotoUrl';
import type { Outline } from '@/lib/wallPreview/types';
import type { ConsultationDoc, ProposalItem } from '@/types/consultation';

interface Props {
  open: boolean;
  consultation: ConsultationDoc;
  onClose: () => void;
  /** Receives the item (preview not yet stored) and the composed preview image. */
  onAdd: (item: ProposalItem, preview: Blob) => Promise<void>;
}

type Source = 'catalogue' | 'custom';

interface CustomDesign {
  name: string;
  outline: Outline;
  finish: string;
  designRef: string;
}

/** Loads a studio document into what the preview and the cart line need; throws a readable message when it cannot be ordered. */
async function loadCustomDesign(json: string): Promise<CustomDesign> {
  const { parseStudioDocument, ensureOutlines, getDesignOutlineForPreview, serializeForOrder, toCartLine } = await import('@/lib/studio/api');
  const doc = await ensureOutlines(parseStudioDocument(JSON.parse(json)));
  toCartLine(doc); // throws when the design is not orderable or cannot be priced
  return { name: doc.name || 'Custom design', outline: getDesignOutlineForPreview(doc), finish: doc.material.finish, designRef: serializeForOrder(doc) };
}

/** One proposal piece: choose a catalogue product or a studio design, then place it on a customer wall photo. */
export function PieceDialog({ open, consultation, onClose, onAdd }: Props) {
  const { products } = useCatalog();
  const walls = useMemo(() => consultation.walls.filter(wallIsPreviewable), [consultation.walls]);
  const [wallId, setWallId] = useState(walls[0]?.id ?? '');
  const wall = walls.find(w => w.id === wallId) ?? walls[0];
  const photo = usePhotoUrl(wall?.photoPath, open && consultation.photosReady);

  const [source, setSource] = useState<Source>('catalogue');
  const choices = useMemo(() => products.filter(p => p.sizes.length > 0), [products]);
  const [productId, setProductId] = useState('');
  const product = choices.find(p => p.id === productId) ?? choices[0];

  const projects = useMemo(() => (open ? listProjects() : []), [open]);
  const [projectId, setProjectId] = useState('');
  const [pasted, setPasted] = useState('');
  const [custom, setCustom] = useState<CustomDesign | null>(null);
  const [customError, setCustomError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { if (!wallId && walls[0]) setWallId(walls[0].id); }, [walls, wallId]);

  useEffect(() => {
    setCustom(null);
    setCustomError('');
    if (source !== 'custom') return;
    const json = pasted.trim() || (projectId ? JSON.stringify(projects.find(p => p.id === projectId)?.doc ?? null) : '');
    if (!json || json === 'null') return;
    let cancelled = false;
    loadCustomDesign(json)
      .then(d => !cancelled && setCustom(d))
      .catch(err => !cancelled && setCustomError(err instanceof Error && err.message.startsWith('DESIGN_') ? 'This design cannot be ordered as it is. Open it in the studio and fix the warnings.' : 'This is not valid studio design data.'));
    return () => { cancelled = true; };
  }, [source, projectId, pasted, projects]);

  const done = async (r: WallComposition) => {
    if (!wall) return;
    setError('');
    const item: ProposalItem =
      source === 'catalogue' && product
        ? {
            id: newId(), wallId: wall.id, kind: 'catalogue', productId: product.id, productName: product.name,
            sizeLabel: r.size?.label ?? null, widthMm: r.widthMm, heightMm: r.heightMm, finish: r.finish, designRef: null,
            pose: r.pose, previewPath: null, note: '',
          }
        : {
            id: newId(), wallId: wall.id, kind: 'custom', productId: null, productName: custom!.name,
            sizeLabel: null, widthMm: Math.round(r.widthMm), heightMm: Math.round(r.heightMm), finish: custom!.finish, designRef: custom!.designRef,
            pose: r.pose, previewPath: null, note: '',
          };
    try {
      await onAdd(item, r.blob);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this piece.');
    }
  };

  const ready = !!wall && !!photo.url && (source === 'catalogue' ? !!product : !!custom);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[94dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add a piece</DialogTitle>
          <DialogDescription>Choose the piece, place it on the customer's wall, then confirm the placement.</DialogDescription>
        </DialogHeader>

        {walls.length === 0 ? (
          <p className="text-sm text-muted-foreground">None of this consultation's walls has a photo and a scale, so a piece cannot be placed.</p>
        ) : !consultation.photosReady ? (
          <p role="alert" className="text-sm text-destructive">The wall photos are not copied yet. Claim the consultation again to retry.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Wall">
                <select value={wall?.id ?? ''} onChange={e => setWallId(e.target.value)} className="field">
                  {walls.map(w => <option key={w.id} value={w.id}>{w.name} ({w.widthCm} × {w.heightCm} cm)</option>)}
                </select>
              </Field>
              <div className="space-y-1 text-sm">
                <span className="font-semibold">Piece from</span>
                <Segmented<Source> label="Piece source" value={source} onChange={setSource} options={[{ id: 'catalogue', label: 'Catalogue' }, { id: 'custom', label: 'Studio design' }]} />
              </div>
            </div>

            {source === 'catalogue' ? (
              <Field label="Product">
                <select value={product?.id ?? ''} onChange={e => setProductId(e.target.value)} className="field">
                  {choices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            ) : (
              <div className="space-y-3">
                <Field label="Saved in the studio on this device" hint="Build the design in the studio first, then pick it here.">
                  <select value={projectId} onChange={e => { setProjectId(e.target.value); setPasted(''); }} className="field">
                    <option value="">Choose a saved design</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
                <Field label="Or paste design JSON">
                  <textarea value={pasted} onChange={e => { setPasted(e.target.value); setProjectId(''); }} rows={3} className="field font-mono text-xs" />
                </Field>
                {customError && <p role="alert" className="text-sm text-destructive">{customError}</p>}
              </div>
            )}

            {photo.loading && <div className="skeleton aspect-[4/3] w-full" role="status" aria-label="Loading the wall photo" />}
            {photo.error && <p role="alert" className="text-sm text-destructive">The wall photo could not be loaded.</p>}
            {ready && wall && photo.url && (
              source === 'catalogue' && product ? (
                <WallPreview
                  key={`${wall.id}-${product.id}`}
                  product={product}
                  size={product.sizes[0]}
                  finish={product.finishes[0]}
                  source="space"
                  initialPhoto={{ url: photo.url, pxPerCm: wall.pxPerCm }}
                  compose={{ label: 'Use this placement', onDone: done }}
                />
              ) : custom ? (
                <WallPreview
                  key={`${wall.id}-${custom.designRef.length}-${custom.name}`}
                  outline={custom.outline}
                  finish={custom.finish as never}
                  finishes={[custom.finish as never]}
                  source="space"
                  initialPhoto={{ url: photo.url, pxPerCm: wall.pxPerCm }}
                  compose={{ label: 'Use this placement', onDone: done }}
                />
              ) : null
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
