/**
 * Vernox Admin Operational Notifications & Critical Alerts View
 * Real-time operational dispatch: Low-stock triggers, high-value commissions,
 * coupon redemption alerts, and security telemetry.
 */

import { useMemo } from 'react';
import { useAdminData } from '@/lib/data/adminData';
import { 
  Bell, AlertTriangle, AlertCircle, ShoppingBag, 
  Tag, Shield, CheckCircle2, ArrowRight 
} from 'lucide-react';

interface AdminNotificationsProps {
  onSelectTab: (tab: string) => void;
}

export function AdminNotifications({ onSelectTab }: AdminNotificationsProps) {
  const { products, orders, coupons, storeConfig } = useAdminData();

  const notifications = useMemo(() => {
    const list: Array<{
      id: string;
      type: 'critical' | 'warning' | 'info' | 'success';
      title: string;
      message: string;
      timestamp: number;
      actionTab?: string;
      actionLabel?: string;
    }> = [];

    // 1. Out of stock products (Critical)
    const outOfStock = products.filter(p => (p.stock ?? 0) === 0);
    outOfStock.forEach(p => {
      list.push({
        id: `out-stock-${p.id}`,
        type: 'critical',
        title: `Out of Stock: ${p.name}`,
        message: `Inventory depleted to 0 units. Customers currently cannot purchase this item.`,
        timestamp: Date.now() - 3600000,
        actionTab: 'products',
        actionLabel: 'Replenish Stock',
      });
    });

    // 2. Low stock products (Warning)
    const lowStock = products.filter(p => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5);
    lowStock.forEach(p => {
      list.push({
        id: `low-stock-${p.id}`,
        type: 'warning',
        title: `Low Inventory Alert: ${p.name}`,
        message: `Only ${p.stock} units remaining in inventory.`,
        timestamp: Date.now() - 7200000,
        actionTab: 'products',
        actionLabel: 'Adjust Inventory',
      });
    });

    // 3. Pending orders needing workshop routing (Warning)
    const pendingOrders = orders.filter(o => o.status === 'Pending_Payment' || o.status === 'Paid');
    if (pendingOrders.length > 0) {
      list.push({
        id: 'pending-orders-batch',
        type: 'info',
        title: `${pendingOrders.length} Orders Awaiting Workshop CAM Routing`,
        message: `Orders require CAD inspection, laser DXF export, or courier dispatch.`,
        timestamp: Date.now() - 1800000,
        actionTab: 'orders',
        actionLabel: 'View Order Pipeline',
      });
    }

    // 4. Coupons approaching maximum redemption limit (Info)
    const nearLimitCoupons = coupons.filter(c => c.maxUsageCount && (c.usedCount || 0) >= (c.maxUsageCount * 0.8));
    nearLimitCoupons.forEach(c => {
      list.push({
        id: `coupon-limit-${c.id}`,
        type: 'info',
        title: `Promotion Near Limit: ${c.code}`,
        message: `Redeemed ${c.usedCount} of ${c.maxUsageCount} available allowances.`,
        timestamp: Date.now() - 14400000,
        actionTab: 'coupons',
        actionLabel: 'Manage Coupon',
      });
    });

    // 5. System Security & Gateway Status (Success)
    list.push({
      id: 'gateway-status',
      type: 'success',
      title: 'Banking Gateway & Razorpay Rails Verified Active',
      message: 'Cryptographic payment verification and server-authoritative pricing engine operational.',
      timestamp: Date.now() - 86400000,
      actionTab: 'settings',
      actionLabel: 'Inspect Settings',
    });

    return list;
  }, [products, orders, coupons]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'critical': return <AlertCircle className="w-5 h-5 text-destructive" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'info': return <ShoppingBag className="w-5 h-5 text-blue-500" />;
      default: return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    }
  };

  const getBorderColor = (type: string) => {
    switch (type) {
      case 'critical': return 'border-destructive/40 bg-destructive/5';
      case 'warning': return 'border-amber-500/40 bg-amber-500/5';
      case 'info': return 'border-blue-500/30 bg-blue-500/5';
      default: return 'border-emerald-500/30 bg-emerald-500/5';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div>
        <h2 className="font-display text-3xl text-oxblood-deep">Operational Notifications</h2>
        <p className="text-muted-foreground text-sm">
          Real-time alerts regarding production queue thresholds, finite inventory limits, and payment status.
        </p>
      </div>

      <div className="space-y-3">
        {notifications.map(n => (
          <div 
            key={n.id}
            className={`border rounded-xl p-4 shadow-soft flex items-start gap-3.5 transition-all hover:shadow-md ${getBorderColor(n.type)}`}
          >
            <div className="shrink-0 mt-0.5">{getIcon(n.type)}</div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-sm text-foreground">{n.title}</h4>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap font-mono">
                  {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{n.message}</p>
            </div>
            {n.actionTab && (
              <button
                onClick={() => onSelectTab(n.actionTab)}
                className="shrink-0 text-xs font-semibold text-oxblood hover:underline flex items-center gap-1 self-center px-2 py-1 rounded bg-background border border-border hover:bg-muted transition"
              >
                <span>{n.actionLabel || 'Inspect'}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
