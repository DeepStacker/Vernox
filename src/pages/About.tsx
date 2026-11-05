import { useState } from 'react';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Star, 
  ArrowRight, 
  ChevronDown, 
  Sparkles, 
  Layers, 
  ShieldCheck, 
  Compass, 
  CheckCircle2, 
  ExternalLink,
  Building2,
  Home,
  Briefcase,
  Landmark,
  Palette
} from 'lucide-react';

import { useSeo } from '@/lib/seo';
const PROCESS_STEPS = [
  {
    phase: 'Phase 01',
    title: 'The Digital Canvas & Dynamic Kerf',
    subtitle: 'Where vector line meets engineering CAD',
    desc: 'Every commission begins with parametric vector calculation. Design geometries are fed directly into nesting software, translating architectural sketches into laser paths with dynamic kerf offset compensation.',
    detail: 'Kerf compensation is calculated dynamically for seamless interlocking elements and standoff fixings.'
  },
  {
    phase: 'Phase 02',
    title: 'Nitrogen-Shielded Fibre Laser',
    subtitle: 'Slicing 3.0mm structural steel with pure light',
    desc: 'Certified raw plate is loaded onto our dual-pallet bed. A high-power nitrogen-assist fibre laser beam slices through alloy plate, achieving clean edge perpendicularity without thermal warping.',
    detail: 'High-pressure nitrogen shielding eliminates edge oxidation, leaving clean metallurgical surfaces.'
  },
  {
    phase: 'Phase 03',
    title: 'Hand Dressing & Directional Graining',
    subtitle: 'Artisanal texture crafted by human hands',
    desc: 'Every piece is hand-deburred and dressed with abrasive blocks. Artisans guide the plate across linishing belts to build a rich, uniform satin brush that catches and breaks ambient light.',
    detail: 'Graining is applied unidirectionally parallel to the structural silhouette, accentuating clean architectural lines.'
  },
  {
    phase: 'Phase 04',
    title: 'Atelier Chemical Patination',
    subtitle: 'Historic multi-stage oxidation recipes',
    desc: 'We immerse the prepared metal into controlled chemical oxidation baths. From smoked charcoal bronze to velvety Corten rust and radiant brushed brass, our patinas are naturally matured and sealed.',
    detail: 'Patinas are halted with neutralizing agents and sealed with archival microcrystalline wax.'
  },
  {
    phase: 'Phase 05',
    title: 'Numbered Seal & White-Glove Crate',
    subtitle: 'Physical hallmark & signed Certificate of Authenticity',
    desc: 'On the reverse, each piece is stamped with the Vernox seal, edition sequence, and alloy hallmark. Pieces are protected in archival wrapping and secured inside reinforced timber crates.',
    detail: 'Accompanied by a Certificate of Authenticity signed by our master laser technician and patinator.'
  }
];

