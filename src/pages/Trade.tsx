import { useState } from 'react';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { 
  Building2, 
  Briefcase, 
  FileCode2, 
  Award, 
  ShieldCheck, 
  Send, 
  CheckCircle2, 
  Phone, 
  Mail, 
  ArrowRight,
  Layers,
  Sparkles,
  Download
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { AtelierSelect } from '@/components/ui/select';

export default function Trade() {
  const [formData, setFormData] = useState({
    firmName: '',
    contactName: '',
    email: '',
    phone: '',
    projectType: 'hospitality',
    estimatedQuantity: '10-50 units',
    estimatedBudget: '₹50,000 - ₹150,000',
    timeline: '1-3 months',
    notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firmName || !formData.email || !formData.contactName) {
      toast.error('Please complete all required fields (Firm Name, Contact, Email).');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      toast.success('Trade inquiry received. Our team will review your project brief and follow up promptly.');
    }, 600);
  };

  const sectors = [
    {
      title: 'Luxury Hospitality & Resorts',
      desc: 'Guest suite monograms, elevator bank wayfinding, private dining lattice screens, and dramatic reception lobby sculptural reliefs.',
      badge: 'Hotels & Private Clubs',
      scale: '25 – 350 Units',
    },
    {
      title: 'Corporate Headquarters & Tech Campuses',
      desc: 'Precision laser-cut corporate brand crests, acoustic metal overlays, executive boardroom accents, and architectural landmark signage.',
      badge: 'Enterprise HQ',
      scale: '10 – 120 Units',
    },
    {
      title: 'Residential & Commercial Real Estate',
      desc: 'Bespoke entryway signage, laser-cut balcony privacy grilles, exterior weathering Corten address monuments, and concierge backdrops.',
      badge: 'Developments',
      scale: '20 – 500 Units',
    },
    {
      title: 'Architecture & Interior Design Practices',
      desc: 'Turnkey fabrication partner for bespoke project specs. Direct DWG/DXF/STEP translation with volume discounts and material sample binders.',
      badge: 'Design Studios',
      scale: 'Bespoke Batches',
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-cream text-dark-brown selection:bg-burgundy selection:text-cream">
      <SiteHeader />

      <main className="flex-1 w-full">
        {/* Editorial Trade Hero */}
        <section className="border-b border-[#EBE4D6] py-16 md:py-24 px-4 sm:px-6">
          <div className="max-w-5xl mx-auto text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-burgundy/10 text-burgundy text-[10px] uppercase tracking-[0.24em] font-sans font-semibold">
              <Building2 className="w-3.5 h-3.5 text-gold" />
              <span>Vernox Architectural Trade Program</span>
            </div>
            <h1 className="font-editorial text-4xl sm:text-6xl text-dark-brown font-normal tracking-wide max-w-3xl mx-auto leading-tight">
              Crafted for Architects, Interior Designers & Luxury Hospitality
            </h1>
            <p className="text-sm sm:text-base text-dark-brown/70 font-sans max-w-2xl mx-auto leading-relaxed">
              We partner directly with leading architecture practices and interior studios worldwide—delivering precision laser-cut structural metalwork, bespoke patinas, and tailored project volumes.
            </p>

            <div className="pt-4 flex flex-wrap justify-center gap-4">
              <a
                href="#inquiry-form"
                className="btn-burgundy text-xs uppercase tracking-[0.2em] py-3.5 px-8 font-semibold shadow-sm"
              >
                Submit Trade Application
              </a>
              <button
                type="button"
                onClick={() => toast.info('Trade Spec Sheet & Finishes Binder PDF download initiated.')}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xs border border-[#D5CBB8] bg-white text-xs uppercase tracking-[0.18em] font-sans font-semibold text-dark-brown hover:border-burgundy transition-colors cursor-pointer shadow-2xs"
              >
                <Download className="w-4 h-4 text-gold" />
                <span>Download Trade Catalogue</span>
              </button>
            </div>
          </div>
        </section>

        {/* 4 Pillars of Trade Partnership */}
        <section className="py-16 md:py-20 px-4 sm:px-6 max-w-6xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-12">
            <span className="text-[10px] uppercase tracking-[0.26em] text-gold font-sans font-semibold">
              Privileges & Terms
            </span>
            <h2 className="font-editorial text-3xl sm:text-4xl text-dark-brown mt-1">
              Engineered for Trade Precision
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-md border border-[#E8E1D3] space-y-3 shadow-2xs">
              <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center">
                <Award className="w-5 h-5 text-gold" />
              </div>
              <h3 className="font-editorial text-xl text-dark-brown">Project Trade Pricing</h3>
              <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
                Volume-adjusted commercial pricing across standard collections and custom commissions, tailored to project scope and quantity.
              </p>
            </div>

            <div className="bg-white p-6 rounded-md border border-[#E8E1D3] space-y-3 shadow-2xs">
              <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center">
                <FileCode2 className="w-5 h-5 text-gold" />
              </div>
              <h3 className="font-editorial text-xl text-dark-brown">Direct CAD/CAM Pipeline</h3>
              <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
                Upload your AutoCAD, Rhino, or SolidWorks vector paths directly. Our team performs automated kerf compensation and toolpath proofing.
              </p>
            </div>

            <div className="bg-white p-6 rounded-md border border-[#E8E1D3] space-y-3 shadow-2xs">
              <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center">
                <Layers className="w-5 h-5 text-gold" />
              </div>
              <h3 className="font-editorial text-xl text-dark-brown">Material Sample Box</h3>
              <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
                Request our curated physical swatch folio featuring authentic hand-patinated plates: Brushed Brass, Corten Rust, and Blackened Steel.
              </p>
            </div>

            <div className="bg-white p-6 rounded-md border border-[#E8E1D3] space-y-3 shadow-2xs">
              <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-gold" />
              </div>
              <h3 className="font-editorial text-xl text-dark-brown">Dedicated Project PM</h3>
              <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
                A single metallurgical engineer manages your specifications from nesting simulation to white-glove site delivery and installation hardware.
              </p>
            </div>
          </div>
        </section>

        {/* Sectors Showcase */}
        <section className="bg-white py-16 md:py-24 border-y border-[#EBE4D6]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-xl mx-auto mb-14">
              <span className="text-[10px] uppercase tracking-[0.26em] text-gold font-sans font-semibold">
                Sectors & Applications
              </span>
              <h2 className="font-editorial text-3xl sm:text-4xl text-dark-brown mt-1">
                Where Vernox Architectural Pieces Reside
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {sectors.map((s, idx) => (
                <div key={idx} className="p-8 rounded-md border border-[#E8E1D3] bg-cream/30 space-y-3 hover:border-burgundy/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full bg-burgundy/10 text-burgundy text-[10px] uppercase tracking-[0.16em] font-sans font-semibold">
                      {s.badge}
                    </span>
                    <span className="text-xs font-mono text-dark-brown/60">{s.scale}</span>
                  </div>
                  <h3 className="font-editorial text-2xl text-dark-brown pt-2">{s.title}</h3>
                  <p className="text-xs sm:text-sm text-dark-brown/70 font-sans leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trade Application & Inquiry Form */}
        <section id="inquiry-form" className="py-16 md:py-24 px-4 sm:px-6 max-w-4xl mx-auto">
          <div className="bg-white border border-[#E8E1D3] rounded-md p-8 md:p-12 shadow-xs">
            <div className="text-center max-w-lg mx-auto mb-10 space-y-2">
              <span className="text-[10px] uppercase tracking-[0.26em] text-gold font-sans font-semibold">
                Apply for Trade Account
              </span>
              <h2 className="font-editorial text-3xl sm:text-4xl text-dark-brown">
                Initiate Your Trade Partnership
              </h2>
              <p className="text-xs text-dark-brown/70 font-sans leading-relaxed">
                Complete the brief below to receive wholesale pricing credentials, sample folios, and our trade engineering catalogue.
              </p>
            </div>

            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-8 text-center bg-cream/50 rounded-sm border border-burgundy/20 space-y-4"
              >
                <div className="w-14 h-14 rounded-full bg-burgundy/10 text-burgundy mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-gold" />
                </div>
                <h3 className="font-editorial text-2xl text-dark-brown">Application Received</h3>
                <p className="text-xs text-dark-brown/70 font-sans max-w-md mx-auto leading-relaxed">
                  Thank you, {formData.contactName}. Our architectural concierge team has received the specifications for {formData.firmName}. You will receive trade access details and a dedicated concierge introduction within 24 hours.
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="btn-burgundy text-xs uppercase tracking-[0.18em] py-3 px-6 font-semibold"
                >
                  Submit Another Project Inquiry
                </button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                      Design Studio / Firm Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Studio Kallos Interiors"
                      value={formData.firmName}
                      onChange={e => setFormData({ ...formData, firmName: e.target.value })}
                      className="w-full px-4 py-3 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:outline-none focus:border-burgundy focus:ring-1 focus:ring-burgundy transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                      Contact Name & Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Elena Vance, Senior Architect"
                      value={formData.contactName}
                      onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                      className="w-full px-4 py-3 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:outline-none focus:border-burgundy focus:ring-1 focus:ring-burgundy transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                      Professional Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="elena@studiokallos.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:outline-none focus:border-burgundy focus:ring-1 focus:ring-burgundy transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                      Direct Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="+1 (555) 019-2834"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-3 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:outline-none focus:border-burgundy focus:ring-1 focus:ring-burgundy transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                      Project Type
                    </label>
                    <AtelierSelect
                      value={formData.projectType}
                      onValueChange={val => setFormData({ ...formData, projectType: val })}
                      className="w-full h-11 px-3.5 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:border-burgundy focus:ring-1 focus:ring-burgundy"
                      options={[
                        { value: 'hospitality', label: 'Hospitality / Hotel' },
                        { value: 'residential', label: 'High-End Residential' },
                        { value: 'commercial', label: 'Corporate HQ / Commercial' },
                        { value: 'retail', label: 'Luxury Retail' },
                        { value: 'general_trade', label: 'General Trade Account' },
                      ]}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                      Estimated Volume
                    </label>
                    <AtelierSelect
                      value={formData.estimatedQuantity}
                      onValueChange={val => setFormData({ ...formData, estimatedQuantity: val })}
                      className="w-full h-11 px-3.5 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:border-burgundy focus:ring-1 focus:ring-burgundy"
                      options={[
                        { value: '1-5 units', label: 'Single Spec / 1–5 Units' },
                        { value: '10-50 units', label: '10 – 50 Units (Boutique)' },
                        { value: '50-200 units', label: '50 – 200 Units (Hotel Wing)' },
                        { value: '200+ units', label: '200+ Units (Enterprise Rollout)' },
                      ]}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                      Target Timeline
                    </label>
                    <AtelierSelect
                      value={formData.timeline}
                      onValueChange={val => setFormData({ ...formData, timeline: val })}
                      className="w-full h-11 px-3.5 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:border-burgundy focus:ring-1 focus:ring-burgundy"
                      options={[
                        { value: 'immediate', label: 'Immediate (under 30 days)' },
                        { value: '1-3 months', label: '1 – 3 Months' },
                        { value: '3-6 months', label: '3 – 6 Months' },
                        { value: 'planning', label: 'Concept / Planning Stage' },
                      ]}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                    Project Scope, Desired Finishes or Special Requirements
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Provide details regarding alloy preferences (3.0mm structural steel, solid brass, Corten), custom dimensions, mounting surfaces, or vector files available..."
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-4 py-3 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:outline-none focus:border-burgundy focus:ring-1 focus:ring-burgundy transition-all resize-y"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full btn-burgundy text-xs uppercase tracking-[0.24em] py-4 font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:shadow-md transition-all"
                >
                  {isSubmitting ? (
                    <span>Submitting Application…</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4 text-gold" />
                      <span>Submit Trade Commission Application</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
