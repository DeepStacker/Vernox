import { ContentPage, DraftNote, Section } from '@/components/shop/ContentPage';
import { useCatalog } from '@/lib/catalogContext';
import { useSeo } from '@/lib/seo';
import { formatINR } from '@/lib/storefront/format';

export default function Shipping() {
  useSeo({ title: 'Shipping & Delivery', description: 'Shipping charges, free shipping threshold, dispatch time and delivery across India for Vernox metal wall art.' });
  const { storeConfig } = useCatalog();
  return (
    <ContentPage title="Shipping" intro="We deliver across India.">
      <DraftNote>Confirm courier transit times and custom-piece lead time, then add them under "How long it takes".</DraftNote>
      <Section title="Charges">
        <ul>
          <li>Free above {formatINR(storeConfig.freeShippingThreshold)}.</li>
          <li>Otherwise a flat {formatINR(storeConfig.shippingFee)}.</li>
        </ul>
      </Section>
      <Section title="How long it takes">
        <ul>
          <li>Ready designs are made in 5 to 9 working days, plus delivery.</li>
          <li>Enter your PIN code on a product page for an estimate.</li>
        </ul>
      </Section>
      <Section title="Cash on delivery">
        <p>Available on ready designs. Custom pieces are prepaid.</p>
      </Section>
      <Section title="Tracking">
        <p>Use Track order with your order number and email.</p>
      </Section>
    </ContentPage>
  );
}
