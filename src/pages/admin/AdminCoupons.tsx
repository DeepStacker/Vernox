/**
 * Enterprise Admin Coupons & Promotions Management View
 * Features: Complete coupon lifecycle (create, edit, disable, delete),
 * discount logic (% or fixed), usage caps, per-customer limits,
 * expiry date tracking, and redemption history audits.
 */

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAdminData } from '@/lib/data/adminData';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCouponMutations, useCouponUsages } from '@/lib/data/coupons';
import type { Coupon, DiscountType } from '@/types/coupon';
import { 
  Tag, Plus, Edit2, Trash2, Search, CheckCircle2, 
  XCircle, Clock, Users, ArrowUpRight, Copy, Check, Eye, AlertTriangle, ShieldCheck, X
} from 'lucide-react';
import { toast } from 'sonner';
import { AtelierSelect } from '@/components/ui/select';

export function AdminCoupons() {
  const { coupons, storeConfig } = useAdminData();
  const { permissions } = useAuth();
  const { data: couponUsages = [] } = useCouponUsages(Boolean(permissions?.canManageCoupons));
  const { createCoupon, saveCoupon, deleteCoupon } = useCouponMutations();
  const updateCoupon = (id: string, updates: Partial<Coupon>) => {
    const existing = coupons.find(c => c.id === id);
    return existing ? saveCoupon({ ...existing, ...updates }) : Promise.resolve(false);
  };
  const toggleCouponStatus = (id: string, isActive: boolean) => updateCoupon(id, { isActive });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [viewingUsagesCoupon, setViewingUsagesCoupon] = useState<Coupon | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);

  // Prevent background scroll and support ESC to close modals
  useEffect(() => {
    if (isModalOpen || viewingUsagesCoupon || deletingCoupon) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsModalOpen(false);
          setViewingUsagesCoupon(null);
          setDeletingCoupon(null);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isModalOpen, viewingUsagesCoupon, deletingCoupon]);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    discountType: 'percentage' as DiscountType,
    discountValue: 15,
    maxDiscountLimit: '',
    minOrderValue: '',
    maxUsageCount: '',
    maxUsagePerCustomer: '1',
    startDate: '',
    expiryDate: '',
    isActive: true,
  });

  // Copy Code Helper
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Coupon code ${code} copied to clipboard`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingCoupon(null);
    setFormData({
      code: '',
      description: '',
      discountType: 'percentage',
      discountValue: 15,
      maxDiscountLimit: '',
      minOrderValue: '100',
      maxUsageCount: '500',
      maxUsagePerCustomer: '1',
      startDate: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      isActive: true,
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (c: Coupon) => {
    setEditingCoupon(c);
    setFormData({
      code: c.code,
      description: c.description || '',
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxDiscountLimit: c.maxDiscountLimit !== undefined ? String(c.maxDiscountLimit) : '',
      minOrderValue: c.minOrderValue !== undefined ? String(c.minOrderValue) : '',
      maxUsageCount: c.maxUsageCount !== undefined ? String(c.maxUsageCount) : '',
      maxUsagePerCustomer: c.maxUsagePerCustomer !== undefined ? String(c.maxUsagePerCustomer) : '1',
      startDate: c.startDate || '',
      expiryDate: c.expiryDate || '',
      isActive: c.isActive,
    });
    setIsModalOpen(true);
  };

  // Submit Handler
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = formData.code.trim().toUpperCase();
    if (!cleanCode) {
      toast.error('Coupon code is required');
      return;
    }

    const payload = {
      code: cleanCode,
      description: formData.description.trim(),
      discountType: formData.discountType,
      discountValue: Number(formData.discountValue) || 0,
      maxDiscountLimit: formData.maxDiscountLimit ? Number(formData.maxDiscountLimit) : undefined,
      minOrderValue: formData.minOrderValue ? Number(formData.minOrderValue) : undefined,
      maxUsageCount: formData.maxUsageCount ? Number(formData.maxUsageCount) : undefined,
      maxUsagePerCustomer: formData.maxUsagePerCustomer ? Number(formData.maxUsagePerCustomer) : 1,
      startDate: formData.startDate || undefined,
      expiryDate: formData.expiryDate || undefined,
      isActive: formData.isActive,
    };

    if (editingCoupon) {
      const ok = await updateCoupon(editingCoupon.id, payload);
      if (ok) {
        toast.success(`Coupon ${cleanCode} updated successfully`);
        setIsModalOpen(false);
      } else {
        toast.error('Failed to update coupon');
      }
    } else {
      const ok = await createCoupon(payload);
      if (ok) {
        toast.success(`Coupon ${cleanCode} created and activated`);
        setIsModalOpen(false);
      } else {
        toast.error('Failed to create coupon');
      }
    }
  };

  // Delete Handler
  const handleConfirmDelete = async () => {
    if (!deletingCoupon) return;
    const ok = await deleteCoupon(deletingCoupon.id);
    if (ok) {
      toast.success(`Coupon ${deletingCoupon.code} removed`);
      setDeletingCoupon(null);
    } else {
      toast.error('Failed to delete coupon');
    }
  };

  // Derived Filtered List
  const filteredCoupons = useMemo(() => {
    const now = new Date();
    return coupons.filter(c => {
      const matchesSearch = 
        c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const isExpired = c.expiryDate ? new Date(c.expiryDate) < now : false;

      let matchesStatus = true;
      if (statusFilter === 'active') matchesStatus = c.isActive && !isExpired;
      if (statusFilter === 'inactive') matchesStatus = !c.isActive;
      if (statusFilter === 'expired') matchesStatus = isExpired;

      return matchesSearch && matchesStatus;
    });
  }, [coupons, searchQuery, statusFilter]);

  // Stats Aggregates
  const stats = useMemo(() => {
    const total = coupons.length;
    const active = coupons.filter(c => c.isActive).length;
    const totalRedemptions = coupons.reduce((sum, c) => sum + (c.usedCount || 0), 0);
    const totalDiscountAmount = couponUsages.reduce((sum, u) => sum + (u.discountAmount || 0), 0);
    return { total, active, totalRedemptions, totalDiscountAmount };
  }, [coupons, couponUsages]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner & Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl">Discounts</h2>
          <p className="text-muted-foreground text-sm">
            Control promotional pricing, usage caps, per-customer restrictions, and monitor real-time redemptions.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 bg-oxblood text-ivory hover:bg-oxblood-deep px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-soft shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Coupon</span>
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
            <span>Total Coupons</span>
            <Tag className="w-4 h-4 text-oxblood" />
          </div>
          <div className="font-display text-2xl text-foreground mt-2">{stats.total}</div>
        </div>

        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
            <span>Active Promotions</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-display text-2xl text-emerald-600 mt-2">{stats.active}</div>
        </div>

        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
            <span>Total Redemptions</span>
            <Users className="w-4 h-4 text-brass" />
          </div>
          <div className="font-display text-2xl text-foreground mt-2">{stats.totalRedemptions}</div>
        </div>

        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
            <span>Discounts Awarded</span>
            <ArrowUpRight className="w-4 h-4 text-oxblood" />
          </div>
          <div className="font-display text-2xl text-oxblood-deep mt-2">
            {storeConfig.currency}{stats.totalDiscountAmount.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search coupon code or description..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-oxblood transition"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {(['all', 'active', 'inactive', 'expired'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                statusFilter === f 
                  ? 'bg-oxblood text-ivory shadow-xs' 
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Coupons Table */}
      <div className="bg-card border border-border/70 rounded-xl overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="p-4">Coupon Code</th>
                <th className="p-4">Discount</th>
                <th className="p-4">Min Spend</th>
                <th className="p-4">Usage</th>
                <th className="p-4">Per Customer</th>
                <th className="p-4">Validity</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredCoupons.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    <Tag className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="font-medium text-foreground">No coupons found</p>
                    <p className="text-xs mt-1">Try adjusting your search criteria or create a new coupon code.</p>
                  </td>
                </tr>
              ) : (
                filteredCoupons.map(c => {
                  const isExpired = c.expiryDate ? new Date(c.expiryDate) < new Date() : false;
                  const isLimitReached = typeof c.maxUsageCount === 'number' && (c.usedCount || 0) >= c.maxUsageCount;

                  return (
                    <tr key={c.id} className="hover:bg-muted/20 transition group">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-oxblood-deep bg-oxblood/10 px-2.5 py-1 rounded border border-oxblood/20">
                            {c.code}
                          </span>
                          <button
                            onClick={() => handleCopyCode(c.code)}
                            title="Copy Code"
                            className="text-muted-foreground hover:text-foreground transition p-1"
                          >
                            {copiedCode === c.code ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        {c.description && (
                          <p className="text-xs text-muted-foreground mt-1 max-w-xs truncate">{c.description}</p>
                        )}
                      </td>

                      <td className="p-4">
                        <div className="font-semibold text-foreground">
                          {c.discountType === 'percentage' ? (
                            <span>{c.discountValue}% OFF</span>
                          ) : (
                            <span>{storeConfig.currency}{c.discountValue} OFF</span>
                          )}
                        </div>
                        {c.maxDiscountLimit && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Max {storeConfig.currency}{c.maxDiscountLimit}
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-muted-foreground font-mono">
                        {c.minOrderValue ? `${storeConfig.currency}${c.minOrderValue}` : 'None'}
                      </td>

                      <td className="p-4">
                        <div className="font-mono text-xs text-foreground">
                          {c.usedCount || 0} / {c.maxUsageCount ? c.maxUsageCount : '∞'}
                        </div>
                        {isLimitReached && (
                          <span className="text-[10px] text-amber-600 font-semibold">Limit Reached</span>
                        )}
                      </td>

                      <td className="p-4 text-muted-foreground font-mono text-xs">
                        {c.maxUsagePerCustomer || 1} per customer
                      </td>

                      <td className="p-4 text-xs">
                        {c.expiryDate ? (
                          <div className={isExpired ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                            Expires: {new Date(c.expiryDate).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No Expiry</span>
                        )}
                      </td>

                      <td className="p-4">
                        <button
                          onClick={() => toggleCouponStatus(c.id, !c.isActive)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                            c.isActive && !isExpired && !isLimitReached
                              ? 'bg-emerald-950/30 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-950/50'
                              : 'bg-muted text-muted-foreground border border-border hover:bg-muted/80'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${c.isActive ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                          {c.isActive ? (isExpired ? 'Expired' : 'Active') : 'Disabled'}
                        </button>
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewingUsagesCoupon(c)}
                            title="View Redemptions"
                            className="p-1.5 text-muted-foreground hover:text-oxblood hover:bg-oxblood/10 rounded-md transition"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(c)}
                            title="Edit Coupon"
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingCoupon(c)}
                            title="Delete Coupon"
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-5 animate-scale-in max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-oxblood" />
                <h3 className="font-display text-xl text-oxblood-deep font-bold">
                  {editingCoupon ? `Edit Coupon: ${editingCoupon.code}` : 'Create New Promotional Coupon'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Coupon Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SUMMER25"
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full font-mono bg-background border border-border rounded-lg px-3.5 py-2 text-sm uppercase outline-none focus:border-oxblood transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Discount Type
                  </label>
                  <AtelierSelect
                    value={formData.discountType}
                    onValueChange={val => setFormData({ ...formData, discountType: val as DiscountType })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                    options={[
                      { value: 'percentage', label: 'Percentage (%)' },
                      { value: 'fixed', label: `Fixed Currency (${storeConfig.currency})` },
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Discount Value *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    placeholder={formData.discountType === 'percentage' ? '15%' : '50'}
                    value={formData.discountValue}
                    onChange={e => setFormData({ ...formData, discountValue: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Max Discount Cap ({storeConfig.currency})
                  </label>
                  <input
                    type="number"
                    placeholder="Optional (e.g. 100)"
                    value={formData.maxDiscountLimit}
                    onChange={e => setFormData({ ...formData, maxDiscountLimit: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Description / Customer Message
                </label>
                <input
                  type="text"
                  placeholder="e.g. 15% Architectural Collector Courtesy on Inaugural Commits"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Min Order Spend
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={formData.minOrderValue}
                    onChange={e => setFormData({ ...formData, minOrderValue: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Max Total Uses
                  </label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={formData.maxUsageCount}
                    onChange={e => setFormData({ ...formData, maxUsageCount: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Limit / Customer
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.maxUsagePerCustomer}
                    onChange={e => setFormData({ ...formData, maxUsagePerCustomer: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={formData.expiryDate}
                    onChange={e => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={formData.isActive}
                  onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-border accent-oxblood w-4 h-4"
                />
                <label htmlFor="isActiveToggle" className="text-xs font-medium text-foreground cursor-pointer">
                  Activate coupon immediately upon saving
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-ivory bg-oxblood hover:bg-oxblood-deep rounded-lg transition shadow-soft"
                >
                  {editingCoupon ? 'Save Changes' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* VIEW USAGES MODAL */}
      {viewingUsagesCoupon && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in"
          onClick={() => setViewingUsagesCoupon(null)}
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 animate-scale-in max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-display text-xl text-oxblood-deep font-bold">
                  Redemption History: {viewingUsagesCoupon.code}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Audit trail of all customer orders that used this coupon code.
                </p>
              </div>
              <button 
                onClick={() => setViewingUsagesCoupon(null)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
                aria-label="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const matchedUsages = couponUsages.filter(u => u.couponCode === viewingUsagesCoupon.code);

              if (matchedUsages.length === 0) {
                return (
                  <div className="py-12 text-center text-muted-foreground">
                    <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="font-medium text-foreground">No recorded redemptions yet</p>
                    <p className="text-xs mt-1">When customers use this code during checkout, transactions appear here.</p>
                  </div>
                );
              }

              return (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 font-semibold uppercase text-muted-foreground border-b border-border">
                      <tr>
                        <th className="p-3">Order ID</th>
                        <th className="p-3">Customer Email</th>
                        <th className="p-3">Discount</th>
                        <th className="p-3">Order Total</th>
                        <th className="p-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {matchedUsages.map(u => (
                        <tr key={u.id} className="hover:bg-muted/20">
                          <td className="p-3 font-mono font-bold text-oxblood">{u.orderId.slice(-8)}</td>
                          <td className="p-3 text-foreground">{u.customerEmail}</td>
                          <td className="p-3 font-semibold text-emerald-600 font-mono">
                            -{storeConfig.currency}{u.discountAmount.toFixed(2)}
                          </td>
                          <td className="p-3 font-mono">{storeConfig.currency}{u.orderTotal.toFixed(2)}</td>
                          <td className="p-3 text-muted-foreground">{new Date(u.usedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <div className="flex justify-end pt-3">
              <button
                onClick={() => setViewingUsagesCoupon(null)}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingCoupon && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in"
          onClick={() => setDeletingCoupon(null)}
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-card border border-destructive/30 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-scale-in"
          >
            <div className="flex items-center gap-3 text-destructive">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-lg text-foreground font-bold">Delete Coupon</h3>
                <p className="text-xs text-muted-foreground">Irreversible administrative action</p>
              </div>
            </div>

            <p className="text-sm text-foreground/80 leading-relaxed">
              Are you sure you want to permanently delete coupon code{' '}
              <strong className="text-oxblood font-mono">{deletingCoupon.code}</strong>? Customers will no longer be able to redeem this code.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCoupon(null)}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-semibold text-ivory bg-destructive hover:bg-destructive/90 rounded-lg transition shadow-soft"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
