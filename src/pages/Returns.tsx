import { Link } from 'react-router-dom';
import { ContentPage, DraftNote, Section } from '@/components/shop/ContentPage';
import { useSeo } from '@/lib/seo';

export default function Returns() {
  useSeo({ title: 'Returns & Replacement', description: 'What to do if your Vernox metal wall art arrives damaged or is not what you ordered.' });
  return (
    <ContentPage title="Returns & replacement" intro="Each piece is made for you, so our policy is built around getting you a piece that is right.">
      <DraftNote>Draft policy for UAT. Owner and legal advisor to confirm the windows below before launch.</DraftNote>

      <Section title="Damaged in transit">
        <ul>
          <li>Record an unboxing video if you can, and send us photos within 48 hours of delivery [confirm].</li>
          <li>We arrange a free replacement. You do not need to pay again.</li>
        </ul>
      </Section>

      <Section title="Wrong item or manufacturing defect">
        <p>If the piece differs from your order or has a defect, contact us within 7 days [confirm] and we will repair, replace or refund.</p>
      </Section>

      <Section title="Custom Studio pieces">
        <p>Pieces made from your own design, name or logo cannot be returned unless they arrive damaged or defective, because they cannot be resold.</p>
      </Section>

      <Section title="Change of mind on ready designs">
        <p>[Owner to decide: return window and who pays return shipping for unused ready designs.]</p>
      </Section>

      <Section title="Refunds">
        <p>Approved refunds go back to the original payment method. For cash on delivery orders we will ask for bank or UPI details. Timelines: [confirm].</p>
      </Section>

      <Link to="/contact" className="btn-primary">Contact us about an order</Link>
    </ContentPage>
  );
}
