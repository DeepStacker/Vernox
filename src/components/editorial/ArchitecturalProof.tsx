import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Quote, ArrowLeft, ArrowRight, ShieldCheck, CheckCircle2, Compass, Layers, Sun, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CuratedTestimonial {
  id: string;
  residenceTitle: string;
  quote: string;
  client: string;
  role: string;
  location: string;
  coordinates: string;
  product: string;
  productLink: string;
  image: string;
  rating: number;
  year: string;
  specs: {
    material: string;
    thickness: string;
    mounting: string;
    lighting: string;
    space: string;
  };
  highlight: string;
}

const ARCHITECTURAL_TESTIMONIALS: CuratedTestimonial[] = [
  {
    id: 'test-1',
    residenceTitle: 'Parisian Haussmann Living Salon',
    quote: 'One piece completely changed the character of our living room. The shadow cast by the 25mm standoffs as the afternoon sun sweeps across the limestone is extraordinary.',
    client: 'Claire & Marc D.',
    role: 'Private Residence Commission',
    location: 'Paris XVIe, France',
    coordinates: '48.86° N · 2.27° E',
    product: 'Résidence du Bois Concentric Relief',
    productLink: '/collections',
    image: '/images/installation-round.jpg',
    rating: 5,
    year: '2025',
    specs: {
      material: 'CZ108 Architectural Brass',
      thickness: '3.0mm Solid Plate',
      mounting: '25mm Concealed Floating Standoffs',
      lighting: 'Southwest Afternoon Grazing Light',
      space: 'French Limestone Fireplace Salon',
    },
    highlight: 'Transforms with daylight angles',
  },
  {
    id: 'test-2',
    residenceTitle: 'Zermatt High-Alpine Chalet',
    quote: 'The Cor-Ten screen brought an organic warmth to the chalet fireplace that raw stone alone could never achieve. The natural velvety oxidation is a work of art that feels alive.',
    client: 'Kohl Alpine Architecture',
    role: 'Hospitality Project Lead',
    location: 'Zermatt, Switzerland',
    coordinates: '45.97° N · 7.74° E',
    product: 'The Alpine Hearth Geometric Screen',
    productLink: '/collections',
    image: '/images/installation-corten.jpg',
    rating: 5,
    year: '2026',
    specs: {
      material: 'Weathering Cor-Ten Steel',
      thickness: '4.0mm Heavy Structural Plate',
      mounting: 'Direct Recessed Hearth Bracket',
      lighting: 'Ambient Firelight & 2700K Concealed LED',
      space: 'Mountain Pine & Granitic Slate Hearth',
    },
    highlight: 'Living velvety oxide patina',
  },
  {
    id: 'test-3',
    residenceTitle: 'Antwerp Historic Gallery Loft',
    quote: 'Uncompromising fabrication. The 3.0mm plate has genuine mass and absolute planar rigidity. Zero buckling, zero laser slag. Exactly the standard our studio demands for client commissions.',
    client: 'Studio De Smet Interiors',
    role: 'Principal Architect',
    location: 'Antwerp Zuid, Belgium',
    coordinates: '51.21° N · 4.39° E',
    product: 'Nova Facet Horizon Relief',
    productLink: '/collections',
    image: '/images/hero-art-lounge.jpg',
    rating: 5,
    year: '2025',
    specs: {
      material: 'Hand-Burnished Satin Steel',
      thickness: '3.0mm Planar Steel Plate',
      mounting: '30mm Architectural Standoff Set',
      lighting: 'Track Lighting (3000K 95+ CRI)',
      space: 'White Plaster Double-Height Atrium',
    },
    highlight: 'Laser tolerance within ±0.05mm',
  },
  {
    id: 'test-4',
    residenceTitle: 'Geneva Lakefront Penthouse',
    quote: 'From digital bespoke sizing to white-glove crate arrival in Geneva, Vernox was flawless. Under evening spotlights, the polished brass edges emit a glow that anchors the entire dining wing.',
    client: 'Éléonore & V. Saint-Germain',
    role: 'Art Collector & Private Patron',
    location: 'Cologny, Geneva, Switzerland',
    coordinates: '46.21° N · 6.18° E',
    product: 'Concentric Aureole Wall Monolith',
    productLink: '/collections',
    image: '/images/hero-penthouse-brass.jpg',
    rating: 5,
    year: '2025',
    specs: {
      material: 'Mirror-Polished Brass & Blackened Iron',
      thickness: '3.5mm Compound Assembly',
      mounting: 'Heavy-Duty M8 Structural Cleat',
      lighting: 'Dim-to-Warm Architectural Downlights',
      space: 'Smoked Oak Paneling Dining Pavilion',
    },
    highlight: 'Hand-serialized Antwerp hallmark',
  },
];

