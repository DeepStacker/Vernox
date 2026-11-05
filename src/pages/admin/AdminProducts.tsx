/**
 * Catalog manager: product list with stock, sample-product filter, and the product form
 * (src/pages/admin/catalog). Visible to roles with catalog.write.
 */
import { useMemo, useState } from 'react';
import { Copy, Edit2, Package, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Product } from '@/lib/catalog';
import { useAdminData } from '@/lib/data/adminData';
import { useProductMutations } from '@/lib/data/products';
import { LOW_STOCK_THRESHOLD, matchesProductFilter, matchesProductSearch, PRODUCT_FILTERS, type ProductFilter } from './catalog/productFilters';
import { ProductFormDialog } from './catalog/ProductFormDialog';

const newProductId = () => `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

function StockBadge({ p }: { p: Product }) {
  if (p.trackInventory === false) return <span className="text-xs text-muted-foreground">Not tracked</span>;
  if (p.stock <= 0) return <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-600">Out of stock</span>;
  if (p.stock <= LOW_STOCK_THRESHOLD) return <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Low ({p.stock})</span>;
  return <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">In stock</span>;
}

export function AdminProducts() {
  const { products, storeConfig } = useAdminData();
  const { saveProduct, deleteProduct, setStock } = useProductMutations();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProductFilter>('all');
  const [form, setForm] = useState<{ open: boolean; product: Product | null; template: Product | null }>({ open: false, product: null, template: null });

  const visible = useMemo(() => products.filter(p => matchesProductFilter(p, filter) && matchesProductSearch(p, search)), [products, filter, search]);
  const sampleCount = products.filter(p => p.isSample).length;
  const currency = storeConfig.currency || '₹';

  const save = async (product: Product) => {
    const ok = await saveProduct(product);
    if (ok) toast.success(`${product.name} saved`);
    return ok;
  };
  const remove = async (p: Product) => {
    if (!window.confirm(`Permanently remove "${p.name}" from the catalog?`)) return;
    if (await deleteProduct(p.id)) toast.success('Product deleted');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-3xl">Catalog</h2>
          <p className="text-sm text-muted-foreground">{products.length} products, {products.reduce((n, p) => n + p.stock, 0)} units in stock.</p>
        </div>
        <button type="button" onClick={() => setForm({ open: true, product: null, template: null })}
          className="min-h-11 inline-flex items-center gap-2 rounded-lg bg-oxblood px-4 text-sm font-semibold text-ivory shadow-soft">
          <Plus className="h-4 w-4" /> New product
        </button>
      </div>

      {sampleCount > 0 && (
        <p className="rounded-lg border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-800">
          {sampleCount} product(s) are sample placeholders. Use the "Sample products" filter to find them, replace the details and photos, then untick "Sample product" in the form.
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-soft md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Product filter">
          {PRODUCT_FILTERS.map(f => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-xs font-semibold ${filter === f.id ? 'bg-oxblood text-ivory' : 'bg-muted/50 text-muted-foreground'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative md:w-72">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, slug, HSN" aria-label="Search products"
            className="min-h-11 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-oxblood" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-soft">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="p-3">Product</th><th className="p-3">Price</th><th className="p-3">Stock</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {visible.length === 0 && (
              <tr><td colSpan={5} className="p-10 text-center text-muted-foreground"><Package className="mx-auto mb-2 h-7 w-7 opacity-40" />No matching products.</td></tr>
            )}
            {visible.map(p => (
              <tr key={p.id}>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                      {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="truncate">{p.name}</span>
                        {p.isSample && <span className="shrink-0 rounded-full border border-amber-400/50 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">Sample</span>}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">{p.slug}</div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap p-3 font-mono text-xs">{currency}{p.price.toLocaleString('en-IN')}{p.mrp ? <span className="ml-1 text-muted-foreground line-through">{currency}{p.mrp.toLocaleString('en-IN')}</span> : null}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label={`Decrease stock of ${p.name}`} onClick={() => void setStock({ id: p.id, stock: Math.max(0, p.stock - 1) })} className="min-h-11 min-w-11 rounded-lg border border-border font-bold">-</button>
                    <span className="w-8 text-center font-mono font-bold">{p.stock}</span>
                    <button type="button" aria-label={`Increase stock of ${p.name}`} onClick={() => void setStock({ id: p.id, stock: p.stock + 1 })} className="min-h-11 min-w-11 rounded-lg border border-border font-bold">+</button>
                  </div>
                </td>
                <td className="p-3"><StockBadge p={p} /></td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <button type="button" title="Edit" aria-label={`Edit ${p.name}`} onClick={() => setForm({ open: true, product: p, template: null })} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg hover:bg-muted"><Edit2 className="h-4 w-4" /></button>
                    <button type="button" title="Duplicate" aria-label={`Duplicate ${p.name}`} onClick={() => setForm({ open: true, product: null, template: p })} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg hover:bg-muted"><Copy className="h-4 w-4" /></button>
                    <button type="button" title="Delete" aria-label={`Delete ${p.name}`} onClick={() => void remove(p)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ProductFormDialog open={form.open} product={form.product} template={form.template} currency={currency}
        gstRatePercent={storeConfig.gstRatePercent} newId={newProductId}
        onClose={() => setForm(f => ({ ...f, open: false }))} onSave={save} />
    </div>
  );
}
