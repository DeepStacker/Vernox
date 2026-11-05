import { Link } from 'react-router-dom';
import { ContentPage, DraftNote, Section } from '@/components/shop/ContentPage';
import { useSeo } from '@/lib/seo';

interface LegalProps {
  defaultTab?: 'privacy' | 'terms';
}

const DRAFT = 'Draft for UAT. Have a legal advisor review it, then add the legal entity name, registered address, GSTIN, governing-court city and grievance officer (name and email) before launch.';

function Privacy() {
  return (
    <>
      <DraftNote>{DRAFT}</DraftNote>
      <Section title="What we collect">
        <ul>
          <li>Name, email, phone and delivery address for your order.</li>
          <li>Designs you upload, used only to make your order.</li>
          <li>Payments are handled by our payment partner; we never store card or UPI details.</li>
        </ul>
      </Section>
      <Section title="How we use it">
        <p>To make and deliver your order, support you, meet tax duties and prevent fraud. We do not sell your data.</p>
      </Section>
      <Section title="Sharing">
        <p>Only with payment and courier partners as needed, and authorities when the law requires.</p>
      </Section>
      <Section title="Your choices">
        <p>Ask us to view, correct or delete your data via <Link to="/contact" className="font-semibold text-burgundy hover:underline">Contact</Link>. Tax invoices must be kept as the law requires.</p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <DraftNote>{DRAFT}</DraftNote>
      <Section title="Prices and tax">
        <p>Prices are in rupees and exclude GST. GST and shipping are shown at checkout before you pay.</p>
      </Section>
      <Section title="Made to order">
        <p>Colours may differ slightly from your screen. For custom pieces you confirm you may use the artwork, logo or text you upload.</p>
      </Section>
      <Section title="Shipping and returns">
        <p>See <Link to="/shipping" className="font-semibold text-burgundy hover:underline">Shipping</Link> and <Link to="/returns" className="font-semibold text-burgundy hover:underline">Returns</Link>.</p>
      </Section>
      <Section title="Governing law">
        <p>Indian law applies.</p>
      </Section>
    </>
  );
}

export default function Legal({ defaultTab = 'privacy' }: LegalProps) {
  const isTerms = defaultTab === 'terms';
  useSeo({
    title: isTerms ? 'Terms of Sale' : 'Privacy Policy',
    description: isTerms ? 'Terms of sale for Vernox orders.' : 'How Vernox collects, uses and protects your personal data.',
    canonicalPath: isTerms ? '/terms' : '/privacy',
  });
  return (
    <ContentPage title={isTerms ? 'Terms of sale' : 'Privacy policy'}>
      {isTerms ? <Terms /> : <Privacy />}
    </ContentPage>
  );
}
