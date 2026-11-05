/**
 * Enterprise Admin Reviews & Testimonials Management View
 * Features: Full CRUD moderation (add, edit, delete), 1-click badge toggles
 * (Verified Purchaser, Spotlight Featured), official Atelier Concierge replies,
 * rating analytics, product filtering, and search.
 */

import { useState, useMemo } from 'react';
import { useCatalog } from '@/lib/catalogContext';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAllReviews, useReviewMutations } from '@/lib/data/reviews';
import type { Review } from '@/types/store';
import { 
  Star, Search, Trash2, Edit2, ShieldCheck, 
  MessageSquare, Plus, Eye, AlertTriangle, X,
  CheckCircle2, Sparkles, Filter, CornerDownRight, 
  Building2, MapPin, Award, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { AtelierSelect } from '@/components/ui/select';

export function AdminReviews() {
  const { products } = useCatalog();
  const { permissions } = useAuth();
  const { data: reviews = [], isLoading, error: loadError } = useAllReviews(Boolean(permissions?.canModerateReviews));
  const { saveReview, deleteReview: removeReview } = useReviewMutations();

  const patchReview = async (id: string, updates: Partial<Review>): Promise<boolean> => {
    const existing = reviews.find(r => r.id === id);
    return existing ? saveReview({ ...existing, ...updates }) : false;
  };
  const addReview = (review: Omit<Review, 'id'>) =>
    saveReview({ ...review, id: `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, status: 'published' });
  const updateReview = patchReview;
  const deleteReview = (id: string) => removeReview(id);
  const toggleReviewFeatured = (id: string) => patchReview(id, { featured: !reviews.find(r => r.id === id)?.featured });
  const toggleReviewVerified = (id: string) => patchReview(id, { verified: !reviews.find(r => r.id === id)?.verified });
  const replyToReview = (id: string, response: string) =>
    patchReview(id, { conciergeResponse: response.trim() || undefined, conciergeRespondedAt: response.trim() ? Date.now() : undefined });

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | '5' | '4' | '3' | '1-2'>('all');
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'verified' | 'featured' | 'unreplied'>('all');
  const [productFilter, setProductFilter] = useState<string>('all');

  // Modal States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [replyingReview, setReplyingReview] = useState<Review | null>(null);
  const [deletingReview, setDeletingReview] = useState<Review | null>(null);

  // Forms
  const [addForm, setAddForm] = useState({
    productId: products[0]?.id || '',
    customerName: '',
    customerRole: '',
    location: '',
    rating: 5,
    comment: '',
    verified: true,
    featured: false,
  });

  const [editForm, setEditForm] = useState({
    productId: '',
    customerName: '',
    customerRole: '',
    location: '',
    rating: 5,
    comment: '',
    verified: true,
    featured: false,
  });

  const [replyText, setReplyText] = useState('');

  // Analytics
  const stats = useMemo(() => {
    const total = reviews.length;
    if (total === 0) return { total: 0, avgRating: '0.0', verifiedCount: 0, featuredCount: 0, repliedCount: 0 };
    const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    const avgRating = (sum / total).toFixed(1);
    const verifiedCount = reviews.filter(r => r.verified).length;
    const featuredCount = reviews.filter(r => r.featured).length;
    const repliedCount = reviews.filter(r => Boolean(r.conciergeResponse)).length;
    return { total, avgRating, verifiedCount, featuredCount, repliedCount };
  }, [reviews]);

  // Filtered List
  const filteredReviews = useMemo(() => {
    return reviews.filter(r => {
      // 1. Search Query
      const q = searchQuery.toLowerCase().trim();
      const productName = products.find(p => p.id === r.productId)?.name || '';
      const matchesSearch = !q || (
        r.customerName?.toLowerCase().includes(q) ||
        r.comment?.toLowerCase().includes(q) ||
        r.location?.toLowerCase().includes(q) ||
        r.customerRole?.toLowerCase().includes(q) ||
        productName.toLowerCase().includes(q)
      );

      // 2. Rating Filter
      let matchesRating = true;
      if (ratingFilter === '5') matchesRating = r.rating === 5;
      else if (ratingFilter === '4') matchesRating = r.rating === 4;
      else if (ratingFilter === '3') matchesRating = r.rating === 3;
      else if (ratingFilter === '1-2') matchesRating = r.rating <= 2;

      // 3. Badge Filter
      let matchesBadge = true;
      if (badgeFilter === 'verified') matchesBadge = Boolean(r.verified);
      else if (badgeFilter === 'featured') matchesBadge = Boolean(r.featured);
      else if (badgeFilter === 'unreplied') matchesBadge = !r.conciergeResponse;

      // 4. Product Filter
      let matchesProduct = true;
      if (productFilter !== 'all') matchesProduct = r.productId === productFilter;

      return matchesSearch && matchesRating && matchesBadge && matchesProduct;
    });
  }, [reviews, searchQuery, ratingFilter, badgeFilter, productFilter, products]);

  // Handlers
  const handleOpenAdd = () => {
    setAddForm({
      productId: products[0]?.id || '',
      customerName: '',
      customerRole: '',
      location: '',
      rating: 5,
      comment: '',
      verified: true,
      featured: false,
    });
    setIsAddOpen(true);
  };

  const handleCreateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.customerName.trim() || !addForm.comment.trim()) {
      toast.error('Customer name and review content are required');
      return;
    }

    const saved = await addReview({
      productId: addForm.productId,
      customerName: addForm.customerName.trim(),
      customerRole: addForm.customerRole.trim() || undefined,
      location: addForm.location.trim() || undefined,
      rating: Number(addForm.rating),
      comment: addForm.comment.trim(),
      verified: addForm.verified,
      featured: addForm.featured,
      placedAt: Date.now(),
    });
    if (!saved) return;

    toast.success('Review added');
    setIsAddOpen(false);
  };

  const handleOpenEdit = (r: Review) => {
    setEditingReview(r);
    setEditForm({
      productId: r.productId,
      customerName: r.customerName || '',
      customerRole: r.customerRole || '',
      location: r.location || '',
      rating: r.rating || 5,
      comment: r.comment || '',
      verified: Boolean(r.verified),
      featured: Boolean(r.featured),
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReview) return;
    if (!editForm.customerName.trim() || !editForm.comment.trim()) {
      toast.error('Customer name and review content are required');
      return;
    }

    const saved = await updateReview(editingReview.id, {
      productId: editForm.productId,
      customerName: editForm.customerName.trim(),
      customerRole: editForm.customerRole.trim() || undefined,
      location: editForm.location.trim() || undefined,
      rating: Number(editForm.rating),
      comment: editForm.comment.trim(),
      verified: editForm.verified,
      featured: editForm.featured,
    });
    if (!saved) return;

    toast.success('Review updated successfully');
    setEditingReview(null);
  };

  const handleOpenReply = (r: Review) => {
    setReplyingReview(r);
    setReplyText(r.conciergeResponse || '');
  };

  const handleSaveReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyingReview) return;

    if (!(await replyToReview(replyingReview.id, replyText))) return;
    toast.success('Atelier Concierge response saved');
    setReplyingReview(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingReview) return;
    if (!(await deleteReview(deletingReview.id))) return;
    toast.success('Review removed');
    setDeletingReview(null);
  };

  const handleToggleFeatured = async (r: Review) => {
    if (!(await toggleReviewFeatured(r.id))) return;
    toast.success(r.featured ? `Removed from Spotlight` : `Added ${r.customerName} to Spotlight`);
  };

  const handleToggleVerified = async (r: Review) => {
    if (!(await toggleReviewVerified(r.id))) return;
    toast.success(r.verified ? `Verification removed` : `Verified purchaser status granted`);
  };

  const getProduct = (pId: string) => {
    return products.find(p => p.id === pId);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {loadError && (
        <div role="alert" className="border border-destructive/30 bg-destructive/5 text-destructive text-xs rounded p-3">
          Reviews could not be loaded: {loadError.message}
        </div>
      )}
      {isLoading && <p className="text-xs text-muted-foreground">Loading reviews…</p>}

      {/* 1. Header with Stats & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-3xl text-oxblood-deep">Collector & Patron Reviews</h2>
            <span className="text-xs font-mono bg-oxblood/10 text-oxblood border border-oxblood/20 px-2 py-0.5 rounded-full font-bold">
              {reviews.length} Total
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Moderate, edit, and feature architectural collector feedback and post official Atelier Concierge responses.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 bg-oxblood text-ivory hover:bg-oxblood-deep px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-soft shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Testimonial</span>
        </button>
      </div>

      {/* 2. Key Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft">
          <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-semibold tracking-wider">
            <span>Average Rating</span>
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-display text-foreground">{stats.avgRating}</span>
            <span className="text-xs text-muted-foreground">/ 5.0</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Based on {stats.total} {stats.total === 1 ? 'review' : 'reviews'}
          </div>
        </div>

        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft">
          <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-semibold tracking-wider">
            <span>Verified Purchasers</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-display text-foreground">{stats.verifiedCount}</span>
            <span className="text-xs text-emerald-600 font-medium">
              {stats.total > 0 ? `${Math.round((stats.verifiedCount / stats.total) * 100)}%` : '0%'}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Authentic provenance orders
          </div>
        </div>

        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft">
          <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-semibold tracking-wider">
            <span>Spotlight Featured</span>
            <Sparkles className="w-4 h-4 text-oxblood" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-display text-foreground">{stats.featuredCount}</span>
            <span className="text-xs text-oxblood font-medium">Highlighted</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Featured on editorial spaces
          </div>
        </div>

        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft">
          <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-semibold tracking-wider">
            <span>Atelier Replied</span>
            <CornerDownRight className="w-4 h-4 text-gold" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-display text-foreground">{stats.repliedCount}</span>
            <span className="text-xs text-muted-foreground">
              {stats.total - stats.repliedCount} pending
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Official concierge engagements
          </div>
        </div>
      </div>

      {/* 3. Filter & Search Controls */}
      <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          
          {/* Text Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by patron, comment, city, or product..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-oxblood transition"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Quick Select Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Rating Filter */}
            <div className="w-36">
              <AtelierSelect
                value={ratingFilter}
                onValueChange={val => setRatingFilter(val as typeof ratingFilter)}
                options={[
                  { value: 'all', label: 'All Ratings' },
                  { value: '5', label: '★ 5 Stars Only' },
                  { value: '4', label: '★ 4 Stars Only' },
                  { value: '3', label: '★ 3 Stars Only' },
                  { value: '1-2', label: '★ 1–2 Stars' },
                ]}
              />
            </div>

            {/* Badge Filter */}
            <div className="w-44">
              <AtelierSelect
                value={badgeFilter}
                onValueChange={val => setBadgeFilter(val as typeof badgeFilter)}
                options={[
                  { value: 'all', label: 'All Badges' },
                  { value: 'verified', label: 'Verified Purchasers' },
                  { value: 'featured', label: 'Spotlight Featured' },
                  { value: 'unreplied', label: 'Pending Concierge Reply' },
                ]}
              />
            </div>

            {/* Product Filter */}
            <div className="w-48">
              <AtelierSelect
                value={productFilter}
                onValueChange={val => setProductFilter(val)}
                options={[
                  { value: 'all', label: 'All Artworks' },
                  ...products.map(p => ({
                    value: p.id,
                    label: p.name,
                  })),
                ]}
              />
            </div>
          </div>

        </div>

        {/* Active Filter Notice */}
        {(searchQuery || ratingFilter !== 'all' || badgeFilter !== 'all' || productFilter !== 'all') && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
            <span>Showing {filteredReviews.length} of {reviews.length} reviews.</span>
            <button
              onClick={() => {
                setSearchQuery('');
                setRatingFilter('all');
                setBadgeFilter('all');
                setProductFilter('all');
              }}
              className="text-oxblood font-semibold hover:underline cursor-pointer"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* 4. Reviews Management Table */}
      <div className="bg-card border border-border/70 rounded-xl overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="p-4 w-52">Patron & Provenance</th>
                <th className="p-4 w-44">Artwork Target</th>
                <th className="p-4 w-32">Rating</th>
                <th className="p-4 min-w-[280px]">Testimonial & Concierge Reply</th>
                <th className="p-4 w-44">Badges (1-Click Toggle)</th>
                <th className="p-4 w-28">Date</th>
                <th className="p-4 text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredReviews.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="font-medium text-foreground text-base">No customer reviews match criteria</p>
                    <p className="text-xs text-muted-foreground mt-1">Try resetting filters or adding a new collector testimonial.</p>
                  </td>
                </tr>
              ) : (
                filteredReviews.map(r => {
                  const prod = getProduct(r.productId);
                  return (
                    <tr key={r.id} className="hover:bg-muted/20 transition group">
                      
                      {/* Patron & Location */}
                      <td className="p-4 align-top">
                        <div className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                          {r.customerName}
                        </div>
                        {r.customerRole && (
                          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Building2 className="w-3 h-3 opacity-60" />
                            {r.customerRole}
                          </div>
                        )}
                        {r.location && (
                          <div className="text-[11px] text-muted-foreground/80 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-oxblood/60" />
                            {r.location}
                          </div>
                        )}
                      </td>

                      {/* Artwork Target */}
                      <td className="p-4 align-top">
                        <div className="flex items-center gap-2">
                          {prod?.imageUrl && (
                            <img 
                              src={prod.imageUrl} 
                              alt="" 
                              className="w-8 h-8 rounded object-cover border border-border shrink-0" 
                            />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-foreground truncate" title={prod?.name || r.productId}>
                              {prod?.name || r.productId}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground">
                              {r.productId}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Star Rating */}
                      <td className="p-4 align-top">
                        <div className="flex items-center text-amber-500 gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star 
                              key={i} 
                              className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-current' : 'text-muted-foreground/30'}`} 
                            />
                          ))}
                          <span className="text-xs font-mono font-bold text-foreground ml-1.5">
                            {r.rating}.0
                          </span>
                        </div>
                      </td>

                      {/* Comment Content + Concierge Reply */}
                      <td className="p-4 align-top">
                        <div className="text-xs text-foreground/90 leading-relaxed font-sans">
                          "{r.comment}"
                        </div>

                        {/* Official Concierge Reply Display */}
                        {r.conciergeResponse ? (
                          <div className="mt-2.5 p-2.5 rounded-lg bg-oxblood/5 border border-oxblood/15 text-xs text-oxblood-deep space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-oxblood">
                              <span className="flex items-center gap-1">
                                <CornerDownRight className="w-3 h-3 text-oxblood" />
                                Vernox Concierge Response
                              </span>
                              {r.conciergeRespondedAt && (
                                <span className="opacity-60 font-normal">
                                  {new Date(r.conciergeRespondedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] leading-relaxed italic text-foreground/85">
                              "{r.conciergeResponse}"
                            </p>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenReply(r)}
                            className="mt-2 inline-flex items-center gap-1 text-[11px] text-oxblood/80 hover:text-oxblood font-semibold underline underline-offset-2 cursor-pointer transition"
                          >
                            <CornerDownRight className="w-3 h-3" />
                            Respond as Atelier Concierge
                          </button>
                        )}
                      </td>

                      {/* Badges with 1-Click Toggle */}
                      <td className="p-4 align-top">
                        <div className="flex flex-col gap-1.5 items-start">
                          
                          {/* Verified Purchaser Toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleVerified(r)}
                            title="Click to toggle verified purchaser badge"
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer border ${
                              r.verified
                                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20'
                                : 'bg-muted text-muted-foreground border-border hover:bg-muted/80 opacity-60'
                            }`}
                          >
                            <ShieldCheck className="w-3 h-3" />
                            <span>{r.verified ? 'Verified Purchaser' : 'Unverified'}</span>
                          </button>

                          {/* Spotlight Toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleFeatured(r)}
                            title="Click to toggle homepage spotlight"
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer border ${
                              r.featured
                                ? 'bg-oxblood/10 text-oxblood border-oxblood/30 hover:bg-oxblood/20'
                                : 'bg-muted text-muted-foreground border-border hover:bg-muted/80 opacity-60'
                            }`}
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>{r.featured ? 'Spotlight Active' : 'Off Spotlight'}</span>
                          </button>

                        </div>
                      </td>

                      {/* Date */}
                      <td className="p-4 align-top text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {new Date(r.placedAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="p-4 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          
                          {/* Reply / Edit Reply */}
                          <button
                            onClick={() => handleOpenReply(r)}
                            className="p-1.5 text-muted-foreground hover:text-oxblood hover:bg-oxblood/10 rounded-md transition cursor-pointer"
                            title="Atelier Reply"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>

                          {/* Edit Details */}
                          <button
                            onClick={() => handleOpenEdit(r)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition cursor-pointer"
                            title="Edit Review"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setDeletingReview(r)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition cursor-pointer"
                            title="Delete Review"
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

      {/* MODAL 1: ADD TESTIMONIAL */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 shadow-luxe space-y-4 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-display text-lg text-oxblood-deep">Add Collector Testimonial</h3>
              <button 
                onClick={() => setIsAddOpen(false)} 
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateReview} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Artwork Assignment *</label>
                <AtelierSelect
                  value={addForm.productId}
                  onValueChange={val => setAddForm({ ...addForm, productId: val })}
                  options={products.map(p => ({
                    value: p.id,
                    label: `${p.name} (${p.id})`,
                  }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patron Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Claire & Marc D."
                    value={addForm.customerName}
                    onChange={e => setAddForm({ ...addForm, customerName: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role / Firm</label>
                  <input
                    type="text"
                    placeholder="e.g. Private Residence Commission"
                    value={addForm.customerRole}
                    onChange={e => setAddForm({ ...addForm, customerRole: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">City & Country</label>
                  <input
                    type="text"
                    placeholder="e.g. Paris XVIe, France"
                    value={addForm.location}
                    onChange={e => setAddForm({ ...addForm, location: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rating</label>
                  <AtelierSelect
                    value={String(addForm.rating)}
                    onValueChange={val => setAddForm({ ...addForm, rating: Number(val) })}
                    options={[
                      { value: '5', label: '5 Stars - Flawless' },
                      { value: '4', label: '4 Stars - Exquisite' },
                      { value: '3', label: '3 Stars - Satisfactory' },
                    ]}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review Content *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Collector feedback regarding the finish, tolerances, standoffs, and spatial presence..."
                  value={addForm.comment}
                  onChange={e => setAddForm({ ...addForm, comment: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                />
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addForm.verified}
                    onChange={e => setAddForm({ ...addForm, verified: e.target.checked })}
                    className="rounded border-border accent-oxblood"
                  />
                  <span>Verified Purchaser</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addForm.featured}
                    onChange={e => setAddForm({ ...addForm, featured: e.target.checked })}
                    className="rounded border-border accent-oxblood"
                  />
                  <span>Spotlight Featured</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-ivory bg-oxblood hover:bg-oxblood-deep rounded-lg transition shadow-soft cursor-pointer"
                >
                  Save Testimonial
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT REVIEW */}
      {editingReview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 shadow-luxe space-y-4 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-display text-lg text-oxblood-deep">Edit Review</h3>
              <button 
                onClick={() => setEditingReview(null)} 
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Artwork Assignment</label>
                <AtelierSelect
                  value={editForm.productId}
                  onValueChange={val => setEditForm({ ...editForm, productId: val })}
                  options={products.map(p => ({
                    value: p.id,
                    label: `${p.name} (${p.id})`,
                  }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patron Name *</label>
                  <input
                    type="text"
                    required
                    value={editForm.customerName}
                    onChange={e => setEditForm({ ...editForm, customerName: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role / Designation</label>
                  <input
                    type="text"
                    value={editForm.customerRole}
                    onChange={e => setEditForm({ ...editForm, customerRole: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">City & Country</label>
                  <input
                    type="text"
                    value={editForm.location}
                    onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rating</label>
                  <AtelierSelect
                    value={String(editForm.rating)}
                    onValueChange={val => setEditForm({ ...editForm, rating: Number(val) })}
                    options={[
                      { value: '5', label: '5 Stars - Flawless' },
                      { value: '4', label: '4 Stars - Exquisite' },
                      { value: '3', label: '3 Stars - Satisfactory' },
                      { value: '2', label: '2 Stars - Needs Improvement' },
                      { value: '1', label: '1 Star - Critical' },
                    ]}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review Content *</label>
                <textarea
                  required
                  rows={4}
                  value={editForm.comment}
                  onChange={e => setEditForm({ ...editForm, comment: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm outline-none focus:border-oxblood transition"
                />
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.verified}
                    onChange={e => setEditForm({ ...editForm, verified: e.target.checked })}
                    className="rounded border-border accent-oxblood"
                  />
                  <span>Verified Purchaser</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.featured}
                    onChange={e => setEditForm({ ...editForm, featured: e.target.checked })}
                    className="rounded border-border accent-oxblood"
                  />
                  <span>Spotlight Featured</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingReview(null)}
                  className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-ivory bg-oxblood hover:bg-oxblood-deep rounded-lg transition shadow-soft cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CONCIERGE RESPONSE */}
      {replyingReview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 shadow-luxe space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-display text-lg text-oxblood-deep">Atelier Concierge Response</h3>
                <p className="text-xs text-muted-foreground">Replying to {replyingReview.customerName}</p>
              </div>
              <button 
                onClick={() => setReplyingReview(null)} 
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Original Patron Comment Quote */}
            <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground italic">
              "{replyingReview.comment}"
            </div>

            <form onSubmit={handleSaveReply} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Official Atelier Response
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="e.g. Thank you Henrik. The 25mm standoffs were engineered specifically to capture dynamic morning grazing light across your limestone wall..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-oxblood transition"
                />
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-border">
                {replyingReview.conciergeResponse ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyText('');
                    }}
                    className="text-xs text-destructive hover:underline cursor-pointer"
                  >
                    Clear Response
                  </button>
                ) : <span />}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReplyingReview(null)}
                    className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-ivory bg-oxblood hover:bg-oxblood-deep rounded-lg transition shadow-soft cursor-pointer"
                  >
                    Post Concierge Reply
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE CONFIRMATION */}
      {deletingReview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-destructive/30 rounded-xl w-full max-w-md p-6 shadow-luxe space-y-4 animate-scale-in">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="w-6 h-6" />
              <div>
                <h3 className="font-display text-lg text-foreground">Remove Review</h3>
                <p className="text-xs text-muted-foreground">Irreversible administrative action</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to remove the review by <strong>{deletingReview.customerName}</strong>?
            </p>

            <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground italic line-clamp-3">
              "{deletingReview.comment}"
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingReview(null)}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-semibold text-ivory bg-destructive hover:bg-destructive/90 rounded-lg transition shadow-soft cursor-pointer"
              >
                Delete Review
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
