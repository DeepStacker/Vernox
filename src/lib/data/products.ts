/** Products and categories: public reads, claim-gated admin writes (enforced by Firestore rules). */
import { useQuery } from '@tanstack/react-query';
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CategoryDoc, Product } from '@/types/store';
import { logAudit } from './adminApi';
import { stripUndefined, useOptimisticMutation } from './optimistic';

export const PRODUCTS_KEY = ['products'] as const;
export const CATEGORIES_KEY = ['categories'] as const;

function toProduct(id: string, raw: Record<string, unknown>): Product {
  const p = raw as Partial<Product>;
  return {
    ...(p as Product),
    id,
    finishes: Array.isArray(p.finishes) ? p.finishes : [],
    sizes: Array.isArray(p.sizes) ? p.sizes : [],
    stock: typeof p.stock === 'number' ? p.stock : 0,
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const snap = await getDocs(collection(db, 'products'));
  return snap.docs.map(d => toProduct(d.id, d.data()));
}

export async function fetchCategories(): Promise<CategoryDoc[]> {
  const snap = await getDocs(collection(db, 'categories'));
  return snap.docs.map(d => ({ ...(d.data() as CategoryDoc), id: d.id as CategoryDoc['id'] }));
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
    mutationFn: async product => {
      await setDoc(doc(db, 'products', product.id), stripUndefined(product));
      logAudit('PRODUCT_SAVED', 'product', product.id, { name: product.name });
    },
    apply: (cur = [], product) =>
      cur.some(p => p.id === product.id) ? cur.map(p => (p.id === product.id ? product : p)) : [product, ...cur],
    failureMessage: 'Could not save product',
  });

  const remove = useOptimisticMutation<Product[], string>({
    queryKey: PRODUCTS_KEY,
    mutationFn: async id => {
      await deleteDoc(doc(db, 'products', id));
      logAudit('PRODUCT_DELETED', 'product', id);
    },
    apply: (cur = [], id) => cur.filter(p => p.id !== id),
    failureMessage: 'Could not delete product',
  });

  const setStock = useOptimisticMutation<Product[], { id: string; stock: number }>({
    queryKey: PRODUCTS_KEY,
    mutationFn: async ({ id, stock }) => {
      await updateDoc(doc(db, 'products', id), { stock, updatedAt: Date.now() });
      logAudit('STOCK_UPDATED', 'inventory', id, { stock });
    },
    apply: (cur = [], { id, stock }) => cur.map(p => (p.id === id ? { ...p, stock } : p)),
    failureMessage: 'Could not update stock',
  });

  const saveCategory = useOptimisticMutation<CategoryDoc[], CategoryDoc>({
    queryKey: CATEGORIES_KEY,
    mutationFn: async category => {
      await setDoc(doc(db, 'categories', category.id), stripUndefined(category));
      logAudit('CATEGORY_SAVED', 'category', category.id);
    },
    apply: (cur = [], category) =>
      cur.some(c => c.id === category.id) ? cur.map(c => (c.id === category.id ? category : c)) : [...cur, category],
    failureMessage: 'Could not save category',
  });

  const removeCategory = useOptimisticMutation<CategoryDoc[], string>({
    queryKey: CATEGORIES_KEY,
    mutationFn: async id => {
      await deleteDoc(doc(db, 'categories', id));
      logAudit('CATEGORY_DELETED', 'category', id);
    },
    apply: (cur = [], id) => cur.filter(c => c.id !== id),
    failureMessage: 'Could not delete category',
  });

  return {
    saveProduct: save.run,
    deleteProduct: remove.run,
    setStock: setStock.run,
    saveCategory: saveCategory.run,
    deleteCategory: removeCategory.run,
  };
}
