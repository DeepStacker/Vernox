import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { WallPreview } from '@/components/wall-preview';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCatalog } from '@/lib/catalogContext';
import { usePhotoUrl } from '@/lib/spaces/usePhotoUrl';
import { wallIsPreviewable } from '@/lib/spaces/spaceModel';
import type { FinishId } from '@/lib/catalog';
import type { SpaceWall } from '@/types/consultation';

interface Props {
  wall: SpaceWall | null;
  onClose: () => void;
}

/** "Try a design here": the wall preview in own-photo mode, opened on a saved wall photo at its saved scale. */
export function TryDesignDialog({ wall, onClose }: Props) {
  const { products } = useCatalog();
  const choices = useMemo(() => products.filter(p => p.sizes.length > 0), [products]);
  const [productId, setProductId] = useState('');
  const product = choices.find(p => p.id === productId) ?? choices[0];
  const photo = usePhotoUrl(wall?.photoPath, !!wall);
  const [finish, setFinish] = useState<FinishId | null>(null);

  return (
    <Dialog open={!!wall} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Try a design on {wall?.name ?? 'this wall'}</DialogTitle>
          <DialogDescription>Shown to scale on your own photo.</DialogDescription>
        </DialogHeader>
        {choices.length > 0 && (
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Design</span>
            <select value={product?.id ?? ''} onChange={e => { setProductId(e.target.value); setFinish(null); }} className="field">
              {choices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {photo.loading && <div className="skeleton aspect-[4/3] w-full" role="status" aria-label="Loading your photo" />}
        {photo.error && <p role="alert" className="text-sm text-destructive">Your photo could not be loaded. Check your connection and try again.</p>}
        {wall && wallIsPreviewable(wall) && photo.url && product && (
          <WallPreview
            key={product.id}
            product={product}
            size={product.sizes[0]}
            finish={finish ?? product.finishes[0]}
            onFinishChange={setFinish}
            source="space"
            initialPhoto={{ url: photo.url, pxPerCm: wall.pxPerCm }}
          />
        )}
        {product && <Link to={`/product/${product.slug}`} className="text-sm text-burgundy underline underline-offset-4">View {product.name}</Link>}
      </DialogContent>
    </Dialog>
  );
}
