/** Products and categories: public reads; writes go through the admin API (validated and audited server-side). */
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firestoreDb';
import type { CategoryDoc, Product } from '@/types/store';
import { adminAction } from './adminApi';
import { toCategory, toProduct } from './catalogMappers';
import { stripUndefined, useOptimisticMutation } from './optimistic';

export const PRODUCTS_KEY = ['products'] as const;
export const CATEGORIES_KEY = ['categories'] as const;

export async function fetchProducts(): Promise<Product[]> {
  const snap = await getDocs(collection(db, 'products'));
  return snap.docs.map(d => toProduct(d.id, d.data()));
}

export async function fetchCategories(): Promise<CategoryDoc[]> {
  const snap = await getDocs(collection(db, 'categories'));
  return snap.docs.map(d => toCategory(d.id, d.data()));
}

export function useProducts() {
  return useQuery({ queryKey: PRODUCTS_KEY, queryFn: fetchProducts, staleTime: 60_000 });
}

export function useCategories() {
  return useQuery({ queryKey: CATEGORIES_KEY, queryFn: fetchCategories, staleTime: 5 * 60_000 });
}

export function useProductMutations() {
  const save = useOptimisticMutation<Product[], Product>({
    queryKey: PRODUCTS_KEY,
    // The API validates and audits; on an existing product it keeps the live stock (reservations move it) and
    // replaces everything else, so cleared optional fields disappear. Stock edits go through ADJUST_STOCK.
    mutationFn: async product => { await adminAction('SAVE_PRODUCT', { product: stripUndefined(product) }); },
    apply: (cur = [], product) =>
      cur.some(p => p.id === product.id) ? cur.map(p => (p.id === product.id ? product : p)) : [product, ...cur],
    failureMessage: 'Could not save product',
  });

  const remove = useOptimisticMutation<Product[], string>({
    queryKey: PRODUCTS_KEY,
    mutationFn: async id => { await adminAction('DELETE_PRODUCT', { id }); },
    apply: (cur = [], id) => cur.filter(p => p.id !== id),
    failureMessage: 'Could not delete product',
  });

  const adjustStock = useOptimisticMutation<Product[], { id: string; delta: number; reason?: string }>({
    queryKey: PRODUCTS_KEY,
    mutationFn: ({ id, delta, reason }) => adminAction('ADJUST_STOCK', { productId: id, delta, reason }),
    apply: (cur = [], { id, delta }) => cur.map(p => (p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p)),
    failureMessage: 'Could not update stock',
  });

  const saveCategory = useOptimisticMutation<CategoryDoc[], CategoryDoc>({
    queryKey: CATEGORIES_KEY,
    mutationFn: async category => { await adminAction('SAVE_CATEGORY', { category: stripUndefined(category) }); },
    apply: (cur = [], category) =>
      cur.some(c => c.id === category.id) ? cur.map(c => (c.id === category.id ? category : c)) : [...cur, category],
    failureMessage: 'Could not save category',
  });

  const removeCategory = useOptimisticMutation<CategoryDoc[], string>({
    queryKey: CATEGORIES_KEY,
    mutationFn: async id => { await adminAction('DELETE_CATEGORY', { id }); },
    apply: (cur = [], id) => cur.filter(c => c.id !== id),
    failureMessage: 'Could not delete category',
  });

  return {
    saveProduct: save.run,
    deleteProduct: remove.run,
    adjustStock: adjustStock.run,
    saveCategory: saveCategory.run,
    deleteCategory: removeCategory.run,
  };
}
