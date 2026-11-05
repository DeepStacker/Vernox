import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { Picture, SITE_IMAGES } from '@/components/shop/Picture';
import { useCatalog } from '@/lib/catalogContext';
import { resolveContact, whatsappLink } from '@/lib/storefront/contact';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export function StudioCta() {
  return (
    <section className="bg-secondary" aria-labelledby="studio-heading">
      <div className="container grid items-center gap-8 py-12 md:grid-cols-2">
        <Picture {...SITE_IMAGES.entrance} alt="A custom metal name plate at a home entrance" className="aspect-[4/3] w-full rounded-lg object-cover" />
        <div className="space-y-4">
          <p className="eyebrow">Design your own</p>
          <h2 id="studio-heading" className="section-title">A name plate, logo or shape that is entirely yours</h2>
          <p className="text-muted-foreground">
            Use the Studio to type a name, upload a logo or draw a shape. You see the piece in your chosen metal and size,
            and the price, before you order.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/studio" className="btn-primary">Open the Studio</Link>
            <Link to="/shop?category=nameplates" className="btn-secondary">Name plates</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CorporateBand() {
  return (
    <section className="container py-12" aria-labelledby="corp-heading">
      <div className="rounded-lg bg-burgundy p-6 text-cream sm:p-10">
        <h2 id="corp-heading" className="font-display text-3xl text-cream sm:text-4xl">Corporate gifting and bulk orders</h2>
        <p className="mt-3 max-w-2xl text-cream/90">
          Logo signage for reception, festive gifts for your team and metal wall art for projects. Trade pricing for
          architects and interior designers.
        </p>
        <Link to="/trade" className="btn mt-5 bg-cream text-burgundy hover:bg-cream/90">Request a quote</Link>
      </div>
    </section>
  );
}

const STEPS = [
  { title: 'Choose or design', body: 'Pick a ready design, or create your own in the Studio. Select size and finish.' },
  { title: 'Cut and finish', body: 'Your piece is laser-cut from sheet metal, deburred and finished in our workshop.' },
  { title: 'Packed and delivered', body: 'Packed to protect the finish and shipped across India, with mounting fittings included.' },
];

export function HowItsMade() {
  return (
    <section className="container py-12" aria-labelledby="how-heading">
      <h2 id="how-heading" className="section-title mb-6">How it is made</h2>
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-lg border border-border bg-card p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-burgundy text-sm font-semibold text-cream">{i + 1}</span>
            <h3 className="mt-3 text-xl">{s.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export const HOME_FAQS = [
  { q: 'How long does a piece take?', a: 'Every piece is made to order. Ready designs ship in about 5 to 9 working days after you order; custom pieces are confirmed in the Studio. Delivery time is extra and depends on your PIN code.' },
  { q: 'Will the metal rust?', a: 'Our powder-coated, brass, copper and stainless finishes are meant for indoor walls. For balconies and name plates, choose the outdoor-ready designs marked on the product page.' },
  { q: 'How do I put it on the wall?', a: 'Each piece comes with standoff spacers and screws. They hold it 2.5 cm off the wall and need a drill and a pencil.' },
  { q: 'Is cash on delivery available?', a: 'Yes, on ready designs from the catalogue. Custom Studio designs are prepaid because they are made for you alone.' },
  { q: 'What if it arrives damaged?', a: 'Send us photos within 48 hours of delivery and we will arrange a replacement. See our Returns page for details.' },
];

export function HomeFaq() {
  return (
    <section className="container max-w-3xl py-12" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="section-title mb-4">Questions, answered</h2>
      <Accordion type="single" collapsible>
        {HOME_FAQS.map((f, i) => (
          <AccordionItem key={f.q} value={`f${i}`}>
            <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <Link to="/faqs" className="mt-4 inline-block text-sm font-semibold text-burgundy hover:underline">All FAQs</Link>
    </section>
  );
}

/** Replaces the former newsletter form: there is no subscriber store yet, so we point to WhatsApp instead of pretending to save an email. */
export function StayInTouch() {
  const { storeConfig } = useCatalog();
  const link = whatsappLink(resolveContact(storeConfig), 'Hi Vernox, please share new designs and festive offers.');
  return (
    <section className="bg-secondary" aria-labelledby="touch-heading">
      <div className="container flex flex-col items-start gap-3 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="touch-heading" className="font-display text-2xl">Planning a gift or a whole-house order?</h2>
          <p className="text-sm text-muted-foreground">Talk to us. We reply with designs, sizes and prices that suit your wall.</p>
        </div>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="btn-primary"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Chat on WhatsApp</a>
        ) : (
          <Link to="/contact" className="btn-primary">Contact us</Link>
        )}
      </div>
    </section>
  );
}
