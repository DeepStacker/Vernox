import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Compass, Check, MapPin, Maximize2 } from 'lucide-react';
import { useCatalog } from '@/lib/catalogContext';

interface InstallationEnvironment {
  id: string;
  name: string;
  category: string;
  location: string;
  image: string;
  artworkName: string;
  artworkSlug: string;
  alloy: string;
  dimensions: string;
  weight: string;
  standoff: string;
  substrate: string;
  architect: string;
  description: string;
}

const INSTALLATIONS: InstallationEnvironment[] = [
  {
    id: 'paris-penthouse',
    name: 'Résidence du Bois Living Salon',
    category: 'Private Residential',
    location: 'Paris XVIe, France',
    image: '/images/installation-round.jpg',
    artworkName: 'Ember Concentric Relief',
    artworkSlug: 'ember-round-frame',
    alloy: 'Solid 3.0mm CZ108 Belgian Brass',
    dimensions: '1,200 mm Diameter',
    weight: '24.5 kg Net Plate Mass',
    standoff: '25mm Machined Standoff Float',
    substrate: 'Honed French Limestone Mantle',
    architect: 'Atelier V. Renard Interior Architecture',
    description: 'Custom concentric relief sliced from solid Belgian brass, hand-grained in linear satin and mounted with rear floating standoffs to interact with natural morning window light.',
  },
  {
    id: 'alpine-hearth',
    name: 'The Alpine Chalet Hearth',
    category: 'Hospitality & Private Lodge',
    location: 'Zermatt, Swiss Alps',
    image: '/images/installation-corten.jpg',
    artworkName: 'Atrium Weathering Screen',
    artworkSlug: 'atrium-square',
    alloy: 'Structural Cor-Ten Steel (EN 10025-5)',
    dimensions: '1,800 × 900 mm Composition',
    weight: '38.2 kg Net Plate Mass',
    standoff: '30mm Heavy-Duty Structural Anchors',
    substrate: 'Board-Formed Architectural Concrete',
    architect: 'Kohl Alpine Architecture',
    description: 'Weathered Cor-Ten steel screen accelerated over 90 days in our chemical baths to achieve a deep amber-terracotta oxide skin, sealed with matte clear barrier to protect surrounding masonry.',
  },
  {
    id: 'antwerp-penthouse',
    name: 'Nova Facet Horizon Suite',
    category: 'Penthouse Residence',
    location: 'Antwerp Zuid, Belgium',
    image: '/images/hero-penthouse-brass.jpg',
    artworkName: 'Nova Facet Relief',
    artworkSlug: 'nova-star',
    alloy: 'Solid 3.0mm Brass · 24K Hand Gilding',
    dimensions: '1,600 × 1,000 mm Composition',
    weight: '31.0 kg Net Plate Mass',
    standoff: '20mm Concealed Rear Float',
    substrate: 'Acoustic Dark Walnut Timber Slats',
    architect: 'Studio De Smet Interiors',
    description: 'Geometric faceted brass planes capturing ambient evening directional track lighting, mounted over acoustic architectural timber panelling.',
  },
  {
    id: 'atelier-studio',
    name: 'Master Craftsman Studio',
    category: 'Atelier Workbench',
    location: 'Kloosterstraat, Antwerp',
    image: '/images/artisan-workshop.jpg',
    artworkName: 'Aegis Shield Relief',
    artworkSlug: 'aegis-shield',
    alloy: 'Hand-Grained Marine 316L Stainless',
    dimensions: '1,400 × 800 mm Composition',
    weight: '27.4 kg Net Plate Mass',
    standoff: '25mm Solid Stainless Mounts',
    substrate: 'Industrial Brick & Concrete',
    architect: 'Vernox Atelier Métallurgie',
    description: 'Hand-graining and tolerance inspection of marine stainless steel plates prior to application of archival microcrystalline wax and white-glove timber crating.',
  },
];

