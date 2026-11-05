import { useState, useMemo } from 'react';
import { useAdminData } from '@/lib/data/adminData';
import { DEFAULT_HERO_SLIDES, useSettingsMutations } from '@/lib/data/settings';
import type { HeroSlide } from '@/types/store';
import { 
  Plus, Edit2, Trash2, ArrowUp, ArrowDown, ExternalLink, 
  Eye, Check, RotateCcw, Copy, Sparkles, Image as ImageIcon,
  ChevronLeft, ChevronRight, AlertCircle, Link as LinkIcon,
  Sliders, Layers
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Preset Atelier Photography available in public/images
const PRESET_BACKGROUNDS = [
  { path: '/images/hero-nocturne-living.jpg', label: 'Nocturne Salon' },
  { path: '/images/hero-art-lounge.jpg', label: 'Art Lounge Gallery' },
  { path: '/images/hero-penthouse-brass.jpg', label: 'Penthouse Brass' },
  { path: '/images/statement-piece.jpg', label: 'Statement Monolith' },
  { path: '/images/office-decor.jpg', label: 'Executive Boardroom' },
  { path: '/images/space-bedroom.jpg', label: 'Master Suite' },
  { path: '/images/maroon-collection.jpg', label: 'Maroon Geometry' },
  { path: '/images/sculpture-showpiece.jpg', label: 'Sculpture Showpiece' },
  { path: '/images/artisan-workshop.jpg', label: 'Artisan Workshop' },
];

export function AdminHeroSlider() {
  const { homepageSettings, products } = useAdminData();
  const { updateHomepageSettings } = useSettingsMutations();

  const slides: HeroSlide[] = useMemo(() => {
    return (homepageSettings?.heroSlides && homepageSettings.heroSlides.length > 0)
      ? homepageSettings.heroSlides
      : DEFAULT_HERO_SLIDES;
  }, [homepageSettings?.heroSlides]);

  // Modal & Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  const [formState, setFormState] = useState<Omit<HeroSlide, 'id'>>({
    image: '/images/hero-nocturne-living.jpg',
    series: 'THE NOCTURNE SERIES · 2026',
    location: 'Antwerp Penthouse Residence',
    featuredArtwork: 'Abstract Horizon Impasto',
    artworkLink: '/product/abstract-horizon',
  });

  const [isCustomImage, setIsCustomImage] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState('');

  // Open modal for new slide
  const handleAddNew = () => {
    setEditingSlideId(null);
    setIsCustomImage(false);
    setCustomImageUrl('');
    const defaultProduct = products[0];
    setFormState({
      image: '/images/hero-art-lounge.jpg',
      series: `NEW ATELIER CURATION · ${new Date().getFullYear()}`,
      location: 'Antwerp Modernist Residence',
      featuredArtwork: defaultProduct ? defaultProduct.name : 'Curated Atelier Work',
      artworkLink: defaultProduct ? `/product/${defaultProduct.slug}` : '/shop',
    });
    setIsModalOpen(true);
  };

  // Open modal for editing existing slide
  const handleEdit = (slide: HeroSlide) => {
    setEditingSlideId(slide.id);
    const isPreset = PRESET_BACKGROUNDS.some(p => p.path === slide.image);
    setIsCustomImage(!isPreset);
    setCustomImageUrl(!isPreset ? slide.image : '');
    setFormState({
      image: slide.image,
      series: slide.series,
      location: slide.location,
      featuredArtwork: slide.featuredArtwork,
      artworkLink: slide.artworkLink,
    });
    setIsModalOpen(true);
  };

  // Save (Create or Update)
  const handleSaveSlide = async (e: React.FormEvent) => {
    e.preventDefault();

    const finalImage = isCustomImage ? (customImageUrl.trim() || formState.image) : formState.image;

    if (!formState.series.trim() || !formState.location.trim() || !finalImage.trim()) {
      toast.error("Please fill in the required slide details.");
      return;
    }

    let updatedSlides: HeroSlide[];

    if (editingSlideId) {
      // Update
      updatedSlides = slides.map(s => 
        s.id === editingSlideId 
          ? { ...s, ...formState, image: finalImage }
          : s
      );
    } else {
      // Add
      const newSlide: HeroSlide = {
        id: `slide-${Date.now()}`,
        ...formState,
        image: finalImage,
      };
      updatedSlides = [...slides, newSlide];
    }

    if (!(await updateHomepageSettings({ heroSlides: updatedSlides }))) return;
    toast.success(editingSlideId ? 'Hero slide updated successfully.' : 'New hero slide added to carousel.');

    setIsModalOpen(false);
  };

  // Duplicate
  const handleDuplicate = async (slide: HeroSlide) => {
    const duplicated: HeroSlide = {
      ...slide,
      id: `slide-${Date.now()}`,
      series: `${slide.series} (Copy)`,
    };
    const updated = [...slides, duplicated];
    if (!(await updateHomepageSettings({ heroSlides: updated }))) return;
    toast.success("Hero slide duplicated.");
  };

  // Delete
  const handleDelete = async (slideId: string) => {
    if (slides.length <= 1) {
      toast.error("At least one slide must remain active in the hero slider.");
      return;
    }
    const updated = slides.filter(s => s.id !== slideId);
    if (!(await updateHomepageSettings({ heroSlides: updated }))) return;
    toast.success("Slide removed from hero slider.");
    if (previewIndex >= updated.length) {
      setPreviewIndex(0);
    }
  };

  // Reorder
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= slides.length) return;

    const reordered = [...slides];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIdx, 0, moved);

    if (!(await updateHomepageSettings({ heroSlides: reordered }))) return;
    toast.success("Slide sequence updated.");
  };

  // Reset to default
  const handleResetDefaults = async () => {
    if (window.confirm("Restore the original default 4 atelier slides? Any custom slides will be replaced.")) {
      if (!(await updateHomepageSettings({ heroSlides: DEFAULT_HERO_SLIDES }))) return;
      toast.success("Hero slider reset to default atelier curations.");
      setPreviewIndex(0);
    }
  };

  // Quick auto-populate when selecting a catalog product
  const handleSelectProduct = (productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (prod) {
      setFormState(prev => ({
        ...prev,
        featuredArtwork: prod.name,
        artworkLink: `/product/${prod.slug}`,
      }));
    }
  };

  const activePreviewSlide = slides[previewIndex] || slides[0] || DEFAULT_HERO_SLIDES[0];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      
      {/* Page Title & Operational Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-oxblood font-bold bg-oxblood/10 px-2 py-0.5 rounded-sm">
              Storefront Visuals
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {slides.length} {slides.length === 1 ? 'Slide' : 'Slides'} Active
            </span>
          </div>
          <h2 className="font-display text-3xl">
            Hero sliders
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Control the full-screen editorial image slides, architectural locations, series typography, and linked artworks displayed on the storefront home page.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3.5 py-2 rounded-lg border border-border hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition flex items-center gap-1.5 cursor-pointer"
            title="Restore original slides"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Defaults</span>
          </button>

          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-lg border border-border hover:bg-muted text-xs font-medium text-foreground transition flex items-center gap-1.5"
            title="Open storefront home page in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-oxblood" />
            <span>View Home</span>
          </a>

          <button
            type="button"
            onClick={handleAddNew}
            className="px-4 py-2 rounded-lg bg-oxblood hover:bg-oxblood-hover text-ivory text-xs font-semibold uppercase tracking-wider transition shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Slide</span>
          </button>
        </div>
      </div>

      {/* Live Interactive Hero Preview Banner */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-oxblood" />
            <span>Live Carousel Preview</span>
          </label>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => setPreviewIndex((prev) => (prev - 1 + slides.length) % slides.length)}
              className="p-1 hover:bg-muted rounded border border-border cursor-pointer"
              title="Previous slide preview"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono px-2 text-[11px]">
              {previewIndex + 1} / {slides.length}
            </span>
            <button
              type="button"
              onClick={() => setPreviewIndex((prev) => (prev + 1) % slides.length)}
              className="p-1 hover:bg-muted rounded border border-border cursor-pointer"
              title="Next slide preview"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="relative aspect-[21/9] sm:aspect-[2.4/1] rounded-lg overflow-hidden border border-border shadow-sm bg-neutral-900 group">
          <img
            src={activePreviewSlide.image}
            alt={activePreviewSlide.series}
            className="w-full h-full object-cover transition-all duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

          {/* Overlaid Pill Badge */}
          <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm bg-white/95 backdrop-blur-md border border-border shadow-sm text-dark-brown">
              <span className="w-2 h-2 rounded-full bg-gold" />
              <span className="text-[10px] sm:text-xs uppercase tracking-[0.22em] font-sans font-semibold">
                {activePreviewSlide.series}
              </span>
            </div>
          </div>

          {/* Overlaid Title & Location */}
          <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 text-white max-w-md">
            <span className="text-[10px] uppercase tracking-[0.24em] text-white/70 font-mono block">
              {activePreviewSlide.location}
            </span>
            <h3 className="text-base sm:text-xl font-editorial font-normal text-white mt-0.5">
              Featured: {activePreviewSlide.featuredArtwork}
            </h3>
            <span className="text-[11px] text-gold underline mt-0.5 inline-block font-mono">
              Link: {activePreviewSlide.artworkLink}
            </span>
          </div>

          {/* Indicator dots */}
          <div className="absolute top-4 right-4 flex items-center gap-1.5">
            {slides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setPreviewIndex(idx)}
                className={`transition-all rounded-full cursor-pointer ${
                  previewIndex === idx ? 'w-5 h-1.5 bg-gold' : 'w-1.5 h-1.5 bg-white/60 hover:bg-white'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Slide Sequence Cards List */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-oxblood" />
            <span>Active Slide Sequence ({slides.length})</span>
          </label>
          <span className="text-xs text-muted-foreground">
            Drag or use arrows to change sequence order
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className={cn(
                "p-4 rounded-lg border transition-all duration-200 bg-card flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs hover:border-oxblood/40",
                previewIndex === index ? "border-oxblood/60 ring-1 ring-oxblood/20" : "border-border"
              )}
            >
              {/* Left: Thumbnail & Details */}
              <div className="flex items-start sm:items-center gap-4 min-w-0">
                {/* Order Index Pill */}
                <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center font-mono font-bold text-xs text-muted-foreground shrink-0 border border-border">
                  #{index + 1}
                </div>

                {/* Thumbnail Preview */}
                <div 
                  className="w-24 h-16 sm:w-28 sm:h-18 rounded-md overflow-hidden border border-border bg-neutral-900 shrink-0 relative cursor-pointer group"
                  onClick={() => setPreviewIndex(index)}
                  title="Click to preview in stage above"
                >
                  <img
                    src={slide.image}
                    alt={slide.series}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                    <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </div>

                {/* Metadata */}
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-oxblood bg-oxblood/10 px-2 py-0.5 rounded-sm">
                      {slide.series}
                    </span>
                    <span className="text-xs text-muted-foreground font-sans">
                      · {slide.location}
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-foreground truncate">
                    {slide.featuredArtwork}
                  </h4>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono truncate">
                    <LinkIcon className="w-3 h-3 text-oxblood shrink-0" />
                    <span className="truncate">{slide.artworkLink}</span>
                  </div>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-1.5 self-end md:self-center shrink-0">
                {/* Reorder Buttons */}
                <button
                  type="button"
                  onClick={() => handleMove(index, 'up')}
                  disabled={index === 0}
                  className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer border border-border/60"
                  title="Move slide up in sequence"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleMove(index, 'down')}
                  disabled={index === slides.length - 1}
                  className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer border border-border/60"
                  title="Move slide down in sequence"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>

                {/* Duplicate Button */}
                <button
                  type="button"
                  onClick={() => handleDuplicate(slide)}
                  className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer border border-border/60"
                  title="Duplicate this slide"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>

                {/* Edit Button */}
                <button
                  type="button"
                  onClick={() => handleEdit(slide)}
                  className="p-2 rounded-md bg-muted hover:bg-oxblood hover:text-ivory text-foreground transition cursor-pointer border border-border"
                  title="Edit slide metadata & background"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                {/* Delete Button */}
                <button
                  type="button"
                  onClick={() => handleDelete(slide.id)}
                  className="p-2 rounded-md hover:bg-destructive/10 text-destructive transition cursor-pointer border border-border/60"
                  title="Delete slide"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit / Add Slide Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9990] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <h3 className="text-lg font-serif font-bold text-foreground">
                  {editingSlideId ? 'Edit Hero Slide' : 'Add New Hero Slide'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Configure visual imagery, architectural attribution, and target link.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveSlide} className="space-y-5">
              
              {/* Row 1: Series Name & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Series Headline / Tagline *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.series}
                    onChange={e => setFormState({ ...formState, series: e.target.value })}
                    placeholder="e.g. THE NOCTURNE SERIES · 2026"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Architectural Placement / Location *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.location}
                    onChange={e => setFormState({ ...formState, location: e.target.value })}
                    placeholder="e.g. Antwerp Penthouse Residence"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>
              </div>

              {/* Row 2: Featured Artwork & Link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Featured Artwork Title *
                    </label>
                    {/* Quick Product Autocomplete Trigger */}
                    {products.length > 0 && (
                      <select
                        onChange={e => handleSelectProduct(e.target.value)}
                        className="text-[11px] text-oxblood bg-transparent font-medium border-none cursor-pointer outline-none"
                        defaultValue=""
                      >
                        <option value="" disabled>Autofill from Catalog...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={formState.featuredArtwork}
                    onChange={e => setFormState({ ...formState, featuredArtwork: e.target.value })}
                    placeholder="e.g. Abstract Horizon Impasto"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-oxblood transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Artwork Target URL *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.artworkLink}
                    onChange={e => setFormState({ ...formState, artworkLink: e.target.value })}
                    placeholder="e.g. /product/abstract-horizon"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-oxblood transition font-mono"
                  />
                </div>
              </div>

              {/* Row 3: Background Image Selection */}
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-oxblood" />
                    <span>Select Background Photography *</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCustomImage(!isCustomImage)}
                    className="text-xs text-oxblood hover:underline font-medium cursor-pointer"
                  >
                    {isCustomImage ? "← Choose Atelier Presets" : "Enter Custom Image URL →"}
                  </button>
                </div>

                {isCustomImage ? (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={customImageUrl}
                      onChange={e => setCustomImageUrl(e.target.value)}
                      placeholder="https://example.com/artwork-image.jpg or /images/..."
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-oxblood transition font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Provide an absolute web URL or relative path inside the public assets folder.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-1 border border-border rounded-lg bg-muted/20">
                    {PRESET_BACKGROUNDS.map((preset) => {
                      const isSelected = formState.image === preset.path;
                      return (
                        <button
                          key={preset.path}
                          type="button"
                          onClick={() => setFormState({ ...formState, image: preset.path })}
                          className={cn(
                            "relative aspect-video rounded-md overflow-hidden border transition text-left cursor-pointer group",
                            isSelected ? "border-oxblood ring-2 ring-oxblood/40" : "border-border hover:border-oxblood/40"
                          )}
                        >
                          <img
                            src={preset.path}
                            alt={preset.label}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-1.5">
                            <span className="text-[10px] text-white font-sans font-medium truncate">
                              {preset.label}
                            </span>
                          </div>
                          {isSelected && (
                            <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-oxblood text-ivory flex items-center justify-center">
                              <Check className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-border hover:bg-muted text-xs font-semibold text-foreground transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-lg bg-oxblood hover:bg-oxblood-hover text-ivory text-xs font-semibold uppercase tracking-wider transition shadow-sm cursor-pointer"
                >
                  {editingSlideId ? 'Save Slide Changes' : 'Create Hero Slide'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
