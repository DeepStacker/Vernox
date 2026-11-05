import { useEffect, useMemo, useState } from 'react';
import { safeLocal } from '@/lib/safeStorage';
import { useCatalog } from '@/lib/catalogContext';
import type { Product } from '@/lib/catalog';
import { ProductGrid } from '@/components/shop/ProductGrid';

const STORAGE_KEY = 'vernox_recent_views';

interface Props {
  /** Product being viewed now: recorded in the list and excluded from the results. */
  currentProductId?: string;
}

export function RecentlyViewed({ currentProductId }: Props) {
  const { products } = useCatalog();
  const [ids, setIds] = useState<string[]>(() => safeLocal.getJson<string[]>(STORAGE_KEY, []));

  useEffect(() => {
    if (!currentProductId) return;
    setIds(prev => {
      const next = [currentProductId, ...prev.filter(id => id !== currentProductId)].slice(0, 8);
      safeLocal.setJson(STORAGE_KEY, next);
      return next;
    });
  }, [currentProductId]);

  const recent = useMemo(
    () => ids.filter(id => id !== currentProductId).map(id => products.find(p => p.id === id)).filter((p): p is Product => Boolean(p)).slice(0, 4),
    [ids, currentProductId, products],
  );

  if (recent.length === 0) return null;
  return (
    <section className="container py-10" aria-labelledby="recent-heading">
      <h2 id="recent-heading" className="section-title mb-5">Recently viewed</h2>
      <ProductGrid products={recent} />
    </section>
  );
}
