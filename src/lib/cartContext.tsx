import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { safeLocal } from './safeStorage';

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
const COUPON_KEY = 'vernox-applied-coupon';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    return safeLocal.getJson<CartItem[]>(KEY, []);
  });
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

  const add: CartCtx['add'] = (item) => {
    setItems(prev => {
      // If it is a standard non-custom item, coalesce matching attributes
      if (!item.customDesignThumb && !item.customDesignRef) {
        const existingIndex = prev.findIndex(
          i => i.productId === item.productId &&
               i.shapeId === item.shapeId &&
               i.sizeLabel === item.sizeLabel &&
               i.finish === item.finish &&
               !i.customDesignRef &&
               !i.customDesignThumb
        );
        if (existingIndex > -1) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + (item.quantity ?? 1)
          };
          return updated;
        }
      }
      return [
        ...prev,
        { ...item, id: crypto.randomUUID(), quantity: item.quantity ?? 1 },
      ];
    });
    setDrawerOpen(true); // Auto open cart drawer when item is added!
  };
  
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
      items, add, updateQty, remove, clear, count, subtotal, 
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
