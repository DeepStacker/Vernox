import { renderToStaticMarkup } from 'react-dom/server';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import type { Product } from '@/lib/catalog';

/**
 * The product's laser-cut art (finish gradient, brushed texture, bevel, standoff shadow) as a
 * standalone SVG string, for consumers that need markup rather than a React element (e.g. AR/wall
 * previews that rasterise or texture the piece). Import this module lazily: it pulls react-dom/server.
 */
export function getProductMotifSvg(product: Pick<Product, 'name' | 'shapeId'>, finish: string): string {
  const markup = renderToStaticMarkup(<ShapeThumb shapeId={product.shapeId} finish={finish} name={product.name} />);
  return markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
}
