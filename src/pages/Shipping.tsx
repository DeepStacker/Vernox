import { ContentPage, Section } from '@/components/shop/ContentPage';
import { useCatalog } from '@/lib/catalogContext';
import { useSeo } from '@/lib/seo';
import { formatINR } from '@/lib/storefront/format';

export default function Shipping() {
  useSeo({ title: 'Shipping & Delivery', description: 'Shipping charges, dispatch time and delivery across India for Vernox metal wall art.' });
  const { storeConfig } = useCatalog();
  const ready = storeConfig.defaultLeadTimeDays ?? 3;
  const custom = storeConfig.customLeadTimeDays ?? 7;
  return (
    <ContentPage title="Shipping" intro="We deliver across India.">
      <Section title="Charges">
        <ul>
          <li>Free above {formatINR(storeConfig.freeShippingThreshold)}; otherwise a flat {formatINR(storeConfig.shippingFee)}.</li>
          {storeConfig.codEnabled !== false && storeConfig.codFee ? <li>Cash on delivery adds {formatINR(storeConfig.codFee)}.</li> : null}
        </ul>
      </Section>
      <Section title="How long it takes">
        <ul>
          <li>Ready designs are dispatched in about {ready} working days, custom pieces in about {custom}.</li>
          <li>Courier delivery usually takes 2 to 6 days more, depending on the PIN code.</li>
          <li>Enter your PIN code on a product page for an estimate.</li>
        </ul>
      </Section>
      <Section title="Packing">
        <p>Every piece is wrapped, corner-protected and boxed, and ships insured with tracking.</p>
      </Section>
      <Section title="Cash on delivery">
        <p>Available on ready designs. Custom pieces are prepaid.</p>
      </Section>
      <Section title="Tracking">
        <p>You get the tracking link by email and SMS. You can also use Track order with your order number and email.</p>
      </Section>
    </ContentPage>
  );
}
