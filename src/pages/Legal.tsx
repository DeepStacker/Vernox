import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { Shield, FileText, Truck, ArrowLeft, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useSeo } from '@/lib/seo';
interface LegalProps {
  defaultTab?: 'privacy' | 'terms' | 'shipping';
}

export default function Legal({ defaultTab = 'privacy' }: LegalProps) {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms' | 'shipping'>(defaultTab);
  useSeo({ title: activeTab === 'terms' ? 'Terms of Service' : activeTab === 'shipping' ? 'Shipping Policy' : 'Privacy Policy', description: 'Legal information for Vernox customers: privacy, terms and shipping policies.' });
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/terms') {
      setActiveTab('terms');
    } else if (location.pathname === '/shipping-returns') {
      setActiveTab('shipping');
    } else if (location.pathname === '/privacy') {
      setActiveTab('privacy');
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-background antialiased font-sans text-foreground">
      <SiteHeader />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-20 w-full">
        {/* Header Breadcrumb */}
        <div className="mb-8 space-y-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-burgundy transition uppercase tracking-wider font-mono"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Atelier</span>
          </Link>
          <h1 className="font-editorial text-4xl sm:text-5xl text-dark-brown font-normal tracking-tight">
            Legal Disclosures & Policies
          </h1>
          <p className="text-xs sm:text-sm text-dark-brown/70 max-w-2xl font-sans leading-relaxed">
            Transparent compliance specifications governing collector privacy, intellectual property, custom laser manufacturing, and white-glove crate logistics.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border/80 mb-10 gap-2 sm:gap-6 overflow-x-auto pb-px">
          {[
            { id: 'privacy', label: 'Privacy Policy', icon: Shield },
            { id: 'terms', label: 'Terms of Service', icon: FileText },
            { id: 'shipping', label: 'Shipping & Returns', icon: Truck },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 py-3 px-3 sm:px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap",
                  isActive
                    ? "border-burgundy text-burgundy"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: PRIVACY POLICY */}
        {activeTab === 'privacy' && (
          <div className="prose prose-neutral max-w-none space-y-8 text-xs sm:text-sm text-dark-brown/85 font-sans leading-relaxed">
            <section className="space-y-3 bg-card border border-border/70 p-6 sm:p-8 rounded-sm">
              <h2 className="font-editorial text-2xl text-dark-brown font-normal mb-1">
                1. Information We Collect
              </h2>
              <p>
                Vernox Atelier collects customer contact information (full name, email address, shipping destination, phone number) when you register an account, place an order, or submit custom architectural design files.
              </p>
              <p>
                <strong>Payment Credentials:</strong> We do not store, process, or transmit raw credit card numbers or CVV codes on our servers. All financial transactions are securely handled by PCI-DSS Level 1 certified payment gateways (Razorpay).
              </p>
              <p>
                <strong>CAD & Custom Artwork:</strong> Vector files, custom dimensions, and reference artwork uploaded to our online studio are used solely for laser kerf toolpathing and fabrication of your commission.
              </p>
            </section>

            <section className="space-y-3 bg-card border border-border/70 p-6 sm:p-8 rounded-sm">
              <h2 className="font-editorial text-2xl text-dark-brown font-normal mb-1">
                2. Data Protection & GDPR / DPDP Compliance
              </h2>
              <p>
                We adhere to strict data minimization principles under the General Data Protection Regulation (GDPR) and the Digital Personal Data Protection Act (DPDP Act, 2023). Collectors possess the unalienable right to:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-dark-brown/80">
                <li>Request an export of all personal data held in our Firestore databases.</li>
                <li>Request rectification of incorrect delivery addresses or contact details.</li>
                <li>Request permanent erasure of your account and design history ("Right to be Forgotten").</li>
              </ul>
              <p className="text-xs text-muted-foreground pt-2">
                To exercise these rights, email our data protection officer at <span className="font-mono text-burgundy font-semibold">privacy@vernoxatelier.com</span>.
              </p>
            </section>

            <section className="space-y-3 bg-card border border-border/70 p-6 sm:p-8 rounded-sm">
              <h2 className="font-editorial text-2xl text-dark-brown font-normal mb-1">
                3. Browser Storage & Cookies
              </h2>
              <p>
                Vernox utilizes browser local storage and session cookies exclusively for essential e-commerce operations: maintaining your active shopping cart (<code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">vernox-cart</code>), caching UI theme preferences, and remembering dismissed introductory animations. We do not sell user behavioral data to third-party ad networks.
              </p>
            </section>
          </div>
        )}

        {/* TAB 2: TERMS OF SERVICE */}
        {activeTab === 'terms' && (
          <div className="prose prose-neutral max-w-none space-y-8 text-xs sm:text-sm text-dark-brown/85 font-sans leading-relaxed">
            <section className="space-y-3 bg-card border border-border/70 p-6 sm:p-8 rounded-sm">
              <h2 className="font-editorial text-2xl text-dark-brown font-normal mb-1">
                1. Atelier Fabrication & Tolerances
              </h2>
              <p>
                Every Vernox artwork is fabricated from solid 3.0mm structural plate (Brass CZ108, Stainless 316L, Cor-Ten Steel, or Mild Steel) cut via industrial nitrogen-assist fibre laser.
              </p>
              <p>
                <strong>Manufacturing Tolerances:</strong> While our laser systems maintain ±0.05mm kerf accuracy, hand-finished satin linishing and chemical oxidation patinas yield natural, micro-textural variations. These nuances are the hallmark of authentic metalcraft and are not defects.
              </p>
            </section>

            <section className="space-y-3 bg-card border border-border/70 p-6 sm:p-8 rounded-sm">
              <h2 className="font-editorial text-2xl text-dark-brown font-normal mb-1">
                2. Order Confirmation & Payment
              </h2>
              <p>
                An order is confirmed only upon successful cryptographic signature verification through our payment gateway. All amounts are payable in full before cutting begins. Invoices itemize base merchandise, freight & crating, and applicable GST/VAT.
              </p>
            </section>

            <section className="space-y-3 bg-card border border-border/70 p-6 sm:p-8 rounded-sm">
              <h2 className="font-editorial text-2xl text-dark-brown font-normal mb-1">
                3. Bespoke Commission Cancellations
              </h2>
              <p>
                Because custom metal art is cut to unique dimensions, bespoke studio commissions may only be cancelled within <strong>24 hours</strong> of order placement. Once raw plate has been laser-pierced, custom commissions become non-cancellable and non-refundable.
              </p>
            </section>

            <section className="space-y-3 bg-card border border-border/70 p-6 sm:p-8 rounded-sm">
              <h2 className="font-editorial text-2xl text-dark-brown font-normal mb-1">
                4. Wall Mounting & Structural Safety
              </h2>
              <p>
                Vernox supplies universal Fischer DuoPower wall anchors and 20–25mm standoff mounting hardware. The collector or interior contractor is responsible for ensuring the target wall structure (drywall, masonry, concrete) is rated to support the weight of solid 3.0mm plate (approximately 24 kg/m²).
              </p>
            </section>
          </div>
        )}

        {/* TAB 3: SHIPPING & RETURNS */}
        {activeTab === 'shipping' && (
          <div className="prose prose-neutral max-w-none space-y-8 text-xs sm:text-sm text-dark-brown/85 font-sans leading-relaxed">
            <section className="space-y-3 bg-card border border-border/70 p-6 sm:p-8 rounded-sm">
              <h2 className="font-editorial text-2xl text-dark-brown font-normal mb-1">
                1. Reinforced Timber Crate Logistics
              </h2>
              <p>
                To eliminate transit warping, every commission is secured within high-density polyethylene routed foam and encased in reinforced Baltic birch timber framing. Every shipment travels with 100% replacement value insurance.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs font-mono">
                <div className="p-3 bg-background border border-border rounded">
                  <div className="text-burgundy font-bold">3 – 5 Days</div>
                  <div className="text-muted-foreground text-[10px]">Europe & UK Transit</div>
                </div>
                <div className="p-3 bg-background border border-border rounded">
                  <div className="text-burgundy font-bold">4 – 7 Days</div>
                  <div className="text-muted-foreground text-[10px]">North America Transit</div>
                </div>
                <div className="p-3 bg-background border border-border rounded">
                  <div className="text-burgundy font-bold">6 – 9 Days</div>
                  <div className="text-muted-foreground text-[10px]">Global White-Glove</div>
                </div>
              </div>
            </section>

            <section className="space-y-3 bg-card border border-border/70 p-6 sm:p-8 rounded-sm">
              <h2 className="font-editorial text-2xl text-dark-brown font-normal mb-1">
                2. 30-Day Gallery Return Guarantee
              </h2>
              <p>
                Standard catalogue masterworks may be returned within 30 days of delivery if they do not achieve harmony in your interior. Pieces must remain in uninstalled condition inside their original timber crate with the Certificate of Authenticity.
              </p>
              <p>
                Upon receipt and optical inspection at our atelier, a 100% refund of the merchandise price will be returned to your original payment method within 5–7 business days.
              </p>
            </section>

            <section className="space-y-3 bg-card border border-border/70 p-6 sm:p-8 rounded-sm">
              <h2 className="font-editorial text-2xl text-dark-brown font-normal mb-1">
                3. Transit Damage Zero-Friction Remake
              </h2>
              <p>
                Should courier impact compromise your crate, photograph the damage within 48 hours of receipt and notify <span className="font-mono text-burgundy font-semibold">concierge@vernoxatelier.com</span>. We will initiate an expedited remake immediately at zero additional expense.
              </p>
            </section>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
