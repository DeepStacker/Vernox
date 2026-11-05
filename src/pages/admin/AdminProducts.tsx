/**
 * Enterprise Admin Inventory & Product Catalog View
 * Matching the exact visual architecture, top inventory volume/turnover banner,
 * category filter tabs, and floating product detail inspector window
 * from Reference Screenshot 4.
 * 
 * Powered by real Cloud Firestore data, atomic stock adjustments, and live sales stats.
 */

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { isRevenueStatus } from '@/lib/orders/orderStateMachine';
import { useAdminData } from '@/lib/data/adminData';
import { useProductMutations } from '@/lib/data/products';
import type { Product } from '@/types/store';
import { finishLabels } from '@/lib/catalog';
import { shapeDefinitions } from '@/lib/shapes';
import { 
  Package, Plus, Edit2, Trash2, Search, X, 
  ArrowUpRight, AlertTriangle, CheckCircle2, Copy, 
  Printer, TrendingUp, Layers, Check, MoreHorizontal,
  Maximize2, Minimize2, Tag, ShieldCheck
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip 
} from 'recharts';
import { toast } from 'sonner';
import { AtelierSelect } from '@/components/ui/select';

export function AdminProducts() {
  const { products, categories, storeConfig, orders } = useAdminData();
  const { saveProduct, deleteProduct, setStock } = useProductMutations();
  const newProductId = () => `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

  const [productSearch, setProductSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'active' | 'low_stock' | 'out_of_stock' | 'customizable'>('all');
  
  // Selected Inspector Product
  const [inspectingProduct, setInspectingProduct] = useState<Product | null>(null);
  const [isInspectorExpanded, setIsInspectorExpanded] = useState(false);

  // Edit / Add Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Prevent background scroll and support ESC to close modals
  useEffect(() => {
    if (inspectingProduct || isModalOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setInspectingProduct(null);
          setIsModalOpen(false);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [inspectingProduct, isModalOpen]);

  // Form State
  const [productForm, setProductForm] = useState<Omit<Product, 'id'>>({
    slug: '',
    name: '',
    tagline: '',
    description: '',
    category: 'geometric',
    price: 149,
    shapeId: 'circle',
    finishes: ['steel', 'brass', 'copper'],
    sizes: [{ label: 'Medium · 400mm', widthMm: 400, heightMm: 400, priceDelta: 0 }],
    stock: 50,
    trackInventory: true,
    featured: false,
    bestseller: false,
    isNew: true,
    customizable: true,
    imageUrl: '',
    alloySpec: 'Architectural Grade 304 Alloy',
  });

  // Inventory Stats Banner
  const inventoryStats = useMemo(() => {
    const totalVolume = products.reduce((sum, p) => sum + (p.stock ?? 0), 0);
    const totalValue = products.reduce((sum, p) => sum + ((p.stock ?? 0) * (p.price || 0)), 0);
    const activeSkus = products.length;
    return { totalVolume, totalValue, activeSkus };
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const q = productSearch.toLowerCase();
      const matchesSearch = 
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.alloySpec && p.alloySpec.toLowerCase().includes(q));

      let matchesFilter = true;
      if (selectedFilter === 'active') matchesFilter = (p.stock ?? 0) > 0;
      if (selectedFilter === 'low_stock') matchesFilter = (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5;
      if (selectedFilter === 'out_of_stock') matchesFilter = (p.stock ?? 0) === 0;
      if (selectedFilter === 'customizable') matchesFilter = Boolean(p.customizable);

      return matchesSearch && matchesFilter;
    });
  }, [products, productSearch, selectedFilter]);

  // Product Sales Calculation for Inspector
  const getProductSalesStats = (pId: string) => {
    let unitsSold = 0;
    let revenueSold = 0;

    orders.forEach(o => {
      if (!isRevenueStatus(o.status)) return;
      o.items?.forEach(i => {
        if (i.productId === pId || i.productSlug === pId) {
          unitsSold += (i.quantity || 1);
          revenueSold += ((i.unitPrice || 0) * (i.quantity || 1));
        }
      });
    });

    // Real units per month over the last six months, from the orders loaded in the admin panel
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1);
      return { start: d.getTime(), month: d.toLocaleString('en-IN', { month: 'short' }), units: 0 };
    });
    orders.forEach(o => {
      if (!isRevenueStatus(o.status)) return;
      const bucket = [...buckets].reverse().find(b => o.placedAt >= b.start);
      if (!bucket) return;
      o.items?.forEach(i => {
        if (i.productId === pId || i.productSlug === pId) bucket.units += i.quantity || 1;
      });
    });
    const salesCurve = buckets.map(({ month, units }) => ({ month, units }));

    return { unitsSold, revenueSold, salesCurve };
  };

  const handleStartAdd = () => {
    setEditingProduct(null);
    setProductForm({
      slug: '',
      name: '',
      tagline: '',
      description: '',
      category: 'geometric',
      price: 149,
      shapeId: 'circle',
      finishes: ['steel', 'brass', 'copper'],
      sizes: [{ label: 'Standard · 400mm', widthMm: 400, heightMm: 400, priceDelta: 0 }],
      stock: 25,
      trackInventory: true,
      featured: false,
      bestseller: false,
      isNew: true,
      customizable: true,
      imageUrl: '/images/prod-abstract-horizon.jpg',
      alloySpec: 'Precision Solid 3.0mm Sheet Alloy',
    });
    setIsModalOpen(true);
  };

  const handleStartEdit = (p: Product) => {
    setEditingProduct(p);
    setProductForm({
      slug: p.slug,
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      category: p.category,
      price: p.price,
      shapeId: p.shapeId,
      finishes: p.finishes,
      sizes: p.sizes,
      stock: p.stock ?? 25,
      trackInventory: p.trackInventory ?? true,
      featured: p.featured,
      bestseller: p.bestseller,
      isNew: p.isNew,
      customizable: p.customizable,
      imageUrl: p.imageUrl || '',
      alloySpec: p.alloySpec || '304 Stainless Steel & Architectural Brass',
    });
    setIsModalOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name.trim() || !productForm.slug.trim()) {
      toast.error('Product name and slug are required');
      return;
    }

    const product: Product = editingProduct
      ? { ...editingProduct, ...productForm }
      : { ...productForm, id: newProductId() };
    // The mutation rolls the list back and shows an error if the write is rejected.
    const saved = await saveProduct(product);
    if (!saved) return;

    toast.success(editingProduct ? `Product ${productForm.name} updated` : `Product ${productForm.name} added to catalog`);
    if (editingProduct && inspectingProduct?.id === editingProduct.id) setInspectingProduct(product);
    setIsModalOpen(false);
  };

  const handleDeleteProduct = async (p: Product) => {
    if (!confirm(`Permanently remove "${p.name}" from catalog?`)) return;
    if (!(await deleteProduct(p.id))) return;
    if (inspectingProduct?.id === p.id) setInspectingProduct(null);
    toast.success('Product deleted');
  };

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl text-oxblood-deep">Inventory & Catalog Control</h2>
          <p className="text-muted-foreground text-sm">
            Monitor stock levels, manage CAD material specifications, and track unit velocity across collections.
          </p>
        </div>

        <button
          onClick={handleStartAdd}
          className="inline-flex items-center gap-2 bg-oxblood text-ivory hover:bg-oxblood-deep px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-soft shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Product</span>
        </button>
      </div>

      {/* TOP INVENTORY STATS BANNER (Matching Screenshot 4) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-card border border-border/70 rounded-2xl p-6 shadow-soft">
        <div className="space-y-1">
          <div className="font-display text-4xl font-bold text-oxblood-deep">
            {inventoryStats.totalVolume.toLocaleString()}
          </div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Total Inventory Volume (Units)
          </div>
        </div>

        <div className="space-y-1 border-y md:border-y-0 md:border-x border-border/60 py-4 md:py-0 md:px-6">
          <div className="font-display text-4xl font-bold text-foreground">
            {storeConfig.currency}{inventoryStats.totalValue > 1000000 
              ? `${(inventoryStats.totalValue / 1000000).toFixed(1)}M` 
              : inventoryStats.totalValue.toLocaleString()}
          </div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Estimated Inventory Value
          </div>
        </div>

        <div className="space-y-1 md:pl-2">
          <div className="font-display text-4xl font-bold text-brass">
            {inventoryStats.activeSkus} Active SKUs
          </div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            {inventoryStats.totalVolume} units in stock
          </div>
        </div>
      </div>

      {/* FILTER TABS & SEARCH BAR (Matching Screenshot 4) */}
      <div className="bg-card border border-border/70 rounded-xl p-3 shadow-soft flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active In Stock' },
            { id: 'low_stock', label: 'Low Stock (≤5)' },
            { id: 'out_of_stock', label: 'Out of Stock' },
            { id: 'customizable', label: 'CAD Customizable' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFilter(f.id as typeof selectedFilter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                selectedFilter === f.id
                  ? 'bg-oxblood text-ivory shadow-xs'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products or SKU..."
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:border-oxblood transition"
          />
        </div>
      </div>

      {/* PRODUCTS TABLE (Matching Screenshot 4) */}
      <div className="bg-card border border-border/70 rounded-xl overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="p-4">Product Piece</th>
                <th className="p-4">Category</th>
                <th className="p-4">SKU / Slug</th>
                <th className="p-4">Stock Adjuster</th>
                <th className="p-4">Price</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    <Package className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="font-medium text-foreground">No matching products found</p>
                    <p className="text-xs mt-1">Try switching category tabs or clearing search criteria.</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => {
                  const isOutOfStock = (p.stock ?? 0) === 0;
                  const isLowStock = (p.stock ?? 0) <= 5 && !isOutOfStock;

                  return (
                    <tr 
                      key={p.id}
                      onClick={() => setInspectingProduct(p)}
                      className="hover:bg-muted/20 transition cursor-pointer group"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-card border border-border overflow-hidden shrink-0 flex items-center justify-center shadow-2xs">
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground text-sm group-hover:text-oxblood transition">
                              {p.name}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate max-w-xs">
                              {p.tagline}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 text-xs capitalize text-muted-foreground font-medium">
                        {p.category.replace(/-/g, ' ')}
                      </td>

                      <td className="p-4 font-mono text-xs text-muted-foreground">
                        {p.slug || p.id}
                      </td>

                      <td className="p-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-bold text-xs ${
                            isOutOfStock ? 'text-destructive' : isLowStock ? 'text-amber-600' : 'text-foreground'
                          }`}>
                            {p.stock ?? 0}
                          </span>
                          <div className="inline-flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-md border border-border">
                            <button
                              type="button"
                              onClick={() => setStock({ id: p.id, stock: Math.max(0, (p.stock ?? 0) - 1) })}
                              className="w-5 h-5 rounded hover:bg-card text-muted-foreground hover:text-foreground text-xs font-bold flex items-center justify-center transition"
                              title="Decrease stock"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => setStock({ id: p.id, stock: (p.stock ?? 0) + 1 })}
                              className="w-5 h-5 rounded hover:bg-card text-muted-foreground hover:text-foreground text-xs font-bold flex items-center justify-center transition"
                              title="Increase stock"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 font-mono font-semibold text-oxblood-deep text-xs whitespace-nowrap">
                        {storeConfig.currency}{p.price}
                      </td>

                      <td className="p-4">
                        {isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                            Out of Stock
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                            Low Stock ({p.stock})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleStartEdit(p)}
                            title="Edit Product"
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p)}
                            title="Delete Product"
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PRODUCT FLYOUT DETAIL INSPECTOR WINDOW (Screenshot 4) */}
      {inspectingProduct && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in"
          onClick={() => setInspectingProduct(null)}
        >
          <div 
            onClick={e => e.stopPropagation()}
            className={`bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col transition-all duration-300 ${
              isInspectorExpanded ? 'w-[98vw] h-[96vh]' : 'w-full max-w-2xl max-h-[90vh]'
            }`}
          >
            {/* Inspector Header */}
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20 shrink-0">
              <div className="min-w-0 pr-4">
                <h3 className="font-display text-xl text-oxblood-deep font-bold truncate">
                  {inspectingProduct.name}
                </h3>
                <p className="text-xs text-muted-foreground truncate">{inspectingProduct.tagline}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setIsInspectorExpanded(!isInspectorExpanded)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition"
                  title={isInspectorExpanded ? 'Restore' : 'Expand'}
                >
                  {isInspectorExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setInspectingProduct(null)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Inspector Action Buttons */}
            <div className="p-3.5 border-b border-border/60 bg-card flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  handleStartEdit(inspectingProduct);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-oxblood text-ivory hover:bg-oxblood-deep rounded-lg text-xs font-semibold transition shadow-soft"
              >
                <Edit2 className="w-3 h-3" />
                <span>Edit Piece</span>
              </button>

              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-border rounded-lg text-xs font-semibold text-foreground transition"
              >
                <Printer className="w-3 h-3" />
                <span>Print Spec</span>
              </button>

              <button
                onClick={async () => {
                  const copy: Product = {
                    ...inspectingProduct,
                    id: newProductId(),
                    name: `${inspectingProduct.name} (Copy)`,
                    slug: `${inspectingProduct.slug}-copy-${Date.now().toString(36).slice(-4)}`,
                  };
                  if (!(await saveProduct(copy))) return;
                  toast.success(`Duplicated ${inspectingProduct.name}`);
                  setInspectingProduct(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-border rounded-lg text-xs font-semibold text-foreground transition ml-auto"
              >
                <Copy className="w-3 h-3" />
                <span>Duplicate</span>
              </button>
            </div>

            {/* Inspector Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Product Info Card & Image (Screenshot 4 layout) */}
              <div className="border border-border/70 rounded-xl p-4 bg-muted/20 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Product Info
                </div>

                <div className="grid grid-cols-2 gap-4 items-center">
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">SKU / ID:</span>
                      <span className="font-mono font-semibold">{inspectingProduct.slug || inspectingProduct.id}</span>
                    </div>

                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Base Price:</span>
                      <span className="font-mono font-bold text-oxblood">{storeConfig.currency}{inspectingProduct.price}</span>
                    </div>

                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Category:</span>
                      <span className="capitalize font-medium">{inspectingProduct.category}</span>
                    </div>

                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Stock Units:</span>
                      <span className="font-mono font-bold">{inspectingProduct.stock ?? 0}</span>
                    </div>

                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Status:</span>
                      <span className="text-emerald-600 font-semibold uppercase text-[10px]">Active</span>
                    </div>
                  </div>

                  {/* Thumbnail Preview */}
                  <div className="h-32 rounded-xl bg-card border border-border overflow-hidden flex items-center justify-center shadow-soft">
                    {inspectingProduct.imageUrl ? (
                      <img src={inspectingProduct.imageUrl} alt={inspectingProduct.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-10 h-10 text-muted-foreground/40" />
                    )}
                  </div>
                </div>
              </div>

              {/* Alloy & Material Specs */}
              {inspectingProduct.alloySpec && (
                <div className="border border-border/70 rounded-xl p-4 bg-card space-y-1.5 text-xs">
                  <div className="font-semibold text-oxblood uppercase tracking-wider text-[10px]">
                    Material Spec & Finish
                  </div>
                  <p className="text-foreground leading-relaxed font-mono text-[11px]">
                    {inspectingProduct.alloySpec}
                  </p>
                </div>
              )}

              {/* Sales Statistics Mini Chart (Screenshot 4) */}
              {(() => {
                const telemetry = getProductSalesStats(inspectingProduct.id);
                return (
                  <div className="border border-border/70 rounded-xl p-4 bg-card space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold uppercase tracking-wider text-muted-foreground">Sales Statistics</span>
                      <span className="font-mono text-oxblood font-bold">{telemetry.unitsSold} units total</span>
                    </div>

                    <div className="h-40 w-full pt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={telemetry.salesCurve}>
                          <defs>
                            <linearGradient id="prodSalesColor" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6b1e28" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#6b1e28" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="month" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                          <ChartTooltip />
                          <Area type="monotone" dataKey="units" stroke="#6b1e28" strokeWidth={2} fillOpacity={1} fill="url(#prodSalesColor)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* PRODUCT ADD / EDIT MODAL */}
      {isModalOpen && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-5 animate-scale-in max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-display text-xl text-oxblood-deep font-bold">
                {editingProduct ? `Edit Piece: ${editingProduct.name}` : 'Provision New Catalog Piece'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Piece Name *</label>
                  <input
                    type="text"
                    required
                    value={productForm.name}
                    onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Slug / SKU *</label>
                  <input
                    type="text"
                    required
                    value={productForm.slug}
                    onChange={e => setProductForm({ ...productForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm font-mono outline-none focus:border-oxblood"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tagline</label>
                <input
                  type="text"
                  value={productForm.tagline}
                  onChange={e => setProductForm({ ...productForm, tagline: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</label>
                  <AtelierSelect
                    value={productForm.category}
                    onValueChange={val => setProductForm({ ...productForm, category: val as Product['category'] })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood"
                    options={categories.map(c => ({
                      value: c.id,
                      label: c.name,
                    }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Base Price ({storeConfig.currency})</label>
                  <input
                    type="number"
                    required
                    value={productForm.price}
                    onChange={e => setProductForm({ ...productForm, price: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stock Units</label>
                  <input
                    type="number"
                    required
                    value={productForm.stock}
                    onChange={e => setProductForm({ ...productForm, stock: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Image URL</label>
                <input
                  type="text"
                  placeholder="/images/prod-abstract-horizon.jpg"
                  value={productForm.imageUrl}
                  onChange={e => setProductForm({ ...productForm, imageUrl: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alloy Spec / Metallurgy</label>
                <input
                  type="text"
                  placeholder="304 Stainless Steel · Solid 3.0mm Sheet Plate"
                  value={productForm.alloySpec}
                  onChange={e => setProductForm({ ...productForm, alloySpec: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
                <textarea
                  rows={3}
                  value={productForm.description}
                  onChange={e => setProductForm({ ...productForm, description: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood"
                />
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productForm.featured}
                    onChange={e => setProductForm({ ...productForm, featured: e.target.checked })}
                    className="rounded border-border accent-oxblood"
                  />
                  <span>Featured Collection</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productForm.customizable}
                    onChange={e => setProductForm({ ...productForm, customizable: e.target.checked })}
                    className="rounded border-border accent-oxblood"
                  />
                  <span>CAD Customizable</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-ivory bg-oxblood hover:bg-oxblood-deep rounded-lg transition shadow-soft"
                >
                  {editingProduct ? 'Save Changes' : 'Create Piece'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
