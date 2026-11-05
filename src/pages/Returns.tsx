import { Link } from 'react-router-dom';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { 
  RotateCcw, 
  ShieldCheck, 
  CheckCircle2, 
  HelpCircle, 
  Package, 
  Mail, 
  PhoneCall,
  Clock,
  ArrowRight
} from 'lucide-react';

import { useSeo } from '@/lib/seo';
export default function Returns() {
  useSeo({ title: 'Returns & Refunds', description: 'Vernox returns, replacement and refund policy for made-to-order metal wall art.', canonicalPath: '/returns' });
  return (
    <div className="min-h-screen flex flex-col bg-cream text-dark-brown selection:bg-burgundy selection:text-cream">
      <SiteHeader />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-20">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3 mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-burgundy/10 text-burgundy text-[10px] uppercase tracking-[0.24em] font-sans font-semibold">
            <RotateCcw className="w-3.5 h-3.5 text-gold" />
            <span>Collector Satisfaction Assurance</span>
          </div>
          <h1 className="font-editorial text-3xl sm:text-5xl text-dark-brown font-normal tracking-wide">
            Returns, Exchanges & Warranties
          </h1>
          <p className="text-xs sm:text-sm text-dark-brown/70 font-sans leading-relaxed">
            We want you to experience our architectural masterworks in your living or working environment with complete confidence.
          </p>
        </div>

        {/* 3 Pillars of Returns Policy */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="p-6 bg-white border border-[#E8E1D3] rounded-md space-y-2.5">
            <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center">
              <Clock className="w-5 h-5 text-gold" />
            </div>
            <h3 className="font-editorial text-xl text-dark-brown">30-Day In-Situ Trial</h3>
            <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
              Standard catalogue editions can be returned within 30 days of delivery in their original timber crate for a full refund or atelier exchange.
            </p>
          </div>

          <div className="p-6 bg-white border border-[#E8E1D3] rounded-md space-y-2.5">
            <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-gold" />
            </div>
            <h3 className="font-editorial text-xl text-dark-brown">Transit Protection Guarantee</h3>
            <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
              In the unlikely event of courier transit damage or alloy deflection, we immediately recut and express-ship a replacement at zero expense.
            </p>
          </div>

          <div className="p-6 bg-white border border-[#E8E1D3] rounded-md space-y-2.5">
            <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center">
              <Package className="w-5 h-5 text-gold" />
            </div>
            <h3 className="font-editorial text-xl text-dark-brown">Complimentary Pickup</h3>
            <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
              Our logistics team schedules an insured courier pickup directly from your doorstep with pre-printed return labels and timber crate seals.
            </p>
          </div>
        </div>

        {/* Detailed Guidelines */}
        <div className="bg-white border border-[#E8E1D3] rounded-md p-6 sm:p-10 shadow-xs space-y-8 mb-12">
          <div className="border-b border-[#EBE4D6] pb-4">
            <h2 className="font-editorial text-2xl sm:text-3xl text-dark-brown">
              Policy Specifics by Piece Classification
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs sm:text-sm font-sans text-dark-brown/80">
            <div className="p-5 bg-cream/40 rounded-sm border border-[#E8E1D3] space-y-2.5">
              <h3 className="font-editorial text-xl text-dark-brown font-semibold">Standard Catalog Artworks</h3>
              <p className="text-xs text-dark-brown/70 leading-relaxed">
                Eligible for full refund or exchange within 30 days of physical delivery. Artworks must be undamaged, unmounted with silicone/glue, and safely repackaged in the protective timber crate with all mounting standoffs.
              </p>
              <ul className="text-xs space-y-1 text-dark-brown/70 pt-2">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-gold shrink-0" />
                  <span>Full refund processed to original payment method</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-gold shrink-0" />
                  <span>No restocking fee for standard returns</span>
                </li>
              </ul>
            </div>

            <div className="p-5 bg-cream/40 rounded-sm border border-[#E8E1D3] space-y-2.5">
              <h3 className="font-editorial text-xl text-dark-brown font-semibold">Bespoke CAD & Custom Studio Pieces</h3>
              <p className="text-xs text-dark-brown/70 leading-relaxed">
                Pieces fabricated with custom non-standard dimensions, personalized crests, custom monogram laser paths, or unique architectural CAD nesting cannot be resold and are exempt from discretionary change-of-mind returns.
              </p>
              <ul className="text-xs space-y-1 text-dark-brown/70 pt-2">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-gold shrink-0" />
                  <span>Lifetime structural alloy integrity guarantee</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-gold shrink-0" />
                  <span>Instant remanufacture if cut out of geometric spec</span>
                </li>
              </ul>
            </div>
          </div>

          {/* 4-Step Return Process */}
          <div className="pt-6 border-t border-[#EBE4D6]">
            <h3 className="font-editorial text-xl text-dark-brown mb-6">The 4-Step Return & Replacement Process</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-sans">
              <div className="p-4 bg-cream/30 rounded-xs border border-[#E8E1D3] space-y-1.5">
                <span className="font-mono font-bold text-burgundy text-xs">01. INITIATION</span>
                <strong className="block text-dark-brown">Contact Concierge</strong>
                <p className="text-[11px] text-dark-brown/60">
                  Email concierge@vernoxatelier.com with your order reference and return reason.
                </p>
              </div>

              <div className="p-4 bg-cream/30 rounded-xs border border-[#E8E1D3] space-y-1.5">
                <span className="font-mono font-bold text-burgundy text-xs">02. PACKAGING</span>
                <strong className="block text-dark-brown">Crate Artwork</strong>
                <p className="text-[11px] text-dark-brown/60">
                  Place the artwork back inside the Belgian tissue and foam-lined timber crate.
                </p>
              </div>

              <div className="p-4 bg-cream/30 rounded-xs border border-[#E8E1D3] space-y-1.5">
                <span className="font-mono font-bold text-burgundy text-xs">03. COURIER</span>
                <strong className="block text-dark-brown">Curbside Pickup</strong>
                <p className="text-[11px] text-dark-brown/60">
                  Our DHL/FedEx courier collects the crate from your home or studio on your schedule.
                </p>
              </div>

              <div className="p-4 bg-cream/30 rounded-xs border border-[#E8E1D3] space-y-1.5">
                <span className="font-mono font-bold text-burgundy text-xs">04. RESOLUTION</span>
                <strong className="block text-dark-brown">Refund or Remake</strong>
                <p className="text-[11px] text-dark-brown/60">
                  Refund issued within 3 business days of atelier receipt, or replacement dispatched.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Concierge Support */}
        <div className="bg-white border border-[#E8E1D3] rounded-md p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-burgundy/10 text-burgundy mx-auto flex items-center justify-center">
            <Mail className="w-6 h-6 text-gold" />
          </div>
          <h3 className="font-editorial text-2xl text-dark-brown">Need Assistance with a Return or Damaged Item?</h3>
          <p className="text-xs text-dark-brown/70 font-sans max-w-md mx-auto">
            Our atelier concierge responds directly within 24 business hours to arrange immediate pickup or replacement cutting.
          </p>
          <div className="pt-2 flex justify-center gap-4">
            <Link
              to="/contact"
              className="btn-burgundy text-xs uppercase tracking-[0.2em] py-3.5 px-8 font-semibold"
            >
              Contact Support Concierge
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
