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
      title: 'Ordering',
      items: [
        { q: 'Which payment methods do you accept?', a: 'UPI, cards and net banking. Cash on delivery on ready designs.' },
        { q: 'Are prices inclusive of GST?', a: `Prices exclude GST. ${storeConfig.gstRatePercent}% GST is added at checkout.` },
        { q: 'Can I use a coupon?', a: 'Yes, enter it in your cart.' },
      ],
    },
    {
      title: 'Products',
      items: [
        { q: 'What are the pieces made of?', a: 'Laser-cut sheet steel, finished in powder coat, brass, gold, copper, Corten or stainless.' },
        { q: 'Can I hang them outdoors?', a: 'Only designs marked outdoor-ready on the product page.' },
        { q: 'How do I mount it?', a: 'Standoff spacers and screws are included. You need a drill.' },
        { q: 'Can I get a different size or my own design?', a: 'Yes, in the Studio.' },
      ],
    },
    {
      title: 'Delivery',
      items: [
        { q: 'How long does delivery take?', a: '5 to 9 working days to make, plus delivery.' },
        { q: 'Is shipping free?', a: `Free above ${formatINR(storeConfig.freeShippingThreshold)}, otherwise ${formatINR(storeConfig.shippingFee)}.` },
        { q: 'What if my piece arrives damaged?', a: 'Send photos within 48 hours and we will replace it.' },
        { q: 'Where is my order?', a: 'Use Track order with your order number and email.' },
      ],
    },
    {
      title: 'Corporate',
      items: [
        { q: 'Do you make logo signs and gifts in bulk?', a: 'Yes, request a quote on the Corporate page.' },
        { q: 'Is there trade pricing for designers?', a: 'Yes, on the same page.' },
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
    <ContentPage title="FAQs">
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
      <p className="text-muted-foreground">Still need help? <Link to="/contact" className="font-semibold text-burgundy hover:underline">Contact us</Link></p>
    </ContentPage>
  );
}
