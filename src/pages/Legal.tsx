import { Link } from 'react-router-dom';
import { BusinessDetails } from '@/components/shop/BusinessDetails';
import { ContentPage, DraftNote, Section } from '@/components/shop/ContentPage';
import { useCatalog } from '@/lib/catalogContext';
import { useSeo } from '@/lib/seo';

interface LegalProps {
  defaultTab?: 'privacy' | 'terms';
}

const DRAFT = 'Fill Settings → Seller and the grievance officer; the details below appear automatically. Have counsel review once before launch.';
const link = 'font-semibold text-burgundy hover:underline';

// Written to the Digital Personal Data Protection Act, 2023 and DPDP Rules, 2025 (notice: what, why, rights, grievance contact).
function Privacy() {
  return (
    <>
      <DraftNote>{DRAFT}</DraftNote>
      <Section title="What we collect">
        <ul>
          <li>Name, email, phone and delivery address, to make and deliver your order.</li>
          <li>Designs, photos and wall measurements you upload, used only for your order or consultation.</li>
          <li>Order and payment status. Card, UPI and bank details stay with our payment partner, Razorpay; we never see or store them.</li>
          <li>Basic usage data (pages viewed, device type) to keep the site working and improve it. No advertising trackers.</li>
        </ul>
      </Section>
      <Section title="Why we use it">
        <p>To fulfil your order, give support, send order updates, issue GST invoices and prevent fraud. Marketing emails only if you opt in, and you can unsubscribe any time. We never sell your data.</p>
      </Section>
      <Section title="Who we share it with">
        <p>Only what each needs: Razorpay (payments), our courier partners via Shiprocket (delivery), email and SMS providers (order updates) and Google Firebase (hosting, in India). Authorities only when the law requires.</p>
      </Section>
      <Section title="How long we keep it">
        <p>Account data while your account is open. Designs and wall photos as long as needed for your order, reorders and warranty claims, or until you ask us to delete them. Invoices and order records for 8 years, as GST law requires.</p>
      </Section>
      <Section title="Your rights">
        <p>You may ask to see, correct or erase your data, withdraw consent, or name someone to act for you. Write to the grievance officer below; we reply within 30 days. If you are not satisfied you may complain to the Data Protection Board of India.</p>
      </Section>
      <Section title="Children">
        <p>Accounts are for adults (18+). We do not knowingly collect children's data.</p>
      </Section>
      <Section title="Contact">
        <BusinessDetails />
      </Section>
    </>
  );
}

function Terms() {
  const { storeConfig } = useCatalog();
  return (
    <>
      <DraftNote>{DRAFT}</DraftNote>
      <Section title="Who you buy from">
        <BusinessDetails />
        <p>All pieces are designed and made in India.</p>
      </Section>
      <Section title="Prices and payment">
        <p>Prices are in rupees and exclude GST. GST, shipping and any cash-on-delivery fee are shown before you pay. Pay by UPI, card, net banking or wallet through Razorpay; cash on delivery is available on ready designs{storeConfig.codMaxOrderValue ? ` up to ₹${storeConfig.codMaxOrderValue.toLocaleString('en-IN')}` : ''}.</p>
      </Section>
      <Section title="Made to order">
        <p>Every piece is cut for you, so small variations in finish are part of the craft, and colours may differ slightly from your screen. For custom pieces you confirm you have the right to use any artwork, logo or text you upload; we may decline designs that infringe rights or break the law.</p>
      </Section>
      <Section title="Cancellations">
        <p>Cancel from your account until production starts, for a full refund. Custom pieces cannot be cancelled once cutting begins.</p>
      </Section>
      <Section title="Delivery, returns and refunds">
        <p>See <Link to="/shipping" className={link}>Shipping</Link> and <Link to="/returns" className={link}>Returns</Link>.</p>
      </Section>
      <Section title="Complaints">
        <p>Write to the grievance officer above. We acknowledge within 48 hours and resolve within one month. You may also approach the National Consumer Helpline (1915) or the consumer commission.</p>
      </Section>
      <Section title="Governing law">
        <p>Indian law applies, including the Consumer Protection Act, 2019. Courts at the seller's registered place of business have jurisdiction, without limiting your rights as a consumer.</p>
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
