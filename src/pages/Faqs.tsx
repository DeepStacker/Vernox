import { Link } from 'react-router-dom';
import { ContentPage } from '@/components/shop/ContentPage';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useCatalog } from '@/lib/catalogContext';
import { useSeo } from '@/lib/seo';
import { formatINR } from '@/lib/storefront/format';

export default function Faqs() {
  const { storeConfig } = useCatalog();
  const groups: { title: string; items: { q: string; a: string }[] }[] = [
    {
      title: 'Ordering and payment',
      items: [
        { q: 'Which payment methods do you accept?', a: 'UPI, cards and net banking through our secure payment partner. Cash on delivery is available on ready designs.' },
        { q: 'Are prices inclusive of GST?', a: `Prices on the website are before GST. GST (${storeConfig.gstRatePercent}%) is added at checkout and the final amount is shown before you pay.` },
        { q: 'Can I use a coupon?', a: 'Yes. Enter the code in your cart. The discount is confirmed again at checkout.' },
      ],
    },
    {
      title: 'Products and finishes',
      items: [
        { q: 'What are the pieces made of?', a: 'Laser-cut sheet metal, mostly 1.5 mm and 2 mm steel, finished in powder coat, brass, gold, copper, Corten rust or stainless. The exact material is on each product page.' },
        { q: 'Can I hang them outdoors?', a: 'Only designs marked for outdoor use on the product page. Choose Corten Rust, Stainless or Black Powder Coat for balconies and gates.' },
        { q: 'How do I mount it?', a: 'Standoff spacers and screws are included. They hold the piece 2.5 cm from the wall. You need a drill and a spirit level.' },
        { q: 'Can I get a different size or my own design?', a: 'Yes, in the Studio. You can type a name, upload a logo or draw a shape and see the price before ordering.' },
      ],
    },
    {
      title: 'Delivery and returns',
      items: [
        { q: 'How long does delivery take?', a: 'Ready designs are made in about 5 to 9 working days, plus transit time to your PIN code. See Shipping & delivery.' },
        { q: 'Is shipping free?', a: `Yes, on orders of ${formatINR(storeConfig.freeShippingThreshold)} and above. Below that, a flat ${formatINR(storeConfig.shippingFee)} applies.` },
        { q: 'What if my piece arrives damaged?', a: 'Send us photos within 48 hours and we will arrange a replacement. See Returns & replacement.' },
        { q: 'Where is my order?', a: 'Use the Track order page with your order number and email.' },
      ],
    },
    {
      title: 'Corporate and bulk',
      items: [
        { q: 'Do you make logo signs and gifts in bulk?', a: 'Yes. Send an enquiry on the Corporate & Bulk page with quantity and timeline and we will quote.' },
        { q: 'Is there trade pricing for designers?', a: 'Yes. Architects and interior designers can ask for trade pricing on the same page.' },
      ],
    },
  ];

  useSeo({
    title: 'FAQs',
    description: 'Answers about ordering, payment, finishes, mounting, delivery and returns for Vernox metal wall art.',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: groups.flatMap(g => g.items).map(i => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })),
    },
  });

  return (
    <ContentPage title="Frequently asked questions">
      {groups.map(g => (
        <section key={g.title} aria-labelledby={g.title}>
          <h2 id={g.title} className="mb-2 font-display text-2xl">{g.title}</h2>
          <Accordion type="single" collapsible>
            {g.items.map((it, i) => (
              <AccordionItem key={it.q} value={`${g.title}-${i}`}>
                <AccordionTrigger className="text-left text-base">{it.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{it.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ))}
      <p className="text-muted-foreground">Still need help? <Link to="/contact" className="font-semibold text-burgundy hover:underline">Contact us</Link>.</p>
    </ContentPage>
  );
}
