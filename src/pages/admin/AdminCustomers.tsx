/**
 * Enterprise Admin Customers Management View
 * Features: Complete patron directory, purchase frequency telemetry,
 * total lifetime spend, shipping destinations, and customer order inspection.
 */

import { useState, useMemo } from 'react';
import { isRevenueStatus } from '@/lib/orders/orderStateMachine';
import { useAdminData } from '@/lib/data/adminData';
import type { CustomerAccount, Order } from '@/types/store';
import { 
  Users, Search, ShoppingBag, MapPin, Mail, 
  Phone, Calendar, ArrowUpRight, Eye, ShieldCheck, ChevronRight, X
} from 'lucide-react';

export function AdminCustomers() {
  const { customers, orders, storeConfig } = useAdminData();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerAccount | null>(null);

  // Derive per-customer analytics
  const customerAnalytics = useMemo(() => {
    const statsMap = new Map<string, { totalOrders: number; lifetimeSpend: number; lastOrderDate: number; ordersList: Order[] }>();

    orders.forEach(o => {
      if (o.email && isRevenueStatus(o.status)) {
        const em = o.email.trim().toLowerCase();
        const current = statsMap.get(em) || { totalOrders: 0, lifetimeSpend: 0, lastOrderDate: 0, ordersList: [] };
        current.totalOrders += 1;
        current.lifetimeSpend += (o.total || 0);
        const orderTime = o.placedAt;
        if (orderTime > current.lastOrderDate) {
          current.lastOrderDate = orderTime;
        }
        current.ordersList.push(o);
        statsMap.set(em, current);
      }
    });

    return statsMap;
  }, [orders]);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const q = searchQuery.toLowerCase();
      const matchesName = c.name?.toLowerCase().includes(q);
      const matchesEmail = c.email?.toLowerCase().includes(q);
      const matchesCity = c.city?.toLowerCase().includes(q);
      const matchesCountry = c.country?.toLowerCase().includes(q);
      return matchesName || matchesEmail || matchesCity || matchesCountry;
    });
  }, [customers, searchQuery]);

  // Aggregates
  const totalCustomers = customers.length;
  const activeBuyers = customerAnalytics.size;
  const totalCustomerRevenue = Array.from(customerAnalytics.values()).reduce((sum, s) => sum + s.lifetimeSpend, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl text-oxblood-deep">Customer Directory</h2>
          <p className="text-muted-foreground text-sm">
            Overview of registered collectors, order frequency, lifetime spend, and geographical destinations.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
            <span>Total Customers</span>
            <Users className="w-4 h-4 text-oxblood" />
          </div>
          <div className="font-display text-2xl text-foreground mt-2">{totalCustomers}</div>
        </div>

        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
            <span>Active Purchasing Accounts</span>
            <ShoppingBag className="w-4 h-4 text-brass" />
          </div>
          <div className="font-display text-2xl text-foreground mt-2">{activeBuyers}</div>
        </div>

        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
            <span>Combined Lifetime Spend</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-display text-2xl text-emerald-600 mt-2">
            {storeConfig.currency}{totalCustomerRevenue.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, city, or country..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-oxblood transition"
          />
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-card border border-border/70 rounded-xl overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="p-4">Customer Name</th>
                <th className="p-4">Contact Details</th>
                <th className="p-4">Location</th>
                <th className="p-4">Total Orders</th>
                <th className="p-4">Lifetime Spend</th>
                <th className="p-4">Last Order</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="font-medium text-foreground">No customer records matching search</p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(c => {
                  const analytics = customerAnalytics.get(c.email.toLowerCase()) || {
                    totalOrders: 0,
                    lifetimeSpend: 0,
                    lastOrderDate: 0,
                    ordersList: []
                  };

                  return (
                    <tr key={c.email} className="hover:bg-muted/20 transition group">
                      <td className="p-4">
                        <div className="font-semibold text-foreground flex items-center gap-2">
                          <span>{c.name || 'Anonymous Customer'}</span>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="text-xs text-foreground flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{c.email}</span>
                        </div>
                        {c.phone && (
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 font-mono">
                            <Phone className="w-3 h-3 text-muted-foreground" />
                            <span>{c.phone}</span>
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-xs text-muted-foreground">
                        {(c.city || c.country) ? (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{[c.city, c.country].filter(Boolean).join(', ')}</span>
                          </div>
                        ) : (
                          <span>—</span>
                        )}
                      </td>

                      <td className="p-4 font-mono text-xs">
                        {analytics.totalOrders > 0 ? (
                          <span className="bg-muted px-2 py-0.5 rounded font-semibold text-foreground">
                            {analytics.totalOrders} {analytics.totalOrders === 1 ? 'order' : 'orders'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No orders</span>
                        )}
                      </td>

                      <td className="p-4 font-mono font-semibold text-oxblood-deep">
                        {storeConfig.currency}{analytics.lifetimeSpend.toFixed(2)}
                      </td>

                      <td className="p-4 text-xs text-muted-foreground">
                        {analytics.lastOrderDate > 0 ? (
                          new Date(analytics.lastOrderDate).toLocaleDateString()
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="p-4 text-right">
                        <button
                          onClick={() => setSelectedCustomer(c)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-oxblood hover:underline p-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CUSTOMER DETAILS MODAL */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl p-6 shadow-luxe space-y-5 animate-scale-in max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-display text-xl text-oxblood-deep">
                  Customer Profile: {selectedCustomer.name}
                </h3>
                <p className="text-xs text-muted-foreground">{selectedCustomer.email}</p>
              </div>
              <button 
                onClick={() => setSelectedCustomer(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition"
                aria-label="Close profile"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Profile Overview */}
            <div className="grid grid-cols-2 gap-4 bg-muted/30 border border-border/60 rounded-lg p-4 text-xs">
              <div className="space-y-1">
                <span className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">Shipping Address:</span>
                <p className="font-medium text-foreground">{selectedCustomer.address || 'Not specified'}</p>
                <p className="text-muted-foreground">
                  {[selectedCustomer.city, selectedCustomer.state, selectedCustomer.pincode, selectedCustomer.country].filter(Boolean).join(', ') || 'No locality provided'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">Contact:</span>
                <p className="font-medium text-foreground">{selectedCustomer.email}</p>
                {selectedCustomer.phone && <p className="font-mono text-muted-foreground">{selectedCustomer.phone}</p>}
              </div>
            </div>

            {/* Orders History List */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Placed Order Invoices
              </h4>

              {(() => {
                const analytics = customerAnalytics.get(selectedCustomer.email.toLowerCase());
                const ordersList = analytics?.ordersList || [];

                if (ordersList.length === 0) {
                  return (
                    <div className="py-8 text-center text-muted-foreground border border-dashed border-border rounded-lg">
                      <p className="text-xs">This customer has not completed any online checkout orders yet.</p>
                    </div>
                  );
                }

                return (
                  <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/60">
                    {ordersList.map(o => (
                      <div key={o.id} className="p-3.5 flex items-center justify-between hover:bg-muted/20 text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-oxblood">{o.id.slice(-8)}</span>
                            <span className="px-2 py-0.5 bg-muted rounded font-semibold uppercase text-[10px]">
                              {o.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(o.placedAt || 0).toLocaleString()} · {o.items?.length || 0} items
                          </p>
                        </div>
                        <div className="font-mono font-bold text-foreground">
                          {storeConfig.currency}{(o.total || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg transition"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
