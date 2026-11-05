import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useCatalog } from '@/lib/catalogContext';
import { resolveContact, whatsappLink } from '@/lib/storefront/contact';
import { MobileBottomNav } from '@/components/shop/MobileBottomNav';

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'Shop',
    links: [
      { label: 'All designs', to: '/shop' },
      { label: 'Spiritual & Mandala', to: '/shop?category=spiritual' },
      { label: 'Name plates', to: '/shop?category=nameplates' },
      { label: 'Festive & Gifting', to: '/shop?category=festive' },
      { label: 'Design your own', to: '/studio' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Track order', to: '/track-order' },
      { label: 'Shipping & delivery', to: '/shipping' },
      { label: 'Returns & replacement', to: '/returns' },
      { label: 'FAQs', to: '/faqs' },
      { label: 'Contact us', to: '/contact' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Vernox', to: '/about' },
      { label: 'Corporate & bulk orders', to: '/trade' },
      { label: 'Privacy policy', to: '/privacy' },
      { label: 'Terms of sale', to: '/terms' },
    ],
  },
];

const PAYMENT_METHODS = ['UPI', 'Cards', 'Net banking', 'Wallets', 'COD*'];

export function SiteFooter() {
  const { storeConfig } = useCatalog();
  const contact = resolveContact(storeConfig);
  const wa = whatsappLink(contact, 'Hi Vernox, I need help with my order.');

  return (
    <>
      <footer className="mt-16 border-t border-border bg-secondary pb-safe-nav lg:pb-0">
        <div className="container grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="space-y-3">
            <span className="font-brand text-2xl">Vernox</span>
            <p className="max-w-xs text-sm text-muted-foreground">
              Laser-cut metal wall art, made to order in India. Delivered across the country.
            </p>
            <ul className="space-y-1 text-sm">
              <li>{contact.email}</li>
              <li>{contact.phone}</li>
              <li className="text-muted-foreground">{contact.hours}</li>
            </ul>
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-2 py-2">
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> Chat on WhatsApp
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">WhatsApp: [number to be added in store settings]</p>
            )}
          </div>

          {COLUMNS.map(col => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="eyebrow mb-3 font-sans">{col.title}</h2>
              <ul className="space-y-2">
                {col.links.map(l => (
                  <li key={l.to}><Link to={l.to} className="text-sm text-foreground hover:text-burgundy hover:underline">{l.label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="border-t border-border">
          <div className="container flex flex-col gap-3 py-5 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2" aria-label="Payment methods accepted">
              {PAYMENT_METHODS.map(m => <span key={m} className="rounded border border-border bg-card px-2 py-1 font-medium text-foreground">{m}</span>)}
              <span>*COD on ready designs only</span>
            </div>
            <p>Secure payments · Made in India · GSTIN: [to be added]</p>
            <p>© {new Date().getFullYear()} Vernox. All rights reserved.</p>
          </div>
        </div>
      </footer>
      <MobileBottomNav />
    </>
  );
}
