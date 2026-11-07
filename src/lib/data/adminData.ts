/**
 * Read model for the admin panel. Only used inside the admin shell, so none of these queries
 * run on the public storefront. Every query is additionally gated by the signed-in role.
 * Catalogue and settings are read live from Firestore (not the CDN-cached /api/catalog the storefront
 * uses), so staff see their own saves immediately.
 */
import { useMemo } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { DEFAULT_HOMEPAGE_SETTINGS, DEFAULT_STORE_CONFIG } from './catalogMappers';
import { deriveCustomers, useAdminOrders } from './orders';
import { useCategories, useProducts } from './products';
import { useHomepageSettings, useStoreConfig, useTopics } from './settings';
import { useCoupons } from './coupons';

export function useAdminData() {
  const { permissions } = useAuth();
  const products = useProducts();
  const categories = useCategories();
  const storeConfig = useStoreConfig();
  const homepage = useHomepageSettings();
  const topics = useTopics();

  const canReadOrders = Boolean(
    permissions &&
      (permissions.canManageOrders || permissions.canManageProduction || permissions.canManageShipping ||
        permissions.canManageFinance || permissions.canManageSupport),
  );
  const ordersQuery = useAdminOrders(canReadOrders);
  const coupons = useCoupons(Boolean(permissions?.canManageCoupons));
  const customers = useMemo(() => deriveCustomers(ordersQuery.orders), [ordersQuery.orders]);

  return {
    products: products.data ?? [],
    categories: categories.data ?? [],
    storeConfig: storeConfig.data ?? DEFAULT_STORE_CONFIG,
    homepageSettings: homepage.data ?? DEFAULT_HOMEPAGE_SETTINGS,
    topics: topics.data ?? [],
    orders: ordersQuery.orders,
    ordersLoading: ordersQuery.isLoading,
    ordersError: ordersQuery.error,
    hasMoreOrders: ordersQuery.hasMore,
    loadMoreOrders: ordersQuery.loadMore,
    isLoadingMoreOrders: ordersQuery.isFetchingMore,
    customers,
    coupons: coupons.data ?? [],
  };
}
