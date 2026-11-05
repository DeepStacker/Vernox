import { Link } from 'react-router-dom';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { useCatalog } from '@/lib/catalogContext';
import { 
  Truck, 
  ShieldCheck, 
  Package, 
  Clock, 
  Globe2, 
  MapPin, 
  HelpCircle,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Compass
} from 'lucide-react';

import { useSeo } from '@/lib/seo';
export default function Shipping() {
  useSeo({ title: 'Shipping', description: 'Production time, delivery across India and shipping charges for Vernox metal wall art.', canonicalPath: '/shipping' });
  const { storeConfig } = useCatalog();
  const currencySymbol = (storeConfig?.currency && storeConfig.currency !== '$') ? storeConfig.currency : '₹';
  const threshold = storeConfig?.freeShippingThreshold || 150;
  return (
    <div className="min-h-screen flex flex-col bg-cream text-dark-brown selection:bg-burgundy selection:text-cream">
      <SiteHeader />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-20">
        {/* Editorial Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3 mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-burgundy/10 text-burgundy text-[10px] uppercase tracking-[0.24em] font-sans font-semibold">
            <Truck className="w-3.5 h-3.5 text-gold" />
            <span>Atelier Logistics & Freight</span>
          </div>
          <h1 className="font-editorial text-3xl sm:text-5xl text-dark-brown font-normal tracking-wide">
            Shipping & White-Glove Crating
          </h1>
          <p className="text-xs sm:text-sm text-dark-brown/70 font-sans leading-relaxed">
            Every architectural artwork is manufactured from solid structural plate and protected inside custom zero-deflection timber crates to guarantee pristine arrival worldwide.
          </p>
        </div>

        {/* 3 Core Logistics Commitments */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="p-6 bg-white border border-[#E8E1D3] rounded-md space-y-2.5">
            <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-gold" />
            </div>
            <h3 className="font-editorial text-xl text-dark-brown">Full Transit Insurance</h3>
            <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
              Every shipment is fully insured for 100% of declared invoice value against transit impact, accidental deflection, or carrier mishandling.
            </p>
          </div>

          <div className="p-6 bg-white border border-[#E8E1D3] rounded-md space-y-2.5">
            <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center">
              <Package className="w-5 h-5 text-gold" />
            </div>
            <h3 className="font-editorial text-xl text-dark-brown">Reinforced Protective Crates</h3>
            <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
              Large statement pieces are secured to rigid backboards and enclosed in protective crates with shock-absorbing corner reinforcement.
            </p>
          </div>

          <div className="p-6 bg-white border border-[#E8E1D3] rounded-md space-y-2.5">
            <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center">
              <Globe2 className="w-5 h-5 text-gold" />
            </div>
            <h3 className="font-editorial text-xl text-dark-brown">Insured Freight Logistics</h3>
            <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
              Dispatched with tracked courier services with door-to-door status updates and signature required upon delivery.
            </p>
          </div>
        </div>

        {/* Dispatch & Production Timelines */}
        <div className="bg-white border border-[#E8E1D3] rounded-md p-6 sm:p-10 shadow-xs space-y-8 mb-12">
          <div className="border-b border-[#EBE4D6] pb-4">
            <h2 className="font-editorial text-2xl sm:text-3xl text-dark-brown">
              Production & Dispatch Lead Times
            </h2>
            <p className="text-xs text-dark-brown/60 font-sans mt-1">
              Because each piece undergoes dynamic kerf calculation, nitrogen laser cutting, and manual chemical patination, fabrication lead times vary by product classification:
            </p>
          </div>

          <div className="space-y-6 text-xs sm:text-sm font-sans text-dark-brown/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-sm bg-cream/40 border border-[#E8E1D3] gap-2">
              <div>
                <strong className="text-dark-brown block text-sm font-editorial">Curated Catalog Editions (Standard Sizes)</strong>
                <span className="text-xs text-dark-brown/60">Ember Frame, Abstract Horizon, Golden Silence, Maroon Geometry</span>
              </div>
              <div className="text-right sm:text-right shrink-0">
                <span className="font-mono font-bold text-burgundy">3 – 5 Business Days</span>
                <span className="text-[10px] text-dark-brown/50 block">Prior to crate dispatch</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-sm bg-cream/40 border border-[#E8E1D3] gap-2">
              <div>
                <strong className="text-dark-brown block text-sm font-editorial">Custom Atelier Crafting Studio (User CAD/Vector Commissions)</strong>
                <span className="text-xs text-dark-brown/60">Bespoke dimensions, personalized monograms, custom SVG imports</span>
              </div>
              <div className="text-right sm:text-right shrink-0">
                <span className="font-mono font-bold text-burgundy">5 – 8 Business Days</span>
                <span className="text-[10px] text-dark-brown/50 block">Requires custom toolpath proofing</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-sm bg-cream/40 border border-[#E8E1D3] gap-2">
              <div>
                <strong className="text-dark-brown block text-sm font-editorial">Architectural B2B & Trade Orders (&gt;10 Units)</strong>
                <span className="text-xs text-dark-brown/60">Hotels, commercial buildings, corporate campuses</span>
              </div>
              <div className="text-right sm:text-right shrink-0">
                <span className="font-mono font-bold text-burgundy">2 – 3 Weeks</span>
                <span className="text-[10px] text-dark-brown/50 block">Batch finishing & palletization</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#EBE4D6]">
            <h3 className="font-editorial text-xl text-dark-brown mb-3">Freight Transit Durations</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-sans">
              <div className="p-3.5 bg-cream/30 rounded-xs border border-[#E8E1D3]">
                <strong className="text-dark-brown block font-semibold">Domestic India Express</strong>
                <span className="text-dark-brown/70 mt-1 block">2 – 4 Business Days</span>
                <span className="text-[10px] text-dark-brown/50 block mt-0.5">Complimentary over {currencySymbol}{threshold}</span>
              </div>
              <div className="p-3.5 bg-cream/30 rounded-xs border border-[#E8E1D3]">
                <strong className="text-dark-brown block font-semibold">Europe & UK Air Courier</strong>
                <span className="text-dark-brown/70 mt-1 block">3 – 5 Business Days</span>
                <span className="text-[10px] text-dark-brown/50 block mt-0.5">DHL Express Air Priority</span>
              </div>
              <div className="p-3.5 bg-cream/30 rounded-xs border border-[#E8E1D3]">
                <strong className="text-dark-brown block font-semibold">North America & Rest of World</strong>
                <span className="text-dark-brown/70 mt-1 block">4 – 7 Business Days</span>
                <span className="text-[10px] text-dark-brown/50 block mt-0.5">Door-to-door tracked freight</span>
              </div>
            </div>
          </div>
        </div>

        {/* Uncrating & Handling Recommendations */}
        <div className="bg-white border border-[#E8E1D3] rounded-md p-6 sm:p-10 shadow-xs space-y-6 mb-12">
          <h2 className="font-editorial text-2xl sm:text-3xl text-dark-brown">
            Uncrating & White-Glove Installation Guidelines
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm font-sans text-dark-brown/80">
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-semibold text-dark-brown">
                <CheckCircle2 className="w-4 h-4 text-gold" />
                <span>Inspection upon Delivery</span>
              </div>
              <p className="text-xs text-dark-brown/70 leading-relaxed pl-6">
                Please inspect the timber crate exterior before signing the delivery manifest. If shock-watch indicators show red or the crate exhibits puncture damage, photograph the crate immediately and notify the courier driver.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 font-semibold text-dark-brown">
                <CheckCircle2 className="w-4 h-4 text-gold" />
                <span>Included Standoff Hardware</span>
              </div>
              <p className="text-xs text-dark-brown/70 leading-relaxed pl-6">
                All wall reliefs arrive with precision stainless or brass standoff barrels, high-load drywall wall anchors, and a 1:1 scale paper template to ensure effortless, level mounting.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Action Banner */}
        <div className="bg-cream/70 border border-burgundy/20 rounded-md p-8 text-center space-y-4">
          <h3 className="font-editorial text-2xl text-dark-brown">Have an Active Commission on the Way?</h3>
          <p className="text-xs text-dark-brown/70 font-sans max-w-md mx-auto">
            Check live nesting, laser slicing, and courier dispatch milestones through our secure tracking portal.
          </p>
          <div className="pt-2">
            <Link
              to="/track-order"
              className="btn-burgundy text-xs uppercase tracking-[0.2em] py-3.5 px-8 font-semibold inline-flex items-center gap-2"
            >
              <span>Track Active Order</span>
              <ArrowRight className="w-4 h-4 text-gold" />
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
