import { Link } from 'react-router-dom';
import { ContentPage, DraftNote, Section } from '@/components/shop/ContentPage';
import { useSeo } from '@/lib/seo';

export default function Returns() {
  useSeo({ title: 'Returns & Replacement', description: 'What to do if your Vernox metal wall art arrives damaged or is not what you ordered.' });
  return (
    <ContentPage title="Returns" intro="Each piece is made for you, so we focus on getting it right.">
      <DraftNote>Confirm the damage-report window and the change-of-mind return policy and refund timelines, then add them below.</DraftNote>
      <Section title="Damaged or wrong item">
        <ul>
          <li>Send photos within 48 hours of delivery.</li>
          <li>We replace it at no cost.</li>
        </ul>
      </Section>
      <Section title="Custom pieces">
        <p>Made from your own design, so returns are only for damage or defects.</p>
      </Section>
      <Section title="Refunds">
        <p>Approved refunds go to the original payment method.</p>
      </Section>
      <p className="text-muted-foreground">Start a request from <Link to="/account" className="font-semibold text-burgundy hover:underline">your orders</Link> or <Link to="/contact" className="font-semibold text-burgundy hover:underline">contact us</Link>.</p>
    </ContentPage>
  );
}