export function RoomVisualizer({ onOpenStudio }: { onOpenStudio?: () => void }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const current = INSTALLATIONS[selectedIndex];

  return (
    <section 
      id="visualizer" 
      className="relative py-24 md:py-32 bg-[#141518] text-[#F4F2EE] border-b border-white/10"
    >
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#C5A880] font-mono font-semibold mb-2">
              Spatial Scale & Architecture
            </div>
            <h2 className="font-editorial text-4xl sm:text-5xl md:text-6xl text-white font-normal leading-[1.05] tracking-tight">
              See it in your space.
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-[#F4F2EE]/65 max-w-md font-sans leading-relaxed">
            Metal wall art interacts with architectural light, cast shadow depths, and wall materials. Review how our solid 3.0mm pieces anchor real living environments.
          </p>
        </div>

        {/* Main Architectural Stage */}
        <div className="rounded-[3px] border border-white/15 bg-black overflow-hidden shadow-2xl">
          {/* Main Visual Display */}
          <div className="relative aspect-[16/9] sm:aspect-[21/10] w-full overflow-hidden bg-black">
            <AnimatePresence mode="wait">
              <motion.img
                key={current.id}
                src={current.image}
                alt={current.name}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full h-full object-cover object-center brightness-[0.88]"
              />
            </AnimatePresence>

            {/* Gradient Scrim for Contrast */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

            {/* Top Architectural Badge */}
            <div className="absolute top-4 left-4 z-10 bg-black/80 backdrop-blur-md px-4 py-2 border border-white/15 rounded-[2px]">
              <div className="text-[8px] uppercase tracking-[0.28em] text-[#C5A880] font-mono font-semibold">
                {current.category}
              </div>
              <div className="font-editorial text-sm sm:text-base text-white mt-0.5">
                {current.name}
              </div>
              <div className="text-[10px] text-white/50 font-mono flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3 h-3 text-[#C5A880]" />
                {current.location}
              </div>
            </div>

            {/* Bottom In-Situ Placard */}
            <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4 p-4 rounded-[2px] bg-black/85 backdrop-blur-md border border-white/15">
              <div>
                <div className="text-[9px] uppercase tracking-widest text-[#C5A880] font-mono font-semibold">
                  Installed Artwork
                </div>
                <div className="font-editorial text-xl sm:text-2xl text-white font-normal mt-0.5">
                  {current.artworkName}
                </div>
                <div className="text-xs text-white/70 font-mono mt-1">
                  {current.alloy} · {current.dimensions}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  to={`/product/${current.artworkSlug}`}
                  className="px-5 py-2.5 rounded-[2px] bg-[#FAF8F5] text-[#18181B] text-xs uppercase tracking-widest font-semibold hover:bg-white transition flex items-center gap-2"
                >
                  Configure Artwork
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                {onOpenStudio && (
                  <button
                    type="button"
                    onClick={onOpenStudio}
                    className="px-4 py-2.5 rounded-[2px] border border-white/20 hover:border-white text-white text-xs uppercase tracking-widest font-semibold transition flex items-center gap-2 cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5 text-[#C5A880]" />
                    Bespoke Studio
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Environment Tabs */}
          <div className="p-6 md:p-8 bg-[#18191D] border-t border-white/10">
            <div className="text-[9px] uppercase tracking-[0.25em] text-[#C5A880] font-mono font-semibold mb-3">
              Select Interior Environment & Installation
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {INSTALLATIONS.map((inst, idx) => (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className={`p-3.5 rounded-[2px] text-left transition-all border cursor-pointer ${
                    selectedIndex === idx
                      ? 'bg-white/15 border-[#C5A880] text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20'
                  }`}
                >
                  <div className="text-[9px] font-mono text-[#C5A880] uppercase tracking-wider">
                    0{idx + 1} · {inst.category}
                  </div>
                  <div className="text-xs font-semibold text-white mt-1 truncate">
                    {inst.name}
                  </div>
                  <div className="text-[10px] text-white/50 truncate mt-0.5">
                    {inst.artworkName}
                  </div>
                </button>
              ))}
            </div>

            {/* Technical Specification Bar for Current Selection */}
            <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-white/40 block">Mounting Detail</span>
                <span className="text-white font-medium">{current.standoff}</span>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-white/40 block">Total Mass</span>
                <span className="text-white font-medium">{current.weight}</span>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-white/40 block">Wall Substrate</span>
                <span className="text-white font-medium">{current.substrate}</span>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-white/40 block">Architectural Credit</span>
                <span className="text-[#C5A880] font-medium">{current.architect}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
