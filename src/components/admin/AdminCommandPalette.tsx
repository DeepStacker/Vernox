/**
 * Vernox Admin Universal Command Palette & Spotlight Search (Ctrl+K / ⌘K)
 * Real-time unified lookup across Orders, Catalog Products, Coupons, and Customer Patrons.
 */

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAdminData } from '@/lib/data/adminData';
import type { Order, Product } from '@/types/store';
import type { Coupon } from '@/types/coupon';
import { 
  Search, ShoppingCart, Package, Tag, Users, 
  ArrowRight, X, Clock, ExternalLink, Palette, Image as ImageIcon 
} from 'lucide-react';

interface AdminCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOrder?: (order: Order) => void;
  onSelectProduct?: (product: Product) => void;
  onSelectTab: (tab: string) => void;
}

export function AdminCommandPalette({
  isOpen,
  onClose,
  onSelectOrder,
  onSelectProduct,
  onSelectTab,
}: AdminCommandPaletteProps) {
  const { orders, products, coupons, customers, storeConfig } = useAdminData();
  const [query, setQuery] = useState('');

  // Keyboard shortcut listener for Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        // toggle handled by parent or opened
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset query on open and lock body scroll
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { orders: [], products: [], coupons: [], customers: [] };

    const isCustomQuery = q.includes('custom') || q.includes('art') || q.includes('vector') || q.includes('craft') || q.includes('upload');

    const matchedOrders = orders.filter(o => 
      o.id.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q) ||
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      (o.items && o.items.some(i => 
        (i.productName && i.productName.toLowerCase().includes(q)) ||
        (i.uploadedArtworkName && i.uploadedArtworkName.toLowerCase().includes(q)) ||
        (isCustomQuery && (Boolean(i.userUploadedImage) || Boolean(i.customDesignRef) || i.productId === 'custom-bespoke'))
      ))
    ).slice(0, 5);

    const matchedProducts = products.filter(p => 
      p.name.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    ).slice(0, 4);

    const matchedCoupons = coupons.filter(c => 
      c.code.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    ).slice(0, 3);

    const matchedCustomers = customers.filter(c => 
      c.email.toLowerCase().includes(q) ||
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.city && c.city.toLowerCase().includes(q))
    ).slice(0, 3);

    return {
      orders: matchedOrders,
      products: matchedProducts,
      coupons: matchedCoupons,
      customers: matchedCustomers,
    };
  }, [query, orders, products, coupons, customers]);

  if (!isOpen) return null;

  const totalResults = 
    searchResults.orders.length + 
    searchResults.products.length + 
    searchResults.coupons.length + 
    searchResults.customers.length;

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-20 p-3 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="p-4 border-b border-border/70 flex items-center gap-3 bg-muted/20">
          <Search className="w-5 h-5 text-oxblood shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search orders, products, coupons, or customers (Esc to close)..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button 
            onClick={onClose}
            className="text-xs font-mono bg-muted border border-border px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground"
          >
            ESC
          </button>
        </div>

        {/* Results Viewport */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
          {!query.trim() ? (
            <div className="py-8 text-center text-muted-foreground space-y-2">
              <Search className="w-8 h-8 mx-auto text-muted-foreground/30" />
              <p className="text-xs">Type an order ID, customer name, coupon code, or product name...</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <span className="text-[10px] font-mono bg-muted px-2 py-1 rounded text-muted-foreground">#VX-2026</span>
                <button 
                  onClick={() => {
                    onClose();
                    onSelectTab('custom-orders');
                  }}
                  className="text-[10px] font-mono bg-brass/10 border border-brass/30 px-2 py-1 rounded text-brass hover:bg-brass/20 transition flex items-center gap-1"
                >
                  <Palette className="w-2.5 h-2.5" /> Custom Orders
                </button>
                <button 
                  onClick={() => {
                    onClose();
                    onSelectTab('hero-slider');
                  }}
                  className="text-[10px] font-mono bg-oxblood/10 border border-oxblood/30 px-2 py-1 rounded text-oxblood hover:bg-oxblood/20 transition flex items-center gap-1"
                >
                  <ImageIcon className="w-2.5 h-2.5" /> Hero Sliders
                </button>
                <span className="text-[10px] font-mono bg-muted px-2 py-1 rounded text-muted-foreground">WELCOME10</span>
                <span className="text-[10px] font-mono bg-muted px-2 py-1 rounded text-muted-foreground">Heraldry</span>
              </div>
            </div>
          ) : totalResults === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-xs space-y-2">
              <p>No matching records found for "{query}".</p>
              {(query.toLowerCase().includes('hero') || query.toLowerCase().includes('slider') || query.toLowerCase().includes('slide') || query.toLowerCase().includes('banner')) && (
                <button
                  onClick={() => {
                    onClose();
                    onSelectTab('hero-slider');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-oxblood font-semibold hover:underline"
                >
                  <ImageIcon className="w-3.5 h-3.5" /> Go to Hero Slider Management
                </button>
              )}
              {(query.toLowerCase().includes('custom') || query.toLowerCase().includes('art')) && (
                <button
                  onClick={() => {
                    onClose();
                    onSelectTab('custom-orders');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-oxblood font-semibold hover:underline"
                >
                  <Palette className="w-3.5 h-3.5" /> Go to Custom Orders
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Orders */}
              {searchResults.orders.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2 flex items-center gap-1.5">
                    <ShoppingCart className="w-3 h-3 text-oxblood" /> Orders ({searchResults.orders.length})
                  </div>
                  {searchResults.orders.map(o => {
                    const hasCustomArt = o.items?.some(i => i.userUploadedImage || i.customDesignRef || i.productId === 'custom-bespoke');
                    return (
                      <button
                        key={o.id}
                        onClick={() => {
                          onClose();
                          if (hasCustomArt) {
                            onSelectTab('custom-orders');
                          } else {
                            onSelectTab('orders');
                          }
                          if (onSelectOrder) onSelectOrder(o);
                        }}
                        className="w-full text-left p-2.5 rounded-lg hover:bg-muted/50 transition flex items-center justify-between group"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-oxblood">{o.id}</span>
                            <span className="text-[10px] bg-muted px-1.5 py-0.2 rounded font-semibold uppercase">{o.status}</span>
                            {hasCustomArt && (
                              <span className="text-[9px] font-mono font-bold bg-brass/15 text-brass border border-brass/30 px-1.5 py-0.2 rounded flex items-center gap-1">
                                <ImageIcon className="w-2.5 h-2.5 text-brass" /> Custom Art
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {o.customerName || o.email} · {o.items?.length || 0} items
                            {o.items?.find(i => i.uploadedArtworkName)?.uploadedArtworkName && (
                              <span className="text-foreground/80 font-medium"> · "{o.items.find(i => i.uploadedArtworkName)?.uploadedArtworkName}"</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground">{storeConfig.currency}{o.total.toFixed(2)}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-oxblood group-hover:translate-x-0.5 transition" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Products */}
              {searchResults.products.length > 0 && (
                <div className="space-y-1 border-t border-border/50 pt-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2 flex items-center gap-1.5">
                    <Package className="w-3 h-3 text-brass" /> Products ({searchResults.products.length})
                  </div>
                  {searchResults.products.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        onClose();
                        onSelectTab('products');
                        if (onSelectProduct) onSelectProduct(p);
                      }}
                      className="w-full text-left p-2.5 rounded-lg hover:bg-muted/50 transition flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded bg-muted/40 border border-border flex items-center justify-center text-xs overflow-hidden">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-foreground">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground capitalize">{p.category} · {p.stock ?? 0} in stock</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-foreground">{storeConfig.currency}{p.price}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-oxblood group-hover:translate-x-0.5 transition" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Coupons */}
              {searchResults.coupons.length > 0 && (
                <div className="space-y-1 border-t border-border/50 pt-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2 flex items-center gap-1.5">
                    <Tag className="w-3 h-3 text-purple-600" /> Coupons ({searchResults.coupons.length})
                  </div>
                  {searchResults.coupons.map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onClose();
                        onSelectTab('coupons');
                      }}
                      className="w-full text-left p-2.5 rounded-lg hover:bg-muted/50 transition flex items-center justify-between group"
                    >
                      <div>
                        <span className="font-mono font-bold text-xs bg-oxblood/10 text-oxblood border border-oxblood/20 px-2 py-0.5 rounded">
                          {c.code}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {c.discountType === 'percentage' ? `${c.discountValue}% OFF` : `${storeConfig.currency}${c.discountValue} OFF`}
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-oxblood group-hover:translate-x-0.5 transition" />
                    </button>
                  ))}
                </div>
              )}

              {/* Customers */}
              {searchResults.customers.length > 0 && (
                <div className="space-y-1 border-t border-border/50 pt-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2 flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-blue-600" /> Customers ({searchResults.customers.length})
                  </div>
                  {searchResults.customers.map(c => (
                    <button
                      key={c.email}
                      onClick={() => {
                        onClose();
                        onSelectTab('customers');
                      }}
                      className="w-full text-left p-2.5 rounded-lg hover:bg-muted/50 transition flex items-center justify-between group"
                    >
                      <div>
                        <div className="font-semibold text-xs text-foreground">{c.name || 'Guest Customer'}</div>
                        <div className="text-[10px] text-muted-foreground">{c.email} {c.city ? `· ${c.city}` : ''}</div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-oxblood group-hover:translate-x-0.5 transition" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
