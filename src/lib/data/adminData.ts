/**
 * Read model for the admin panel. Only used inside the admin shell, so none of these queries
 * run on the public storefront. Every query is additionally gated by the signed-in role.
 */
import { useMemo } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCatalog } from '@/lib/catalogContext';
import { deriveCustomers, useAdminOrders } from './orders';
import { useCoupons } from './coupons';

export function useAdminData() {
  const { permissions } = useAuth();
  const catalog = useCatalog();

  const canReadOrders = Boolean(
    permissions &&
      (permissions.canManageOrders || permissions.canManageProduction || permissions.canManageShipping ||
        permissions.canManageFinance || permissions.canManageSupport),
  );
  const ordersQuery = useAdminOrders(canReadOrders);
  const coupons = useCoupons(Boolean(permissions?.canManageCoupons));
  const customers = useMemo(() => deriveCustomers(ordersQuery.orders), [ordersQuery.orders]);

  return {
    products: catalog.products,
    categories: catalog.categories,
    storeConfig: catalog.storeConfig,
    homepageSettings: catalog.homepageSettings,
    topics: catalog.topics,
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
