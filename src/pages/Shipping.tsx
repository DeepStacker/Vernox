import { ContentPage, DraftNote, Section } from '@/components/shop/ContentPage';
import { useCatalog } from '@/lib/catalogContext';
import { useSeo } from '@/lib/seo';
import { formatINR } from '@/lib/storefront/format';

export default function Shipping() {
  useSeo({ title: 'Shipping & Delivery', description: 'Shipping charges, free shipping threshold, dispatch time and delivery across India for Vernox metal wall art.' });
  const { storeConfig } = useCatalog();
  return (
    <ContentPage title="Shipping & delivery" intro="We deliver across India. Every piece is made to order, so delivery has two parts: making, then shipping.">
      <DraftNote>Courier partner and transit times are being finalised. Figures marked [confirm] are placeholders.</DraftNote>

      <Section title="Shipping charges">
        <ul>
          <li>Free shipping on orders of {formatINR(storeConfig.freeShippingThreshold)} and above (judged on the item total before any coupon).</li>
          <li>Below that, a flat shipping fee of {formatINR(storeConfig.shippingFee)} applies.</li>
          <li>GST is added at checkout and shown before you pay.</li>
        </ul>
      </Section>

      <Section title="How long it takes">
        <ul>
          <li>Ready designs: made and dispatched in about 5 to 9 working days, as shown on each product page.</li>
          <li>Custom Studio pieces: [confirm] working days, shown when you design.</li>
          <li>Transit: [confirm] working days depending on your PIN code. A delivery estimate appears on the product page.</li>
        </ul>
      </Section>

      <Section title="Tracking">
        <p>You get tracking details once your order ships. You can also check your order any time on the Track order page.</p>
      </Section>

      <Section title="Cash on delivery">
        <p>Available on ready designs from the catalogue. Custom Studio pieces are prepaid because they are made only for you.</p>
      </Section>

      <Section title="Packing">
        <p>Pieces are flat-packed in protective foam and a rigid carton so the finish arrives intact. Mounting fittings are included.</p>
      </Section>
    </ContentPage>
  );
}
