import { Link } from 'react-router-dom';
import { ContentPage, DraftNote, Section } from '@/components/shop/ContentPage';
import { useSeo } from '@/lib/seo';

interface LegalProps {
  defaultTab?: 'privacy' | 'terms';
}

const DRAFT = 'Draft for UAT. Have this reviewed by a legal advisor and complete the items in [brackets] (legal entity name, registered address, GSTIN, grievance officer) before launch.';

function Privacy() {
  return (
    <>
      <DraftNote>{DRAFT}</DraftNote>
      <Section title="What we collect">
        <ul>
          <li>Details you give us at checkout or in a form: name, email, phone and delivery address.</li>
          <li>Designs and files you upload in the Studio, used only to make your order.</li>
          <li>Order and payment status. Card and UPI details are handled by our payment partner and are not stored by us.</li>
          <li>Basic site usage to keep the store working and improve it.</li>
        </ul>
      </Section>
      <Section title="How we use it">
        <p>To make and deliver your order, send order updates, give support, meet tax and legal duties, and prevent fraud. We do not sell your data.</p>
      </Section>
      <Section title="Who we share it with">
        <p>Payment, courier and notification providers, only as needed to complete your order, and authorities when the law requires it.</p>
      </Section>
      <Section title="Your choices">
        <p>You can ask to see, correct or delete your data by contacting us. Some records, like tax invoices, we must keep for the period the law requires.</p>
      </Section>
      <Section title="Grievance contact">
        <p>[Grievance officer name and email]. See the <Link to="/contact" className="font-semibold text-burgundy hover:underline">Contact page</Link>.</p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <DraftNote>{DRAFT}</DraftNote>
      <Section title="About these terms">
        <p>These terms apply to orders placed on this website with [Legal entity name], [Registered address], GSTIN [to be added].</p>
      </Section>
      <Section title="Prices and tax">
        <p>Prices are in Indian rupees and exclude GST unless stated. GST and any shipping fee are added at checkout and shown before payment.</p>
      </Section>
      <Section title="Made-to-order products">
        <p>Pieces are made after you order. Colours and finishes on screens may differ slightly from the metal. Custom Studio pieces are made from the design you approve, and you are responsible for the right to use any artwork, logo or text you upload.</p>
      </Section>
      <Section title="Payment, shipping and returns">
        <p>See <Link to="/shipping" className="font-semibold text-burgundy hover:underline">Shipping &amp; delivery</Link> and <Link to="/returns" className="font-semibold text-burgundy hover:underline">Returns &amp; replacement</Link>. Cash on delivery is available on ready designs only.</p>
      </Section>
      <Section title="Governing law">
        <p>These terms are governed by the laws of India. Courts at [City] have jurisdiction.</p>
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
      <p className="text-sm text-muted-foreground">
        {isTerms ? <Link to="/privacy" className="hover:underline">Read the privacy policy</Link> : <Link to="/terms" className="hover:underline">Read the terms of sale</Link>}
      </p>
    </ContentPage>
  );
}
