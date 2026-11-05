import { safeLocal } from '@/lib/safeStorage';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCatalog } from '@/lib/catalogContext';
import { Product } from '@/lib/catalog';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { Eye, ArrowRight, Layers } from 'lucide-react';

interface Props {
  currentProductId?: string;
  className?: string;
}

export function RecentlyViewed({ currentProductId, className = '' }: Props) {
  const { products, storeConfig } = useCatalog();
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);

  useEffect(() => {
    try {
      let idList = safeLocal.getJson<string[]>('vernox_recent_views', []);

      if (currentProductId) {
        idList = [currentProductId, ...idList.filter(id => id !== currentProductId)].slice(0, 8);
        safeLocal.setJson('vernox_recent_views', idList);
      }

      // Filter out current product and map to real products
      const validProducts = idList
        .filter(id => id !== currentProductId)
        .map(id => products.find(p => p.id === id))
        .filter((p): p is Product => Boolean(p))
        .slice(0, 4);

      setRecentProducts(validProducts);
    } catch {
      // LocalStorage access failure fallback
    }
  }, [currentProductId, products]);

  if (recentProducts.length === 0) return null;

  return (
    <div className={`border-t border-[#E8E1D3] pt-12 pb-8 ${className}`}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="text-[10px] uppercase tracking-[0.24em] text-gold font-sans font-semibold">
            Your Atelier Journey
          </span>
          <h3 className="font-editorial text-2xl sm:text-3xl text-dark-brown mt-0.5">
            Recently Viewed Pieces
          </h3>
        </div>

        <Link
          to="/shop"
          className="text-xs uppercase tracking-[0.16em] text-burgundy hover:text-burgundy-hover font-sans font-semibold inline-flex items-center gap-1.5 transition-colors"
        >
          <span>View Full Catalog</span>
          <ArrowRight className="w-3.5 h-3.5 text-gold" />
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        {recentProducts.map(p => (
          <Link
            key={p.id}
            to={`/product/${p.slug}`}
            className="group bg-white rounded-md border border-[#E8E1D3] p-4 flex flex-col justify-between hover:border-burgundy/40 transition-all shadow-2xs hover:shadow-xs"
          >
            <div className="aspect-square bg-cream/40 rounded-sm overflow-hidden mb-3 relative flex items-center justify-center">
              {p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28">
                  <ShapeThumb shapeId={p.shapeId || 'shield'} finish={p.finishes[0] || 'brass'} className="w-full h-full" />
                </div>
              )}
            </div>

            <div>
              <span className="text-[9px] uppercase tracking-[0.18em] text-dark-brown/50 font-sans block">
                {p.category.replace('-', ' ')}
              </span>
              <h4 className="font-editorial text-base sm:text-lg text-dark-brown group-hover:text-burgundy transition-colors leading-snug line-clamp-1">
                {p.name}
              </h4>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#EBE4D6]">
                <span className="font-mono text-xs font-semibold text-dark-brown">
                  {storeConfig.currency} {p.price.toLocaleString()}
                </span>
                <span className="text-[10px] text-burgundy font-sans uppercase tracking-wider font-semibold group-hover:translate-x-0.5 transition-transform">
                  View →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
