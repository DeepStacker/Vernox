import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { safeLocal } from './safeStorage';
import { addLine, moveSavedToCart, saveLineForLater } from './cartLines';

export interface CartItem {
  id: string; // uuid per line
  productId: string;
  productName: string;
  productSlug: string;
  shapeId: string;
  sizeLabel: string;
  widthMm: number;
  heightMm: number;
  finish: string;
  unitPrice: number;
  quantity: number;
  customDesignThumb?: string; // dataURL preview from customizer
  customDesignRef?: string;   // full Crafting Studio design JSON (layers, material, dimensions); the server stores it on the order for production
  userUploadedImage?: string; // Client reference artwork uploaded in Crafting Studio
  uploadedArtworkName?: string;
}

export interface AppliedCoupon {
  code: string;
  discountAmount: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  description?: string;
}

interface CartCtx {
  items: CartItem[];
  add: (item: Omit<CartItem, 'id' | 'quantity'> & { quantity?: number }) => void;
  updateQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  /** Items moved out of the cart to buy later (kept in this browser; see src/lib/cartLines.ts). */
  saved: CartItem[];
  saveForLater: (id: string) => void;
  moveToCart: (id: string) => void;
  removeSaved: (id: string) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  isDrawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  appliedCoupon: AppliedCoupon | null;
  applyCoupon: (coupon: AppliedCoupon) => void;
  removeCoupon: () => void;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = 'vernox-cart';
const SAVED_KEY = 'vernox-saved-for-later';
const COUPON_KEY = 'vernox-applied-coupon';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    return safeLocal.getJson<CartItem[]>(KEY, []);
  });
  const [saved, setSaved] = useState<CartItem[]>(() => safeLocal.getJson<CartItem[]>(SAVED_KEY, []));
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(() => {
    return safeLocal.getJson<AppliedCoupon | null>(COUPON_KEY, null);
  });
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    // Strip oversize base64 previews (>15KB) so the cart fits in storage.
    const sanitized = items.map(item =>
      item.customDesignThumb && item.customDesignThumb.length > 15000 ? { ...item, customDesignThumb: undefined } : item,
    );
    if (safeLocal.setJson(KEY, sanitized)) return;
    // Quota exceeded or storage unavailable: retry without any previews.
    const stripped = items.map(item => ({ ...item, customDesignThumb: undefined }));
    if (!safeLocal.setJson(KEY, stripped)) {
      console.warn('[cart] could not persist cart to local storage; it will not survive a reload.');
    }
  }, [items]);

  useEffect(() => {
    // Same quota handling as the cart: drop oversize previews, then all previews, before giving up.
    const light = saved.map(item => (item.customDesignThumb && item.customDesignThumb.length > 15000 ? { ...item, customDesignThumb: undefined } : item));
    if (safeLocal.setJson(SAVED_KEY, light)) return;
    if (!safeLocal.setJson(SAVED_KEY, saved.map(item => ({ ...item, customDesignThumb: undefined })))) {
      console.warn('[cart] could not persist saved-for-later items; they will not survive a reload.');
    }
  }, [saved]);

  const add: CartCtx['add'] = (item) => {
    setItems(prev => addLine(prev, item, () => crypto.randomUUID()));
    setDrawerOpen(true); // Auto open cart drawer when item is added!
  };

  const saveForLater = (id: string) => {
    const next = saveLineForLater({ items, saved }, id, () => crypto.randomUUID());
    setItems(next.items);
    setSaved(next.saved);
  };

  const moveToCart = (id: string) => {
    const next = moveSavedToCart({ items, saved }, id, () => crypto.randomUUID());
    setItems(next.items);
    setSaved(next.saved);
  };

  const removeSaved = (id: string) => setSaved(prev => prev.filter(i => i.id !== id));

  const updateQty = (id: string, qty: number) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, qty) } : i));

  const remove = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const applyCoupon = (coupon: AppliedCoupon) => {
    setAppliedCoupon(coupon);
    safeLocal.setJson(COUPON_KEY, coupon);
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    safeLocal.remove(COUPON_KEY);
  };

  const clear = () => {
    setItems([]);
    removeCoupon();
  };

  useEffect(() => {
    if (items.length === 0 && appliedCoupon) {
      removeCoupon();
    }
  }, [items.length]);

  const count = items.reduce((a, i) => a + i.quantity, 0);
  const subtotal = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);

  return (
    <Ctx.Provider value={{ 
      items, add, updateQty, remove, saved, saveForLater, moveToCart, removeSaved, clear, count, subtotal, 
      isDrawerOpen, setDrawerOpen,
      appliedCoupon, applyCoupon, removeCoupon 
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used within CartProvider');
  return c;
}
