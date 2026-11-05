import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { StoreLayout } from '@/components/shop/StoreLayout';
import { PageHeader } from '@/components/shop/PageHeader';
import { Reveal } from '@/components/shop/Reveal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/shop/StateViews';
import { ConsultationPurchaseDialog } from '@/components/spaces/ConsultationPurchaseDialog';
import { TryDesignDialog } from '@/components/spaces/TryDesignDialog';
import { WallEditor } from '@/components/spaces/WallEditor';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCatalog } from '@/lib/catalogContext';
import { ROOMS } from '@/lib/catalog';
import { useMyConsultations } from '@/lib/consultations/consultations';
import { consultationSettings, customerStatus } from '@/lib/consultations/consultationModel';
import { useSeo } from '@/lib/seo';
import { trackSpaceEvent } from '@/lib/spaces/analytics';
import { canAddWall, spaceReadyForConsultation, wallIsPreviewable } from '@/lib/spaces/spaceModel';
import { useSpace, useSpaceActions } from '@/lib/spaces/spaces';
import { usePhotoUrl } from '@/lib/spaces/usePhotoUrl';
import { formatINR } from '@/lib/storefront/format';
import { BUDGET_BANDS, MAX_WALLS_PER_SPACE, type SpaceWall } from '@/types/consultation';

function WallCard({ wall, onTry, onEdit, onRemove }: { wall: SpaceWall; onTry: () => void; onEdit: () => void; onRemove: () => void }) {
  const photo = usePhotoUrl(wall.photoPath);
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="aspect-[4/3] bg-secondary">
        {photo.url ? <img src={photo.url} alt={`${wall.name} photo`} className="h-full w-full object-cover" />
          : photo.loading ? <div className="skeleton h-full w-full rounded-none" role="status" aria-label="Loading photo" />
            : <div className="grid h-full place-items-center px-4 text-center text-sm text-muted-foreground">{wall.photoPath ? 'Photo unavailable' : 'No photo yet'}</div>}
      </div>
      <div className="space-y-3 p-4">
        <div>
          <h3 className="font-display text-xl">{wall.name}</h3>
          <p className="text-sm text-muted-foreground">{wall.widthCm} × {wall.heightCm} cm</p>
          {wall.notes && <p className="mt-2 text-sm">{wall.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onTry} disabled={!wallIsPreviewable(wall)} className="btn-primary px-4 py-2" title={wallIsPreviewable(wall) ? undefined : 'Add a photo to try designs here'}>Try a design here</button>
          <button type="button" onClick={onEdit} className="btn-secondary px-4 py-2">Edit</button>
          <button type="button" onClick={onRemove} className="btn-secondary px-4 py-2">Remove</button>
        </div>
      </div>
    </article>
  );
}

