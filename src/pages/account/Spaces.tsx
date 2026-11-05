import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { StoreLayout } from '@/components/shop/StoreLayout';
import { PageHeader } from '@/components/shop/PageHeader';
import { Reveal } from '@/components/shop/Reveal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/shop/StateViews';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ROOMS } from '@/lib/catalog';
import { useSeo } from '@/lib/seo';
import { trackSpaceEvent } from '@/lib/spaces/analytics';
import { newSpace } from '@/lib/spaces/spaceModel';
import { useSpaceActions, useSpaces } from '@/lib/spaces/spaces';
import { useMyConsultations } from '@/lib/consultations/consultations';
import { customerStatus } from '@/lib/consultations/consultationModel';
import { BUDGET_BANDS, type BudgetBandId } from '@/types/consultation';

const roomName = (id: string) => ROOMS.find(r => r.id === id)?.name ?? id;

function NewSpaceForm({ uid, onDone }: { uid: string; onDone: () => void }) {
  const navigate = useNavigate();
  const { saveSpace } = useSpaceActions(uid);
  const [name, setName] = useState('');
  const [roomType, setRoomType] = useState<string>(ROOMS[0].id);
  const [budget, setBudget] = useState<BudgetBandId | ''>('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const space = newSpace({ name, roomType, budgetBand: budget || null });
      await saveSpace(space);
      trackSpaceEvent('space_created', { roomType });
      navigate(`/account/spaces/${space.id}`);
    } catch {
      toast.error('Could not save your space. Please try again.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Name</span>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Living room" required className="field" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Room</span>
        <select value={roomType} onChange={e => setRoomType(e.target.value)} className="field">
          {ROOMS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Budget (optional)</span>
        <select value={budget} onChange={e => setBudget(e.target.value as BudgetBandId | '')} className="field">
          <option value="">Not sure yet</option>
          {BUDGET_BANDS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !name.trim()} className="btn-primary">{saving ? 'Saving…' : 'Create'}</button>
        <button type="button" onClick={onDone} className="btn-secondary">Cancel</button>
      </div>
    </form>
  );
}

/** `/account/spaces`: the customer's saved rooms and their design consultations. */
export default function Spaces() {
  useSeo({ title: 'My Space', noindex: true });
  const { user, loading } = useAuth();
  const spaces = useSpaces(user?.uid);
  const consultations = useMyConsultations(user?.uid);
  const [creating, setCreating] = useState(false);

  const crumbs = [{ label: 'Account', to: '/account' }, { label: 'My Space' }];

  if (loading) return <StoreLayout><div className="container py-10"><LoadingBlock /></div></StoreLayout>;
  if (!user) {
    return (
      <StoreLayout>
        <div className="container py-6 sm:py-10">
          <PageHeader title="My Space" crumbs={crumbs} />
          <EmptyState title="Sign in to save your walls" hint="Keep photos and measurements of your rooms, and see designs on them." action={{ label: 'Sign in', to: '/account' }} />
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="container max-w-4xl py-6 sm:py-10">
        <PageHeader
          title="My Space"
          line="Your rooms, with photos and measurements."
          crumbs={crumbs}
          actions={!creating && <button type="button" onClick={() => setCreating(true)} className="btn-primary"><Plus className="h-4 w-4" /> New space</button>}
        />
        {creating && <div className="mb-6"><NewSpaceForm uid={user.uid} onDone={() => setCreating(false)} /></div>}

        {spaces.isLoading ? <LoadingBlock className="h-40" /> : spaces.error ? (
          <ErrorState>We could not load your spaces. Please try again.</ErrorState>
        ) : (spaces.data ?? []).length === 0 ? (
          !creating && <EmptyState title="No spaces yet" hint="Add a room, then photograph its walls." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {spaces.data!.map((s, i) => (
              <Reveal as="li" key={s.id} index={i}>
                <Link to={`/account/spaces/${s.id}`} className="lift block rounded-lg border border-border bg-card p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-burgundy">
                  <p className="font-display text-xl">{s.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{roomName(s.roomType)} · {s.walls.length} {s.walls.length === 1 ? 'wall' : 'walls'}</p>
                </Link>
              </Reveal>
            ))}
          </ul>
        )}

        {(consultations.data ?? []).length > 0 && (
          <section className="mt-10" aria-labelledby="consultations-heading">
            <h2 id="consultations-heading" className="font-display text-2xl">Design consultations</h2>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
              {consultations.data!.map(c => (
                <li key={c.id}>
                  <Link to={`/account/consultations/${c.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-secondary/50">
                    <span className="font-medium">{c.spaceName}</span>
                    <span className="badge-pill">{customerStatus(c)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </StoreLayout>
  );
}