export default function About() {
  useSeo({ title: 'About', description: 'The story behind Vernox: precision laser-cut metal wall art, designed and made to order in India.' });
  const [activeStep, setActiveStep] = useState<number | null>(0);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-cream text-dark-brown selection:bg-burgundy selection:text-cream">
      <SiteHeader />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-20 space-y-24 sm:space-y-32">
        {/* =========================================================================
            SECTION 1: CRAFTING WITH PURPOSE (Hero Story + 3-Media Gallery + 4 Stats)
            ========================================================================= */}
        <section className="space-y-8">
          {/* Top Headline + Editorial Sub-copy */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-[#E8E1D3] pb-8">
            <h1 className="font-editorial text-4xl sm:text-6xl lg:text-7xl text-dark-brown font-normal leading-[1.08] tracking-tight">
              Crafting with<br />Purpose
            </h1>
            <p className="text-xs sm:text-sm text-dark-brown/70 font-sans leading-relaxed max-w-md md:pt-3">
              We aim to redefine modern living through thoughtful design, premium materials, and enduring quality — creating architectural pieces that inspire connection and comfort.
            </p>
          </div>

          {/* 3-Card Media Row: Testimonial Card + Interior Context + Artisan Workshop */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* 1. Collector Review Card */}
            <div className="bg-white border border-[#E8E1D3] rounded-sm p-6 sm:p-8 flex flex-col justify-between shadow-xs">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-cream border border-[#DCD3C0] shrink-0">
                    <img
                      src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80"
                      alt="Daniel Nguyen"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="font-editorial text-base text-dark-brown font-medium leading-snug">
                      Daniel Nguyen
                    </h3>
                    <p className="text-[11px] text-dark-brown/60 font-sans">
                      Sydney, Australia
                    </p>
                  </div>
                </div>

                {/* 5 Gold Stars */}
                <div className="flex items-center gap-1 text-gold pt-2">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-gold text-gold" />
                  ))}
                </div>

                <blockquote className="text-xs sm:text-sm text-dark-brown/85 font-sans leading-relaxed pt-2">
                  “I absolutely love my Vernox statement piece! The quality is outstanding and the design is so calming. It completely transformed my space into a cozy retreat.”
                </blockquote>
              </div>

              <div className="pt-6 border-t border-[#EFEAE0] mt-6">
                <span className="text-[10px] uppercase tracking-[0.2em] text-dark-brown/50 font-sans font-semibold">
                  Verified Collector Acquisition
                </span>
              </div>
            </div>

            {/* 2. Architectural Interior Photo */}
            <div className="rounded-sm overflow-hidden border border-[#E8E1D3] bg-white shadow-xs group min-h-[280px]">
              <img
                src="/images/hero-art-lounge.jpg"
                alt="Contemporary room context with architectural art and armchair"
                className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-700"
              />
            </div>

            {/* 3. Artisan in Workshop Photo */}
            <div className="rounded-sm overflow-hidden border border-[#E8E1D3] bg-white shadow-xs group min-h-[280px]">
              <img
                src="/images/artisan-workshop.jpg"
                alt="Artisan hand-crafting and measuring raw materials"
                className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-700"
              />
            </div>
          </div>

          {/* 4-Stat Metric Ledger Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 pt-2">
            <div className="bg-white border border-[#E8E1D3] rounded-sm p-6 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-burgundy/30 transition-colors">
              <div className="font-editorial text-3xl sm:text-5xl text-dark-brown font-medium tracking-tight">
                10,000+
              </div>
              <p className="text-xs text-dark-brown/65 font-sans mt-4 leading-relaxed">
                Across 25+ countries and growing every year.
              </p>
            </div>

            <div className="bg-white border border-[#E8E1D3] rounded-sm p-6 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-burgundy/30 transition-colors">
              <div className="font-editorial text-3xl sm:text-5xl text-dark-brown font-medium tracking-tight">
                1,200+
              </div>
              <p className="text-xs text-dark-brown/65 font-sans mt-4 leading-relaxed">
                Designed and handcrafted to match unique spaces.
              </p>
            </div>

            <div className="bg-white border border-[#E8E1D3] rounded-sm p-6 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-burgundy/30 transition-colors">
              <div className="font-editorial text-3xl sm:text-5xl text-dark-brown font-medium tracking-tight flex items-baseline gap-1">
                <span>4.9</span>
                <span className="text-gold text-2xl sm:text-3xl">★</span>
              </div>
              <p className="text-xs text-dark-brown/65 font-sans mt-4 leading-relaxed">
                Based on verified customer reviews.
              </p>
            </div>

            <div className="bg-white border border-[#E8E1D3] rounded-sm p-6 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-burgundy/30 transition-colors">
              <div className="font-editorial text-3xl sm:text-5xl text-dark-brown font-medium tracking-tight">
                50+
              </div>
              <p className="text-xs text-dark-brown/65 font-sans mt-4 leading-relaxed">
                Recognized for sustainable and innovative craftsmanship.
              </p>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 2: SPATIAL APPLICATIONS (3x2 Architecture & Environment Grid)
            ========================================================================= */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center border-t border-[#E8E1D3] pt-20">
          {/* Left Column: Heading & Subtitle */}
          <div className="lg:col-span-5 space-y-4">
            <span className="text-[11px] uppercase tracking-[0.22em] text-burgundy font-semibold font-sans">
              Commission Sectors
            </span>
            <h2 className="font-editorial text-4xl sm:text-5xl text-dark-brown font-normal leading-[1.12]">
              Spatial<br />Applications
            </h2>
            <p className="text-xs sm:text-sm text-dark-brown/70 font-sans leading-relaxed max-w-sm">
              From private residential sanctuaries to flagship commercial spaces, our architectural metalwork is engineered to command presence in curated interiors.
            </p>
            <div className="pt-2">
              <Link
                to="/trade"
                className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] font-semibold text-burgundy hover:text-burgundy-hover transition-colors font-sans"
              >
                <span>Architectural Trade Program</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Right Column: 3x2 Grid of Spatial Sectors */}
          <div className="lg:col-span-7">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {/* Sector 1: Private Residences */}
              <div className="bg-white border border-[#E8E1D3] rounded-sm p-5 sm:p-6 flex flex-col justify-between min-h-[130px] shadow-2xs hover:border-burgundy/40 transition-all group">
                <div className="w-8 h-8 rounded-full bg-cream/70 flex items-center justify-center text-burgundy group-hover:bg-burgundy group-hover:text-cream transition-colors">
                  <Home className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-editorial text-sm font-semibold text-dark-brown tracking-tight">Private Residences</h3>
                  <p className="text-[11px] text-dark-brown/60 font-sans mt-0.5">Living salons, foyers & stairwell reliefs</p>
                </div>
              </div>

              {/* Sector 2: Hotels & Resorts */}
              <div className="bg-white border border-[#E8E1D3] rounded-sm p-5 sm:p-6 flex flex-col justify-between min-h-[130px] shadow-2xs hover:border-burgundy/40 transition-all group">
                <div className="w-8 h-8 rounded-full bg-cream/70 flex items-center justify-center text-burgundy group-hover:bg-burgundy group-hover:text-cream transition-colors">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-editorial text-sm font-semibold text-dark-brown tracking-tight">Hotels & Resorts</h3>
                  <p className="text-[11px] text-dark-brown/60 font-sans mt-0.5">Grand lobbies, suites & feature screens</p>
                </div>
              </div>

              {/* Sector 3: Corporate HQs */}
              <div className="bg-white border border-[#E8E1D3] rounded-sm p-5 sm:p-6 flex flex-col justify-between min-h-[130px] shadow-2xs hover:border-burgundy/40 transition-all group">
                <div className="w-8 h-8 rounded-full bg-cream/70 flex items-center justify-center text-burgundy group-hover:bg-burgundy group-hover:text-cream transition-colors">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-editorial text-sm font-semibold text-dark-brown tracking-tight">Corporate HQs</h3>
                  <p className="text-[11px] text-dark-brown/60 font-sans mt-0.5">Boardrooms & executive reception focal points</p>
                </div>
              </div>

              {/* Sector 4: Design Studios */}
              <div className="bg-white border border-[#E8E1D3] rounded-sm p-5 sm:p-6 flex flex-col justify-between min-h-[130px] shadow-2xs hover:border-burgundy/40 transition-all group">
                <div className="w-8 h-8 rounded-full bg-cream/70 flex items-center justify-center text-burgundy group-hover:bg-burgundy group-hover:text-cream transition-colors">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-editorial text-sm font-semibold text-dark-brown tracking-tight">Design Studios</h3>
                  <p className="text-[11px] text-dark-brown/60 font-sans mt-0.5">Interior specifiers & bespoke CAD translations</p>
                </div>
              </div>

              {/* Sector 5: Curated Galleries */}
              <div className="bg-white border border-[#E8E1D3] rounded-sm p-5 sm:p-6 flex flex-col justify-between min-h-[130px] shadow-2xs hover:border-burgundy/40 transition-all group">
                <div className="w-8 h-8 rounded-full bg-cream/70 flex items-center justify-center text-burgundy group-hover:bg-burgundy group-hover:text-cream transition-colors">
                  <Palette className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-editorial text-sm font-semibold text-dark-brown tracking-tight">Curated Galleries</h3>
                  <p className="text-[11px] text-dark-brown/60 font-sans mt-0.5">Numbered limited editions & hallmark pieces</p>
                </div>
              </div>

              {/* Sector 6: Luxury Developments */}
              <div className="bg-white border border-[#E8E1D3] rounded-sm p-5 sm:p-6 flex flex-col justify-between min-h-[130px] shadow-2xs hover:border-burgundy/40 transition-all group">
                <div className="w-8 h-8 rounded-full bg-cream/70 flex items-center justify-center text-burgundy group-hover:bg-burgundy group-hover:text-cream transition-colors">
                  <Landmark className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-editorial text-sm font-semibold text-dark-brown tracking-tight">Luxury Developments</h3>
                  <p className="text-[11px] text-dark-brown/60 font-sans mt-0.5">Penthouse installations & architectural accents</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 3: WHY CHOOSE US (Hero Vertical Photography + 2x2 Feature Grid)
            ========================================================================= */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start border-t border-[#E8E1D3] pt-20">
          {/* Left Column: Heading + Description + Warm Golden Vertical Showcase Image */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-4">
              <h2 className="font-editorial text-4xl sm:text-5xl text-dark-brown font-normal leading-[1.12]">
                Why Choose Us
              </h2>
              <p className="text-xs sm:text-sm text-dark-brown/70 font-sans leading-relaxed max-w-sm">
                Explore curated pieces that bring comfort, character, and elegance to every corner of your home.
              </p>
            </div>

            {/* Vertical Warm Metal Photography Box */}
            <div className="rounded-sm overflow-hidden border border-[#E8E1D3] bg-white shadow-xs aspect-[4/5] group">
              <img
                src="/images/statement-piece.jpg"
                alt="Brushed brass metalwork with warm architectural lighting"
                className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-700"
              />
            </div>
          </div>

          {/* Right Column: 2x2 Feature Cards Grid */}
          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {/* Card 1: Sustainable Materials */}
              <div className="bg-white border border-[#E8E1D3] rounded-sm p-6 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-burgundy/30 transition-all">
                <div className="space-y-3">
                  <h3 className="font-editorial text-xl sm:text-2xl text-dark-brown font-medium leading-snug">
                    Sustainable Materials
                  </h3>
                  <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
                    We source eco-friendly metals and natural finishes, ensuring each piece is responsibly made with respect for nature.
                  </p>
                </div>
                <div className="pt-6 mt-6 border-t border-[#F2ECE0]">
                  <Link
                    to="/shop"
                    className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] font-semibold text-dark-brown hover:text-burgundy font-sans transition-colors"
                  >
                    <span>Read More</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Card 2: Handcrafted Quality */}
              <div className="bg-white border border-[#E8E1D3] rounded-sm p-6 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-burgundy/30 transition-all">
                <div className="space-y-3">
                  <h3 className="font-editorial text-xl sm:text-2xl text-dark-brown font-medium leading-snug">
                    Handcrafted Quality
                  </h3>
                  <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
                    Every design is brought to life by skilled artisans who combine traditional craftsmanship with modern precision.
                  </p>
                </div>
                <div className="pt-6 mt-6 border-t border-[#F2ECE0]">
                  <Link
                    to="/studio"
                    className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] font-semibold text-dark-brown hover:text-burgundy font-sans transition-colors"
                  >
                    <span>Read More</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Card 3: Timeless Design */}
              <div className="bg-white border border-[#E8E1D3] rounded-sm p-6 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-burgundy/30 transition-all">
                <div className="space-y-3">
                  <h3 className="font-editorial text-xl sm:text-2xl text-dark-brown font-medium leading-snug">
                    Timeless Design
                  </h3>
                  <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
                    Minimalist geometries and sculptural proportions designed to endure and complement timeless living spaces.
                  </p>
                </div>
                <div className="pt-6 mt-6 border-t border-[#F2ECE0]">
                  <Link
                    to="/shop/wall-art"
                    className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] font-semibold text-dark-brown hover:text-burgundy font-sans transition-colors"
                  >
                    <span>Read More</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Card 4: Customer Satisfaction */}
              <div className="bg-white border border-[#E8E1D3] rounded-sm p-6 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-burgundy/30 transition-all">
                <div className="space-y-3">
                  <h3 className="font-editorial text-xl sm:text-2xl text-dark-brown font-medium leading-snug">
                    Customer Satisfaction
                  </h3>
                  <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
                    Dedicated client concierge, insured freight crating, and 30-day in-situ evaluation for complete peace of mind.
                  </p>
                </div>
                <div className="pt-6 mt-6 border-t border-[#F2ECE0]">
                  <Link
                    to="/shipping"
                    className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] font-semibold text-dark-brown hover:text-burgundy font-sans transition-colors"
                  >
                    <span>Read More</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 4: ATELIER FABRICATION PHASES (Architectural Craftsmanship Accordion)
            ========================================================================= */}
        <section className="border-t border-[#E8E1D3] pt-20 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-[10px] uppercase tracking-[0.24em] text-gold font-sans font-semibold">
              The Metallurgy Protocol
            </span>
            <h2 className="font-editorial text-3xl sm:text-5xl text-dark-brown font-normal">
              From Raw Alloy to Archival Form
            </h2>
            <p className="text-xs sm:text-sm text-dark-brown/70 font-sans leading-relaxed">
              Explore the five distinct phases that transform certified structural plate into hand-finished architectural masterworks.
            </p>
          </div>

          <div className="max-w-3xl mx-auto divide-y divide-[#E8E1D3] border-y border-[#E8E1D3] bg-white rounded-sm shadow-2xs">
            {PROCESS_STEPS.map((step, idx) => {
              const isOpen = activeStep === idx;
              return (
                <div key={step.phase} className="p-5 sm:p-6 transition-colors hover:bg-cream/20">
                  <button
                    type="button"
                    onClick={() => setActiveStep(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-xs text-gold font-semibold uppercase tracking-wider">
                        {step.phase}
                      </span>
                      <h3 className="font-editorial text-xl sm:text-2xl text-dark-brown font-medium">
                        {step.title}
                      </h3>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-gold transition-transform duration-300 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-4 space-y-3 text-xs sm:text-sm text-dark-brown/75 font-sans leading-relaxed pl-14">
                          <p className="text-dark-brown/90 font-medium">{step.subtitle}</p>
                          <p>{step.desc}</p>
                          <p className="text-[11px] text-dark-brown/60 italic border-l-2 border-gold/40 pl-3">
                            {step.detail}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

        {/* =========================================================================
            SECTION 5: INVITATION BANNER (Explore the Shop or Design Custom Studio)
            ========================================================================= */}
        <section className="bg-white border border-[#E8E1D3] rounded-sm p-8 sm:p-14 text-center space-y-6 shadow-xs">
          <span className="text-[10px] uppercase tracking-[0.24em] text-gold font-sans font-semibold">
            Architectural Metalcraft
          </span>
          <h2 className="font-editorial text-3xl sm:text-5xl text-dark-brown max-w-2xl mx-auto leading-tight">
            Bring Enduring Modern Sculpture to Your Interior
          </h2>
          <p className="text-xs sm:text-sm text-dark-brown/70 font-sans max-w-xl mx-auto leading-relaxed">
            Discover limited curated collection editions ready for white-glove crated delivery, or launch our parametric CAD studio to craft custom architectural dimensions.
          </p>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/shop"
              className="btn-burgundy text-xs uppercase tracking-[0.2em] py-3.5 px-8 font-semibold shadow-sm"
            >
              Explore Collections
            </Link>
            <Link
              to="/studio"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xs border border-[#D5CBB8] bg-white text-xs uppercase tracking-[0.18em] font-sans font-semibold text-dark-brown hover:border-burgundy transition-colors shadow-2xs"
            >
              <span>Custom CAD Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}