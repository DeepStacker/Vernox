import { Link } from 'react-router-dom';
import { ContentPage, Section } from '@/components/shop/ContentPage';
import { useCatalog } from '@/lib/catalogContext';
import { useSeo } from '@/lib/seo';

const link = 'font-semibold text-burgundy hover:underline';

export default function Returns() {
  useSeo({ title: 'Returns & Refunds', description: 'Returns, replacements and refunds for Vernox metal wall art.' });
  const { storeConfig } = useCatalog();
  const days = storeConfig.returnWindowDays ?? 7;
  return (
    <ContentPage title="Returns" intro="Each piece is made for you, so we focus on getting it right.">
      <Section title="Damaged or wrong item">
        <ul>
          <li>Report it with photos (an unboxing video helps) within 48 hours of delivery.</li>
          <li>We replace it free, or refund in full if you prefer.</li>
        </ul>
      </Section>
      <Section title="Changed your mind">
        <ul>
          <li>Ready designs: return within {days} days of delivery, unused and in the original packing.</li>
          <li>We confirm how to send it back. The original shipping charge is not refunded.</li>
        </ul>
      </Section>
      <Section title="Custom pieces">
        <p>Made from your own design, so they can be returned only if damaged, defective or the wrong item.</p>
      </Section>
      <Section title="Refunds">
        <ul>
          <li>Started within 2 working days of approval, or of the return passing our check.</li>
          <li>Prepaid orders go back to the original payment method, usually in 5 to 7 working days.</li>
          <li>Cash-on-delivery orders are refunded to your bank account or UPI.</li>
        </ul>
      </Section>
      <p className="text-muted-foreground">Start a request from <Link to="/account" className={link}>your orders</Link> or <Link to="/contact" className={link}>contact us</Link>.</p>
    </ContentPage>
  );
}
