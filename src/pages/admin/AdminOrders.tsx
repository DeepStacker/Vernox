/**
 * Vernox Atelier Commissions Management View
 * Bespoke orders table, interactive filters, CSV export, CAM production routing,
 * and high-precision laser fabrication inspector.
 * - Tab row: All Orders, Open, Unfulfilled, Unpaid, From Canada (and Country selector), Paid Orders, Customers
 * - Search bar, interactive Filters popover, Download CSV export, and Pagination
 * - Multi-select checkbox column with floating bulk action bar
 * - Table columns: ORDER, DATE, CUSTOMER, STATUS, TOTAL
 * - Full Order Inspector modal with items, 1-Click CAM production downloads (DXF, SVG, PDF), and shipping tracking.
 */

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAdminData } from '@/lib/data/adminData';
import { useOrderMutations } from '@/lib/data/orders';
import { hasCustomDesign } from '@/lib/orders/camDocument';
import { downloadProductionFile } from '@/lib/orders/camDownload';
import { freeText, withFreeText } from '@/lib/orders/orderNotes';
import {
  ORDER_STATUS_LABELS, isRevenueStatus, nextClientStatuses, type OrderStatus,
} from '@/lib/orders/orderStateMachine';
import type { Order } from '@/types/store';
import { 
  Search, Filter as FilterIcon, Download, ChevronLeft, ChevronRight, 
  Check, CheckSquare, Square, X, MoreHorizontal, ArrowUpRight,
  Eye, Trash2, Printer, FileCode, FileText, ExternalLink,
  MapPin, Phone, Mail, Clock, Package, AlertCircle, ShoppingCart,
  Scissors, Truck, ShieldCheck, Tag, ZoomIn, Image as ImageIcon,
  Gift, Percent, ShoppingBag, Leaf
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminPageHeader } from '@/components/admin/AdminUi';
import { StatusBadge } from './shared/badges';

export interface AdminOrdersProps {
  initialFilter?: 'all' | 'open' | 'unfulfilled' | 'unpaid' | 'paid' | 'customers' | 'custom';
  onSelectTab?: (tab: string) => void;
}