const CRAFTSMANSHIP_PILLARS = [
  {
    icon: Compass,
    title: 'Precision Stand-Off Depth',
    description: 'Calibrated 20–30mm standoff projections intentionally cast dynamic shadow play as sunlight traverses the room.',
  },
  {
    icon: Layers,
    title: 'Solid 3–4mm Heavy Plate',
    description: 'No hollow stamped sheet or foil laminates. Absolute structural mass and planar rigidity guaranteed for decades.',
  },
  {
    icon: Sun,
    title: 'Living Patina Formulations',
    description: 'Hand-applied cold chemical patinas sealed with museum-grade micro-crystalline wax that age gracefully.',
  },
  {
    icon: ShieldCheck,
    title: 'Registered Provenance Certificate',
    description: 'Every commission includes an archival Certificate of Provenance stamped with its Antwerp atelier serial number.',
  },
];

export function ArchitecturalProof() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const current = ARCHITECTURAL_TESTIMONIALS[currentIndex];

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % ARCHITECTURAL_TESTIMONIALS.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + ARCHITECTURAL_TESTIMONIALS.length) % ARCHITECTURAL_TESTIMONIALS.length);
  };

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <section 
      id="testimonials" 
      className="relative py-20 lg:py-28 bg-[#FAF8F5] text-dark-brown border-b border-[#EBE4D6] overflow-hidden"
    >
      {/* Subtle Background Architectural Ambient Grid */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage: `radial-gradient(#2A2421 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2.5 text-burgundy text-[10px] sm:text-[11px] uppercase tracking-[0.28em] font-mono font-medium mb-3.5">
            <span className="w-6 h-px bg-burgundy/40" />
            <span>ARCHITECTURAL PROVENANCE & COLLECTOR VOICES</span>
            <span className="w-6 h-px bg-burgundy/40" />
          </div>
          <h2 className="font-editorial text-3xl sm:text-4xl lg:text-5xl text-dark-brown font-normal tracking-tight">
            Voices from Living Spaces
          </h2>
          <p className="mt-3.5 text-sm sm:text-base text-dark-brown/70 font-sans leading-relaxed">
            How sculpted bronze, precision-milled brass, and hand-burnished steel redefine the light, depth, and spatial acoustics of discerning residences worldwide.
          </p>
        </div>

        {/* Installation Selectors / Tabs */}
        <div className="flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-4 mb-8 sm:mb-12 scrollbar-none no-scrollbar">
          {ARCHITECTURAL_TESTIMONIALS.map((item, idx) => {
            const isActive = idx === currentIndex;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`group flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full text-xs transition-all whitespace-nowrap cursor-pointer border ${
                  isActive
                    ? 'bg-dark-brown text-cream border-dark-brown shadow-xs'
                    : 'bg-white/80 hover:bg-white text-dark-brown/70 hover:text-dark-brown border-[#EBE4D6]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full transition-transform ${
                  isActive ? 'bg-gold scale-125' : 'bg-dark-brown/30 group-hover:bg-gold'
                }`} />
                <span className="font-mono text-[10px] opacity-60">0{idx + 1}</span>
                <span className="font-medium tracking-tight">{item.location.split(',')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Main Split-Stage Card: Photography on Left, Testimonial on Right */}
        <div className="bg-white border border-[#EBE4D6] rounded-xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[520px]">
            
            {/* Left Column: Installation Photography & Architectural Spec Strip */}
            <div className="lg:col-span-5 relative bg-[#EFE8DD] flex flex-col justify-between overflow-hidden border-b lg:border-b-0 lg:border-r border-[#EBE4D6]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.55, ease: [0.25, 1, 0.5, 1] }}
                  className="relative h-72 sm:h-80 lg:h-full min-h-[300px] w-full"
                >
                  <img
                    src={current.image}
                    alt={`${current.residenceTitle} - ${current.product}`}
                    className="w-full h-full object-cover object-center"
                    loading="lazy"
                  />

                  {/* Gradient Overlays */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none" />
                  
                  {/* Floating Architectural Badge */}
                  <div className="absolute top-4 left-4 z-10">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-white/40 text-[10px] font-mono tracking-wider text-dark-brown font-semibold shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                      {current.coordinates}
                    </span>
                  </div>

                  {/* Bottom Image Caption */}
                  <div className="absolute bottom-4 left-4 right-4 z-10 text-white">
                    <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-gold/90 font-medium">
                      ARCHITECTURAL PROVENANCE
                    </div>
                    <div className="font-editorial text-lg sm:text-xl font-normal leading-snug drop-shadow-sm mt-0.5">
                      {current.residenceTitle}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Technical Material Specifications Drawer */}
              <div className="bg-[#FAF8F5] border-t border-[#EBE4D6] p-4 sm:p-5">
                <div className="text-[10px] font-mono uppercase tracking-widest text-dark-brown/50 mb-2 font-medium">
                  ARCHITECTURAL FABRICATION METRICS
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-dark-brown/50 block text-[10px]">ALLOY & GAUGE</span>
                    <span className="font-medium text-dark-brown font-mono text-[11px]">{current.specs.material}</span>
                  </div>
                  <div>
                    <span className="text-dark-brown/50 block text-[10px]">MOUNTING SYSTEM</span>
                    <span className="font-medium text-dark-brown font-mono text-[11px]">{current.specs.mounting}</span>
                  </div>
                  <div>
                    <span className="text-dark-brown/50 block text-[10px]">LIGHTING BEHAVIOR</span>
                    <span className="font-medium text-dark-brown font-mono text-[11px]">{current.specs.lighting}</span>
                  </div>
                  <div>
                    <span className="text-dark-brown/50 block text-[10px]">SPACE APPLICATION</span>
                    <span className="font-medium text-dark-brown font-mono text-[11px]">{current.specs.space}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Right Column: Editorial Quote & Client Provenance */}
            <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 flex flex-col justify-between">
              
              <div>
                {/* Header Row: Stars, Verified Badge, Archive Number */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-[#F0EAE0]">
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: current.rating }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-gold text-gold" />
                    ))}
                    <span className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-emerald-800 bg-emerald-700/10 border border-emerald-700/20 px-2.5 py-1 rounded-full font-semibold font-sans ml-2">
                      <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                      Verified Installation · {current.year}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-dark-brown/40 tracking-wider">
                    ARCHIVE RECORD · 0{currentIndex + 1}
                  </span>
                </div>

                {/* Main Pull Quote */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={current.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="py-6 sm:py-8"
                  >
                    <Quote className="w-10 h-10 text-gold/30 mb-4" />
                    
                    <blockquote className="font-editorial text-xl sm:text-2xl lg:text-[28px] text-dark-brown font-normal leading-[1.38] tracking-tight">
                      "{current.quote}"
                    </blockquote>

                    {/* Curated Key Takeaway Tag */}
                    <div className="mt-4">
                      <span className="inline-block text-[11px] font-mono uppercase tracking-wider text-burgundy bg-burgundy/5 border border-burgundy/15 px-3 py-1 rounded-sm">
                        Curator Note: {current.highlight}
                      </span>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Patron Attribution & Commission Details */}
              <div className="pt-6 border-t border-[#F0EAE0] flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                <div>
                  <div className="font-editorial text-2xl text-dark-brown font-medium leading-none">
                    {current.client}
                  </div>
                  <div className="text-xs text-dark-brown/70 font-sans mt-1.5">
                    {current.role} · <span className="text-burgundy font-medium">{current.location}</span>
                  </div>
                  
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[11px] text-dark-brown/50 font-mono">Commission:</span>
                    <Link
                      to={current.productLink}
                      className="inline-flex items-center gap-1 text-xs font-mono font-medium text-dark-brown hover:text-burgundy underline underline-offset-4 transition"
                    >
                      {current.product}
                      <ArrowUpRight className="w-3 h-3 text-gold" />
                    </Link>
                  </div>
                </div>

                {/* Navigation Arrows & Numeric Counter */}
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="p-3 rounded-full border border-[#EBE4D6] hover:border-burgundy hover:text-burgundy text-dark-brown transition bg-white shadow-2xs cursor-pointer hover:scale-105 active:scale-95"
                    aria-label="Previous quote"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1 font-mono text-xs text-dark-brown/70 px-1 select-none">
                    <span className="font-bold text-dark-brown">0{currentIndex + 1}</span>
                    <span className="opacity-40">/</span>
                    <span className="opacity-60">0{ARCHITECTURAL_TESTIMONIALS.length}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleNext}
                    className="p-3 rounded-full border border-[#EBE4D6] hover:border-burgundy hover:text-burgundy text-dark-brown transition bg-white shadow-2xs cursor-pointer hover:scale-105 active:scale-95"
                    aria-label="Next quote"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* Four Craftsmanship Assurance Pillars Below Main Testimonial */}
        <div className="mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-10 border-t border-[#EBE4D6]/80">
          {CRAFTSMANSHIP_PILLARS.map((pillar, i) => {
            const Icon = pillar.icon;
            return (
              <div 
                key={i} 
                className="group p-5 rounded-lg bg-white/60 hover:bg-white border border-[#EBE4D6]/70 hover:border-[#D8CBB8] transition-all duration-300 shadow-2xs hover:shadow-xs"
              >
                <div className="w-9 h-9 rounded-md bg-[#FAF8F5] border border-[#EBE4D6] flex items-center justify-center text-burgundy group-hover:text-gold transition-colors mb-3.5">
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="font-editorial text-base text-dark-brown font-medium tracking-tight mb-1.5">
                  {pillar.title}
                </h3>
                <p className="text-xs text-dark-brown/65 leading-relaxed font-sans">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
