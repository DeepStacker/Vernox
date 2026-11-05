import { finishName } from '@/lib/catalog';
import type { Order, Product } from '@/types/store';
import { isCustomItem, itemSizeText } from './itemSpec';

function materialText(product?: Product): string {
  const parts = [product?.material, product?.thicknessMm ? `${product.thicknessMm} mm` : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Per design';
}

/** Read-only spec lines for every item of an order (what the workshop needs to make it). */
export function OrderItemSpecs({ order, products }: { order: Order; products: readonly Product[] }) {
  return (
    <ul className="space-y-2">
      {order.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        return (
          <li key={item.id} className="rounded-lg border border-border/70 bg-background p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{item.productName}</span>
              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">× {item.quantity}</span>
              {isCustomItem(item) && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-oxblood/10 text-oxblood-deep border border-oxblood/30">Custom design</span>
              )}
            </div>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
              <div><dt className="inline">Size: </dt><dd className="inline text-foreground">{itemSizeText(item)}</dd></div>
              <div><dt className="inline">Finish: </dt><dd className="inline text-foreground">{item.finish ? finishName(item.finish) : 'n/a'}</dd></div>
              <div className="col-span-2"><dt className="inline">Material: </dt><dd className="inline text-foreground">{materialText(product)}</dd></div>
            </dl>
            {item.uploadedArtworkName && <p className="mt-1 text-xs text-muted-foreground">Artwork: {item.uploadedArtworkName}</p>}
          </li>
        );
      })}
    </ul>
  );
}
