import { useMemo } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useProducts } from '@/lib/data/products';
import { DEFAULT_STORE_CONFIG, useStoreConfig } from '@/lib/data/settings';
import { useAdminOrdersInStatuses } from '@/lib/data/orders';
import type { OrderStatus } from '@/lib/orders/orderStateMachine';
import { defaultLeadTimeDays, orderLeadTimeDays, slaState, workshopQueryStatuses } from '@/lib/orders/productionQueue';
import type { Order, Product } from '@/types/store';

const NO_PRODUCTS: Product[] = [];

/** Orders in the given stages plus the catalog data and SLA helper the workshop screens need. */
export function useWorkshopQueue(stages: readonly OrderStatus[]) {
  const { permissions } = useAuth();
  const products = useProducts().data ?? NO_PRODUCTS;
  const storeConfig = useStoreConfig().data ?? DEFAULT_STORE_CONFIG;
  const enabled = Boolean(permissions?.canManageProduction || permissions?.canManageOrders);
  const feed = useAdminOrdersInStatuses(enabled, workshopQueryStatuses(stages));
  const defaultDays = defaultLeadTimeDays(storeConfig);

  const slaFor = useMemo(() => (order: Order) =>
    slaState(order.placedAt, orderLeadTimeDays(order, products, defaultDays), Date.now()),
  [products, defaultDays]);

  return { ...feed, products, storeName: storeConfig.storeName, slaFor };
}
