import { useState, useMemo } from 'react';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { Link } from 'react-router-dom';
import { 
  HelpCircle, 
  Search, 
  ChevronDown, 
  Layers, 
  Hammer, 
  Truck, 
  CreditCard, 
  ShieldCheck, 
  Sparkles,
  ArrowRight,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useSeo } from '@/lib/seo';
interface FaqItem {
  q: string;
  a: string;
  category: 'materials' | 'installation' | 'custom' | 'orders' | 'shipping';
}

const FAQ_DATA: FaqItem[] = [
  // Materials & Craftsmanship
  {
    category: 'materials',
    q: 'What metals and alloys are used in Vernox architectural artworks?',
    a: 'We craft predominantly from certified 3.0mm structural plate: cold-rolled mild steel for patinated pieces, C260 architectural brass, and European Corten weathering alloy (EN 10025-5). Each piece is solid metal throughout—we never use hollow metal foil or plastic composite cores.'
  },
  {
    category: 'materials',
    q: 'Will the metal rust, tarnish, or change color over time indoors?',
    a: 'All our indoor pieces undergo chemical passivation followed by multiple micro-layers of museum-grade French Renaissance microcrystalline wax. This seals the chemical patina from moisture and environmental oxidation, preserving the exact finish for decades in standard indoor climates.'
  },
  {
    category: 'materials',
    q: 'Can Vernox artworks be installed outdoors or in high-humidity bathrooms?',
    a: 'For outdoor installations or seaside patios, we recommend our Corten Weathered Steel (which thrives when exposed to natural humidity) or 316-grade Marine Stainless Steel with passivation. Standard mild steel and unlacquered brass are recommended exclusively for climate-controlled interiors.'
  },
  {
    category: 'materials',
    q: 'How do I clean and care for my patinated metal sculpture?',
    a: 'Dust lightly with a dry, lint-free microfiber cloth or goat-hair art brush. Never use ammonia-based glass cleaners, bleach, abrasive pastes, or industrial solvents, as these strip the microcrystalline wax barrier. To refresh the luster after several years, apply a pea-sized dab of Renaissance wax and buff gently.'
  },

  // Installation & Wall Mounting
  {
    category: 'installation',
    q: 'How heavy are the pieces, and do I need to find wall studs?',
    a: 'Depending on the silhouette, a medium (60×60cm) piece weighs between 3.5 kg and 6.0 kg, while a grand (180×100cm) statement piece weighs 14 kg to 22 kg. Standard hollow drywall with our included heavy-duty toggle anchors can hold up to 25 kg per anchor point. Finding studs is recommended for pieces over 120cm, but not mandatory when using our certified wall hardware.'
  },
  {
    category: 'installation',
    q: 'What mounting hardware is supplied in the wooden crate?',
    a: 'Every piece arrives with bespoke solid metal standoff barrels (matching the artwork finish: brass, black oxide, or stainless), high-tensile wall screws, heavy-load drywall anchors, cotton white-glove handling mittens, and a 1:1 scale paper drilling template.'
  },
  {
    category: 'installation',
    q: 'How far does the artwork float off the wall surface?',
    a: 'Our architectural standoff barrels create a precise 20mm (0.78 inch) clearance between the wall and the metal plate. This creates a shadow-gap profile, allowing light to cast dramatic ambient shadows across the back wall as lighting shifts throughout the day.'
  },

  // Sizing, Custom CAD & Commissions
  {
    category: 'custom',
    q: 'Can I request a custom size or scale a catalog design for my room?',
    a: 'Yes. Every design is parametrically modeled in our CAD studio. You can enter our Crafting Studio to customize dimensions down to the millimeter, or reach out to our concierge for a bespoke scale matching your fireplace, headboard, or corporate reception dimensions.'
  },
  {
    category: 'custom',
    q: 'Can I upload my own company logo, family monogram, or architectural CAD vector?',
    a: 'Absolutely. Our Crafting Studio accepts SVG vector files and high-resolution images with real-time vectorization and automated kerf offset calculation. Our engineering team reviews all customer files to verify bridge thickness and cut stability before laser slicing.'
  },
  {
    category: 'custom',
    q: 'What is dynamic kerf compensation and why does it matter?',
    a: 'When a 3000W fiber laser cuts metal, the focused beam burns away a microscopic kerf width of approximately 0.16mm. Our software automatically offsets vector paths outward by half the kerf (±0.08mm) so your finished metal silhouette matches your digital drawing dimensions exactly.'
  },

  // Ordering, Payment & Security
  {
    category: 'orders',
    q: 'What payment methods do you support, and is payment secure?',
    a: 'We accept all major credit and debit cards (Visa, MasterCard, American Express), UPI, and net banking via Razorpay with 256-bit TLS encryption, PCI-DSS Level 1 compliance, and HMAC-SHA256 server-authoritative signature verification. We never store credit card numbers on our servers.'
  },
  {
    category: 'orders',
    q: 'Do you offer trade discounts for interior designers and architects?',
    a: 'Yes. Our dedicated Trade Program offers volume-tiered discounts from 15% to 35%, dedicated project managers, custom DWG/STEP translation, and material sample folios. Visit our Trade page to apply.'
  },

  // Shipping, Crating & Logistics
  {
    category: 'shipping',
    q: 'How are the pieces packed to prevent bending in transit?',
    a: 'We build custom zero-deflection timber crates lined with high-density shock-absorbing foam and Belgian archival tissue. Artworks are bolted to an internal plywood sub-frame so the edges float freely without contacting the crate walls.'
  },
  {
    category: 'shipping',
    q: 'How long does production and delivery take?',
    a: 'Standard catalog masterworks take 3–5 business days to cut, patinate, and crate, followed by 2–4 days express air courier transit. Custom CAD commissions take 5–8 business days for toolpath optimization and proofing.'
  },
  {
    category: 'shipping',
    q: 'Can I return an artwork if it does not fit my room aesthetic?',
    a: 'Standard catalog pieces include a 30-day in-situ inspection period. If the piece does not suit your space, contact our concierge to schedule an insured courier pickup for a full refund or exchange. Custom bespoke pieces are protected by a lifetime alloy structural integrity guarantee.'
  }
];