export function AdminOrders({ initialFilter = 'all', onSelectTab }: AdminOrdersProps) {
  const { orders, storeConfig, ordersLoading, ordersError, hasMoreOrders, loadMoreOrders, isLoadingMoreOrders } = useAdminData();
  const { permissions, staffRole, user } = useAuth();
  const { updateOrder: saveOrderUpdate } = useOrderMutations();
  const actor = { email: user?.email ?? 'unknown', role: staffRole ?? 'support' };
  const canEdit = Boolean(permissions && (permissions.canManageOrders || permissions.canManageProduction || permissions.canManageShipping));
  const navigate = useNavigate();

  // Active Tab Filter (Matching Image 1)
  const [activeTab, setActiveTab] = useState<'all' | 'open' | 'unfulfilled' | 'unpaid' | 'paid' | 'customers' | 'custom'>(
    initialFilter || 'all'
  );

  // Search & Detailed Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [welcomeSearch, setWelcomeSearch] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | 'last7' | 'last30'>('all');
  const [minTotal, setMinTotal] = useState<string>('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Multi-Select State
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Flyout Order Details Inspector State
  const [inspectingOrder, setInspectingOrder] = useState<Order | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  // Inspector Form State
  const [trackingCarrier, setTrackingCarrier] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  // Sync initial inspecting order fields when opened
  useEffect(() => {
    if (inspectingOrder) {
      setTrackingCarrier(inspectingOrder.tracking?.carrier || '');
      setTrackingNumber(inspectingOrder.tracking?.trackingNumber || '');
      setEstimatedDelivery(inspectingOrder.tracking?.estimatedDelivery || '');
      setAssignedTo(inspectingOrder.assignedTo || '');
      // The structured QC/package block in `notes` is edited only by the QC console.
      setAdminNotes(freeText(inspectingOrder.adminNotes));
    }
  }, [inspectingOrder]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxImage) setLightboxImage(null);
        else if (inspectingOrder) setInspectingOrder(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectingOrder, lightboxImage]);

  // Format Date matching Image 1: e.g. "04/05/2026 10:08AM"
  const formatOrderDate = (timestamp: number | string | undefined) => {
    if (!timestamp) return '—';
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = String(hours).padStart(2, '0');
    return `${day}/${month}/${year} ${formattedHours}:${minutes}${ampm}`;
  };

  const currency = storeConfig.currency || '₹';

  // Master Filter Logic
  const filteredOrders = useMemo(() => {
    const query = (searchQuery || welcomeSearch).trim().toLowerCase();
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;

    return orders.filter(order => {
      // 1. Text Search across Order ID, Customer name, Email, City
      if (query) {
        const idMatch = order.id.toLowerCase().includes(query);
        const nameMatch = order.customerName?.toLowerCase().includes(query) || order.orderNumber?.toLowerCase().includes(query);
        const emailMatch = order.email.toLowerCase().includes(query);
        const cityMatch = order.shippingCity?.toLowerCase().includes(query);
        const itemMatch = order.items?.some(i => i.productName.toLowerCase().includes(query));
        if (!idMatch && !nameMatch && !emailMatch && !cityMatch && !itemMatch) {
          return false;
        }
      }

      // 2. Tab Filter
      if (activeTab === 'open') {
        if (['Delivered', 'Cancelled', 'Refunded', 'Expired', 'Payment_Failed', 'Returned'].includes(order.status)) return false;
      } else if (activeTab === 'unfulfilled') {
        if (!['Paid', 'In_Design', 'Cutting', 'Finishing', 'Quality_Check', 'Packed'].includes(order.status)) return false;
      } else if (activeTab === 'unpaid') {
        if (!['Pending_Payment', 'Payment_Failed', 'Expired'].includes(order.status)) return false;
      } else if (activeTab === 'paid') {
        if (!isRevenueStatus(order.status)) return false;
      } else if (activeTab === 'custom') {
        const isCustom = order.items?.some(i => hasCustomDesign(i) || i.userUploadedImage || i.productId === 'custom-bespoke');
        if (!isCustom) return false;
      }

      // 3. Dropdown Popover Filters
      if (filterStatus !== 'all' && order.status !== filterStatus) return false;
      if (filterDateRange === 'today') {
        if (now - order.placedAt > dayMs) return false;
      } else if (filterDateRange === 'last7') {
        if (now - order.placedAt > 7 * dayMs) return false;
      } else if (filterDateRange === 'last30') {
        if (now - order.placedAt > 30 * dayMs) return false;
      }

      if (minTotal && Number(minTotal) > 0) {
        if (order.total < Number(minTotal)) return false;
      }

      return true;
    }).sort((a, b) => b.placedAt - a.placedAt);
  }, [
    orders, searchQuery, welcomeSearch, activeTab, filterStatus, filterDateRange, minTotal
  ]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(start, start + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, welcomeSearch, activeTab, filterStatus, filterDateRange, minTotal]);

  // Bulk Selection Handlers
  const isAllCurrentPageSelected = paginatedOrders.length > 0 && paginatedOrders.every(o => selectedOrderIds.has(o.id));
  const toggleSelectAllPage = () => {
    const next = new Set(selectedOrderIds);
    if (isAllCurrentPageSelected) {
      paginatedOrders.forEach(o => next.delete(o.id));
    } else {
      paginatedOrders.forEach(o => next.add(o.id));
    }
    setSelectedOrderIds(next);
  };

  const toggleSelectOrder = (id: string) => {
    const next = new Set(selectedOrderIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedOrderIds(next);
  };

  // Instant CSV Export
  const handleExportCSV = (ordersToExport = filteredOrders) => {
    if (ordersToExport.length === 0) {
      toast.error('No orders available to export');
      return;
    }

    const headers = [
      'Order ID', 'Date', 'Customer Name', 'Email', 
      'Status', 'Total', 
      'Items Count', 'Shipping City', 'Shipping State', 
      'Tracking Carrier', 'Tracking Number'
    ];

    const rows = ordersToExport.map(o => [
      `"${o.orderNumber || o.id}"`,
      `"${formatOrderDate(o.placedAt)}"`,
      `"${o.customerName || ''}"`,
      `"${o.email}"`,
      `"${ORDER_STATUS_LABELS[o.status]}"`,
      o.total,
      o.items?.length || 0,
      `"${o.shippingCity || ''}"`,
      `"${o.shippingState || ''}"`,
      `"${o.tracking?.carrier || ''}"`,
      `"${o.tracking?.trackingNumber || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `vernox_orders_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${ordersToExport.length} orders to CSV`);
  };

  // 1-Click CAM export: customer designs are exported as designed; catalog items use their outline.
  const handleDownloadCAM = (order: Order, item: Order['items'][0], format: 'svg' | 'dxf' | 'pdf') => {
    try {
      const source = downloadProductionFile(order, item, format);
      toast.success(
        `${format.toUpperCase()} generated for ${item.productName}` +
          (source === 'customer-design' ? ' from the customer design' : ' from the catalog outline'),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to generate ${format.toUpperCase()} CAM file`);
    }
  };

  const renderStatusTag = (status: OrderStatus) => <StatusBadge status={status} />;

  const persist = async (order: Order, update: Parameters<typeof saveOrderUpdate>[0]['update']) => {
    const ok = await saveOrderUpdate({ order, update, actor });
    if (ok) {
      setInspectingOrder(prev => (prev && prev.id === order.id ? {
        ...prev,
        status: update.status ?? prev.status,
        tracking: update.tracking ?? prev.tracking,
        assignedTo: update.assignedTo ?? prev.assignedTo,
        adminNotes: update.notes ?? prev.adminNotes,
      } : prev));
    }
    return ok;
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in max-w-[1440px] mx-auto">
      <AdminPageHeader
        title={initialFilter === 'custom' ? 'Custom designs' : 'Orders'}
        line="Find an order, check its payment, move it forward and keep notes."
        actions={(
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={welcomeSearch} aria-label="Search orders" onChange={e => { setWelcomeSearch(e.target.value); setSearchQuery(''); }}
              placeholder="Order, name, email or place" className="field pl-9" />
          </div>
        )}
      />

      {/* Queue tabs */}
      <div className="flex items-center gap-1 sm:gap-6 border-b border-border/70 overflow-x-auto text-xs sm:text-sm font-semibold tracking-tight scrollbar-none px-1">
        {[
          { id: 'all', label: 'All Orders' },
          { id: 'open', label: 'Open' },
          { id: 'unfulfilled', label: 'In production' },
          { id: 'unpaid', label: 'Awaiting payment' },
          { id: 'paid', label: 'Paid Orders' },
          { id: 'customers', label: 'Customers' },
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'customers') {
                  if (onSelectTab) onSelectTab('customers');
                  else setActiveTab('customers');
                } else {
                  setActiveTab(tab.id as typeof activeTab);
                }
              }}
              className={`pb-3 px-2 sm:px-3 relative whitespace-nowrap transition-colors flex items-center gap-1.5 font-display ${
                isActive 
                  ? 'text-oxblood font-bold' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. ORDERS TABLE CARD */}
      <div className="bg-card border border-border/80 rounded-2xl shadow-2xs overflow-hidden">
        {/* Table Controls Header */}
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border/60 bg-card">
          {/* Search Here Input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setWelcomeSearch('');
              }}
              placeholder="Filter current view..."
              className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:border-oxblood focus:ring-1 focus:ring-oxblood transition"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Filters Button with Popover */}
            <div className="relative">
              <button 
                onClick={() => setIsFilterOpen(prev => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                  isFilterOpen || filterStatus !== 'all' || filterDateRange !== 'all'
                    ? 'border-oxblood text-oxblood bg-oxblood/10'
                    : 'border-border text-foreground hover:bg-muted'
                }`}
              >
                <FilterIcon className="w-3.5 h-3.5 text-brass" />
                <span>Filters</span>
              </button>

              {/* Filters Popover Dropdown */}
              {isFilterOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl p-4 shadow-xl z-30 space-y-3 animate-scale-in">
                  <div className="flex items-center justify-between pb-2 border-b border-border text-xs font-bold text-foreground">
                    <span>Filter Orders</span>
                    <button onClick={() => setIsFilterOpen(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">Status</label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    >
                      <option value="all">All statuses</option>
                      {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map(st => (
                        <option key={st} value={st}>{ORDER_STATUS_LABELS[st]}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">Date Placed</label>
                    <select
                      value={filterDateRange}
                      onChange={(e) => setFilterDateRange(e.target.value as typeof filterDateRange)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    >
                      <option value="all">All Time</option>
                      <option value="today">Past 24 Hours</option>
                      <option value="last7">Past 7 Days</option>
                      <option value="last30">Past 30 Days</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => {
                        setFilterStatus('all');
                        setFilterDateRange('all');
                        setMinTotal('');
                      }}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Reset all
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsFilterOpen(false)}
                      className="bg-oxblood hover:bg-oxblood-deep text-ivory px-3 py-1 rounded-lg text-xs font-semibold transition shadow-2xs"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Download CSV Button */}
            <button 
              onClick={() => handleExportCSV()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition"
              title="Download Orders CSV"
            >
              <Download className="w-3.5 h-3.5 text-brass" />
              <span>Download</span>
            </button>

            {/* Pagination Controls (< Page 1 of 2 >) */}
            <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1 text-xs bg-background">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] text-muted-foreground px-1">
                Page <span className="font-semibold text-foreground font-mono">{currentPage}</span> of <span className="font-mono">{totalPages}</span>
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Floating Bulk Actions Dock (Vernox Obsidian & Brass) */}
        {selectedOrderIds.size > 0 && (
          <div className="bg-toolbar border-b border-brass/40 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 animate-fade-in text-xs text-toolbar-foreground">
            <div className="flex items-center gap-2 font-semibold">
              <CheckSquare className="w-4 h-4 text-brass" />
              <span>{selectedOrderIds.size} orders selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExportCSV(orders.filter(o => selectedOrderIds.has(o.id)))}
                className="bg-toolbar-foreground/10 border border-toolbar-foreground/20 text-toolbar-foreground px-3 py-1 rounded-md text-xs font-semibold transition"
              >
                Export Selected
              </button>
              <button
                onClick={() => setSelectedOrderIds(new Set())}
                className="text-toolbar-foreground/70 hover:text-toolbar-foreground text-xs underline ml-1"
              >
                Deselect
              </button>
            </div>
          </div>
        )}

        {/* DATA TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/70 text-[11px] font-display font-bold text-muted-foreground uppercase tracking-wider bg-muted/40">
                <th className="py-3 px-4 w-10">
                  <button 
                    onClick={toggleSelectAllPage} 
                    className="text-muted-foreground hover:text-foreground transition flex items-center"
                    title={isAllCurrentPageSelected ? "Deselect all" : "Select all on page"}
                  >
                    {isAllCurrentPageSelected ? (
                      <CheckSquare className="w-4 h-4 text-oxblood" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4">Order</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Package className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="font-medium text-foreground">No orders matching your filters</p>
                    <p className="text-[11px] mt-0.5">Try adjusting your search query or reset filter settings.</p>
                  </td>
                </tr>
              ) : (
                paginatedOrders.map(order => {
                  const isSelected = selectedOrderIds.has(order.id);
                  return (
                    <tr 
                      key={order.id} 
                      className={`hover:bg-muted/40 transition group cursor-pointer ${
                        isSelected ? 'bg-oxblood/[0.04]' : ''
                      }`}
                      onClick={() => setInspectingOrder(order)}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={() => toggleSelectOrder(order.id)}
                          className="text-muted-foreground hover:text-foreground flex items-center"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-oxblood" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* ORDER */}
                      <td className="py-3.5 px-4 font-mono font-semibold text-oxblood hover:text-oxblood-deep hover:underline">
                        {order.orderNumber || order.id}
                      </td>

                      {/* DATE (04/05/2026 10:08AM) */}
                      <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                        {formatOrderDate(order.placedAt)}
                      </td>

                      {/* CUSTOMER */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-foreground truncate max-w-[180px]">
                          {order.customerName || order.email.split('@')[0]}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                          {order.email}
                        </div>
                      </td>

                      {/* STATUS */}
                      <td className="py-3.5 px-4">
                        {renderStatusTag(order.status)}
                      </td>

                      {/* TOTAL */}
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-foreground whitespace-nowrap">
                        {currency}{order.total.toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. ORDER INSPECTOR FLYOUT MODAL */}
      {inspectingOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-end animate-fade-in">
          <div className="w-full max-w-2xl h-full bg-card border-l border-border shadow-2xl flex flex-col animate-slide-in-right overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-display font-bold text-foreground">
                    Order {inspectingOrder.orderNumber || inspectingOrder.id}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    · {formatOrderDate(inspectingOrder.placedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {renderStatusTag(inspectingOrder.status)}
                </div>
              </div>

              <button 
                onClick={() => setInspectingOrder(null)}
                className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              
              {/* Status update: only transitions the state machine allows for this role */}
              <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
                <span className="text-[11px] font-bold text-foreground uppercase tracking-wider block">
                  Order status
                </span>
                {(() => {
                  const next = permissions ? nextClientStatuses(inspectingOrder.status, permissions) : [];
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase font-semibold block mb-1">
                          Move to
                        </label>
                        <select
                          value=""
                          disabled={!canEdit || next.length === 0}
                          onChange={async (e) => {
                            const val = e.target.value as OrderStatus;
                            if (!val) return;
                            if (await persist(inspectingOrder, { status: val })) {
                              toast.success(`Status updated to ${ORDER_STATUS_LABELS[val]}`);
                            }
                          }}
                          className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                        >
                          <option value="">{next.length === 0 ? 'No further steps available' : `Current: ${ORDER_STATUS_LABELS[inspectingOrder.status]}`}</option>
                          {next.map(st => <option key={st} value={st}>{ORDER_STATUS_LABELS[st]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase font-semibold block mb-1">
                          Assigned to
                        </label>
                        <input
                          type="text"
                          value={assignedTo}
                          disabled={!canEdit}
                          onChange={(e) => setAssignedTo(e.target.value)}
                          placeholder="Operator email or name"
                          className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-oxblood"
                        />
                      </div>
                    </div>
                  );
                })()}
                {inspectingOrder.statusHistory.length > 0 && (
                  <ol className="text-[11px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
                    {inspectingOrder.statusHistory.slice(-6).reverse().map((h, i) => (
                      <li key={`${h.status}-${h.at}-${i}`}>
                        {ORDER_STATUS_LABELS[h.status]} · {formatOrderDate(h.at)} · {h.by}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Customer & Shipping Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-foreground font-semibold">
                    <Mail className="w-3.5 h-3.5 text-brass" />
                    <span className="font-display">Patron Dossier</span>
                  </div>
                  <div className="text-muted-foreground space-y-1">
                    <div className="font-medium text-foreground">{inspectingOrder.customerName || 'Customer'}</div>
                    <div className="font-mono text-[11px]">{inspectingOrder.email}</div>
                    {inspectingOrder.phone && <div className="font-mono text-[11px]">{inspectingOrder.phone}</div>}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-foreground font-semibold">
                    <MapPin className="w-3.5 h-3.5 text-brass" />
                    <span className="font-display">Destination</span>
                  </div>
                  <div className="text-muted-foreground space-y-0.5">
                    <div>{inspectingOrder.shippingAddress || 'No address recorded'}</div>
                    <div>
                      {[inspectingOrder.shippingCity, inspectingOrder.shippingState, inspectingOrder.shippingPincode, inspectingOrder.shippingCountry]
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Items & CAM Production Downloads */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold text-foreground uppercase tracking-wider block font-display">
                  Commission Works ({inspectingOrder.items?.length || 0})
                </span>
                
                <div className="space-y-2.5">
                  {inspectingOrder.items?.map((item, idx) => (
                    <div key={idx} className="bg-card border border-border rounded-xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-foreground text-sm font-display">
                            {item.productName}
                          </div>
                          <div className="text-muted-foreground text-[11px] mt-0.5">
                            Substrate / Finish: <span className="text-oxblood font-semibold capitalize">{item.finish?.replace(/_/g, ' ')}</span> · 
                            Dimensions: <span className="text-foreground font-mono">{item.sizeLabel || `${item.widthMm}x${item.heightMm}mm`}</span> · 
                            Qty: <span className="text-foreground font-mono font-bold">{item.quantity}</span>
                          </div>
                        </div>
                        <div className="font-mono font-bold text-foreground text-sm">
                          {currency}{(item.unitPrice * item.quantity).toFixed(2)}
                        </div>
                      </div>

                      {/* Custom Artwork Preview if uploaded */}
                      {item.userUploadedImage && (
                        <div className="flex items-center gap-3 pt-2 border-t border-border/50">
                          <img 
                            src={item.userUploadedImage} 
                            alt="Artwork" 
                            className="w-12 h-12 object-contain bg-zinc-900 rounded border border-border cursor-pointer hover:opacity-80 transition"
                            onClick={() => setLightboxImage({ url: item.userUploadedImage!, title: item.uploadedArtworkName || 'Custom Artwork' })}
                          />
                          <div>
                            <div className="font-medium text-foreground text-[11px]">Client Uploaded Architectural Vector</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{item.uploadedArtworkName || 'Vector CAD/SVG'}</div>
                          </div>
                        </div>
                      )}

                      {/* 1-Click CAM Production Downloads */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground mr-1">
                          CAM Export:
                        </span>
                        <button
                          onClick={() => handleDownloadCAM(inspectingOrder, item, 'svg')}
                          className="flex items-center gap-1 bg-muted hover:bg-muted/80 text-foreground px-2.5 py-1 rounded text-[11px] font-medium transition"
                        >
                          <FileCode className="w-3 h-3 text-oxblood" />
                          <span>SVG</span>
                        </button>
                        <button
                          onClick={() => handleDownloadCAM(inspectingOrder, item, 'dxf')}
                          className="flex items-center gap-1 bg-oxblood/10 hover:bg-oxblood/20 text-oxblood border border-oxblood/20 px-2.5 py-1 rounded text-[11px] font-medium transition"
                        >
                          <Scissors className="w-3 h-3 text-brass" />
                          <span>Laser DXF</span>
                        </button>
                        <button
                          onClick={() => handleDownloadCAM(inspectingOrder, item, 'pdf')}
                          className="flex items-center gap-1 bg-muted hover:bg-muted/80 text-foreground px-2.5 py-1 rounded text-[11px] font-medium transition"
                        >
                          <FileText className="w-3 h-3 text-brass" />
                          <span>PDF Spec</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shipping Tracking & Carrier */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <span className="text-[11px] font-bold text-foreground uppercase tracking-wider block font-display">
                  Atelier Logistics & Global Tracking
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase font-semibold block mb-1">
                      Carrier
                    </label>
                    <input 
                      type="text"
                      value={trackingCarrier}
                      onChange={(e) => setTrackingCarrier(e.target.value)}
                      placeholder="e.g. Delhivery, Blue Dart, DTDC"
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-oxblood focus:ring-1 focus:ring-oxblood"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase font-semibold block mb-1">
                      Tracking Number
                    </label>
                    <input 
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="e.g. VX-DHL-89241"
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-oxblood focus:ring-1 focus:ring-oxblood font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground uppercase font-semibold block mb-1">
                    Atelier Internal Notes
                  </label>
                  <textarea 
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={2}
                    placeholder="Laser calibration notes, patina stage, client liaison..."
                    className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-oxblood focus:ring-1 focus:ring-oxblood resize-none"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    disabled={!canEdit}
                    onClick={async () => {
                      const saved = await persist(inspectingOrder, {
                        tracking: { carrier: trackingCarrier, trackingNumber, estimatedDelivery },
                        assignedTo,
                        notes: withFreeText(inspectingOrder.adminNotes, adminNotes),
                      });
                      if (saved) toast.success('Logistics and notes saved');
                    }}
                    className="bg-oxblood hover:bg-oxblood-deep text-ivory px-4 py-1.5 rounded-lg text-xs font-semibold transition shadow-soft border border-oxblood/40"
                  >
                    Save Logistics Info
                  </button>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border flex items-center justify-between bg-muted/20 shrink-0">
              <div className="font-mono text-sm font-bold text-foreground">
                Total: {currency}{inspectingOrder.total.toFixed(2)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    handleExportCSV([inspectingOrder]);
                  }}
                  className="bg-background border border-border text-foreground hover:bg-muted px-3 py-1.5 rounded-lg text-xs font-medium transition"
                >
                  Export Order CSV
                </button>
                <button
                  onClick={() => setInspectingOrder(null)}
                  className="bg-foreground text-background px-4 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Uploaded Artwork */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <div className="max-w-3xl max-h-[90vh] bg-card rounded-2xl p-4 relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
              <h3 className="font-semibold text-sm text-foreground">{lightboxImage.title}</h3>
              <button onClick={() => setLightboxImage(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <img 
              src={lightboxImage.url} 
              alt={lightboxImage.title} 
              className="max-h-[70vh] object-contain mx-auto rounded-lg"
            />
          </div>
        </div>
      )}

    </div>
  );
}