/** `/account/spaces/:spaceId`: one space with its walls; try a design on a wall or ask for design help. */
export default function SpaceDetail() {
  const { spaceId } = useParams();
  useSeo({ title: 'My Space', noindex: true });
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { storeConfig } = useCatalog();
  const { space, isLoading, error } = useSpace(user?.uid, spaceId);
  const consultations = useMyConsultations(user?.uid);
  const actions = useSpaceActions(user?.uid ?? '');
  const settings = consultationSettings(storeConfig.consultation);

  const [editing, setEditing] = useState<SpaceWall | 'new' | null>(null);
  const [trying, setTrying] = useState<SpaceWall | null>(null);
  const [buying, setBuying] = useState(false);
  const [notes, setNotes] = useState('');
  useEffect(() => setNotes(space?.notes ?? ''), [space?.notes]);

  const crumbs = [{ label: 'Account', to: '/account' }, { label: 'My Space', to: '/account/spaces' }, { label: space?.name ?? 'Space' }];

  if (loading || isLoading) return <StoreLayout><div className="container py-10"><LoadingBlock /></div></StoreLayout>;
  if (!user) {
    return <StoreLayout><div className="container py-10"><EmptyState title="Sign in to see your space" action={{ label: 'Sign in', to: '/account' }} /></div></StoreLayout>;
  }
  if (error) return <StoreLayout><div className="container py-10"><ErrorState>We could not load this space. Please try again.</ErrorState></div></StoreLayout>;
  if (!space) {
    return <StoreLayout><div className="container py-10"><EmptyState title="Space not found" action={{ label: 'My Space', to: '/account/spaces' }} /></div></StoreLayout>;
  }

  const existing = (consultations.data ?? []).filter(c => c.spaceId === space.id);
  const ready = spaceReadyForConsultation(space);
  const budget = BUDGET_BANDS.find(b => b.id === space.budgetBand)?.label;

  const saveNotes = async () => {
    if (notes.trim() === space.notes) return;
    try { await actions.saveSpace({ ...space, notes: notes.trim() }); } catch { toast.error('Could not save your notes.'); }
  };

  const removeWall = async (wall: SpaceWall) => {
    if (!window.confirm(`Remove ${wall.name}? Its photo is deleted too.`)) return;
    try { await actions.removeWall(space, wall); } catch { toast.error('Could not remove this wall.'); }
  };

  const removeSpace = async () => {
    if (!window.confirm(`Delete ${space.name} and all its photos? Consultations you already bought keep their own copy.`)) return;
    try { await actions.removeSpace(space); navigate('/account/spaces'); } catch { toast.error('Could not delete this space.'); }
  };

  const saveWall = async (wall: SpaceWall, photo: Blob | null) => {
    const isNew = !space.walls.some(w => w.id === wall.id);
    await actions.saveWallWithPhoto(space, wall, photo);
    if (isNew) trackSpaceEvent('wall_added', { hasPhoto: !!wall.photoPath, calibrated: !!wall.pxPerCm });
    setEditing(null);
  };

  return (
    <StoreLayout>
      <div className="container max-w-4xl py-6 sm:py-10">
        <PageHeader
          title={space.name}
          line={[ROOMS.find(r => r.id === space.roomType)?.name, budget].filter(Boolean).join(' · ')}
          crumbs={crumbs}
          actions={canAddWall(space) && <button type="button" onClick={() => setEditing('new')} className="btn-primary"><Plus className="h-4 w-4" /> Add a wall</button>}
        />

        {space.walls.length === 0 ? (
          <EmptyState title="No walls yet" hint="Photograph a wall and tell us its size." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {space.walls.map((w, i) => (
              <Reveal key={w.id} index={i}>
                <WallCard wall={w} onTry={() => setTrying(w)} onEdit={() => setEditing(w)} onRemove={() => removeWall(w)} />
              </Reveal>
            ))}
          </div>
        )}
        {!canAddWall(space) && <p className="mt-3 text-sm text-muted-foreground">A space holds up to {MAX_WALLS_PER_SPACE} walls.</p>}

        <label className="mt-8 block text-sm">
          <span className="mb-1 block text-muted-foreground">About this room: colours, style, anything we should know</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes} rows={3} maxLength={2000} className="field" />
        </label>

        {settings.enabled && (
          <section className="mt-8 rounded-lg border border-border bg-card p-5" aria-labelledby="help-heading">
            <h2 id="help-heading" className="font-display text-2xl">Get design help</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A designer picks pieces for these walls and shows each one on your photos. {formatINR(settings.priceInr)} + GST
              {settings.creditTowardsOrder ? ', credited back on your next order' : ''}.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setBuying(true)} disabled={!ready} className="btn-primary">Get design help</button>
              {!ready && <span className="text-sm text-muted-foreground">Add a wall with a photo first.</span>}
              {existing.map(c => <Link key={c.id} to={`/account/consultations/${c.id}`} className="text-sm text-burgundy underline underline-offset-4">Consultation: {customerStatus(c)}</Link>)}
            </div>
          </section>
        )}

        <div className="mt-10 border-t border-border pt-4">
          <button type="button" onClick={removeSpace} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-destructive">Delete this space</button>
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display text-2xl">{editing === 'new' ? 'Add a wall' : 'Edit wall'}</DialogTitle></DialogHeader>
          {editing && <WallEditor uid={user.uid} space={space} wall={editing === 'new' ? undefined : editing} onSave={saveWall} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <TryDesignDialog wall={trying} onClose={() => setTrying(null)} />
      <ConsultationPurchaseDialog space={buying ? space : null} onClose={() => setBuying(false)} onPurchased={id => navigate(`/account/consultations/${id}`)} />
    </StoreLayout>
  );
}