export default function Faqs() {
  useSeo({ title: 'FAQs', description: 'Answers on materials, finishes, custom designs, delivery, payments and returns for Vernox metal wall art.' });
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const categories = [
    { id: 'all', label: 'All Inquiries' },
    { id: 'materials', label: 'Materials & Patinas' },
    { id: 'installation', label: 'Wall Mounting & Hanging' },
    { id: 'custom', label: 'Custom CAD & Sizing' },
    { id: 'orders', label: 'Payments & Trade' },
    { id: 'shipping', label: 'Shipping & Crating' },
  ];

  const filteredFaqs = useMemo(() => {
    return FAQ_DATA.filter(item => {
      const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  return (
    <div className="min-h-screen flex flex-col bg-cream text-dark-brown selection:bg-burgundy selection:text-cream">
      <SiteHeader />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-20">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-burgundy/10 text-burgundy text-[10px] uppercase tracking-[0.24em] font-sans font-semibold">
            <HelpCircle className="w-3.5 h-3.5 text-gold" />
            <span>Atelier Knowledge Base</span>
          </div>
          <h1 className="font-editorial text-3xl sm:text-5xl text-dark-brown font-normal tracking-wide">
            Frequently Asked Questions
          </h1>
          <p className="text-xs sm:text-sm text-dark-brown/70 font-sans leading-relaxed">
            Essential specifications on solid alloy composition, nitrogen laser tolerances, chemical patination recipes, and white-glove installation.
          </p>
        </div>

        {/* Live Search Input */}
        <div className="max-w-xl mx-auto mb-10 relative">
          <Search className="w-4 h-4 text-dark-brown/40 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search inquiries (e.g. wall studs, brass patina, custom dimensions)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 rounded-full border border-[#E0D7C6] bg-white text-dark-brown text-xs sm:text-sm font-sans focus:outline-none focus:border-burgundy focus:ring-1 focus:ring-burgundy transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-dark-brown/50 hover:text-dark-brown"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-12">
          {categories.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setActiveCategory(cat.id);
                setOpenIndex(null);
              }}
              className={`px-4 py-2 rounded-full text-xs font-sans transition-all cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-burgundy text-cream font-semibold shadow-2xs'
                  : 'bg-white border border-[#E8E1D3] text-dark-brown/70 hover:text-dark-brown hover:border-burgundy/40'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Accordion FAQ Items */}
        <div className="bg-white border border-[#E8E1D3] rounded-md divide-y divide-[#EBE4D6] shadow-xs mb-16 overflow-hidden">
          {filteredFaqs.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <p className="font-editorial text-xl text-dark-brown">No matching inquiries found.</p>
              <p className="text-xs text-dark-brown/60 font-sans">
                Try searching with different terms or contact our atelier concierge for bespoke assistance.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('all');
                }}
                className="text-xs text-burgundy font-semibold uppercase tracking-wider underline pt-2"
              >
                Reset Search Filters
              </button>
            </div>
          ) : (
            filteredFaqs.map((faq, idx) => {
              const isOpen = openIndex === idx;
              return (
                <div key={idx} className="transition-colors">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                    className="w-full p-6 text-left flex items-start justify-between gap-4 cursor-pointer hover:bg-cream/30 transition-colors"
                  >
                    <span className="font-editorial text-lg sm:text-xl text-dark-brown font-medium leading-snug">
                      {faq.q}
                    </span>
                    <span className={`w-7 h-7 rounded-full bg-cream flex items-center justify-center shrink-0 border border-[#E0D7C6] transition-transform duration-300 ${isOpen ? 'rotate-180 bg-burgundy text-cream border-burgundy' : 'text-dark-brown'}`}>
                      <ChevronDown className="w-4 h-4" />
                    </span>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-6 pt-1 text-xs sm:text-sm text-dark-brown/75 font-sans leading-relaxed border-t border-[#F4EFE6]/60">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        {/* Still Have Questions Banner */}
        <div className="bg-cream/60 border border-[#E8E1D3] rounded-md p-8 sm:p-10 text-center space-y-4">
          <h3 className="font-editorial text-2xl sm:text-3xl text-dark-brown">
            Still Have Questions Regarding Your Space?
          </h3>
          <p className="text-xs sm:text-sm text-dark-brown/70 font-sans max-w-lg mx-auto leading-relaxed">
            Our atelier engineers and design concierges are available to review room photos, verify wall loads, and recommend optimal finishes.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-4">
            <Link
              to="/contact"
              className="btn-burgundy text-xs uppercase tracking-[0.2em] py-3.5 px-8 font-semibold"
            >
              Message Concierge Studio
            </Link>
            <Link
              to="/customize"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xs border border-[#D5CBB8] bg-white text-xs uppercase tracking-[0.18em] font-sans font-semibold text-dark-brown hover:border-burgundy transition-colors"
            >
              <span>Explore CAD Studio</span>
              <ArrowRight className="w-3.5 h-3.5 text-gold" />
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
