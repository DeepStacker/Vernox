import { Link } from 'react-router-dom';
import { ContentPage, DraftNote, Section } from '@/components/shop/ContentPage';
import { Picture, SITE_IMAGES } from '@/components/shop/Picture';
import { useSeo } from '@/lib/seo';

export default function About() {
  useSeo({ title: 'About Vernox', description: 'Vernox makes laser-cut metal wall art to order in India. Learn how a design becomes a piece on your wall.' });
  return (
    <ContentPage title="Made in India, cut to order" intro="Vernox turns sheet metal into wall art for Indian homes and offices. Every piece is laser-cut and finished in our workshop after you order it.">
      <DraftNote>
        Owner to complete before launch: [Founding year], [Founder name and short story], [Workshop city], [Machine and capacity details]. Nothing below claims history, awards or customer numbers.
      </DraftNote>

      <Picture {...SITE_IMAGES.workshop} alt="Metal wall art being finished in the workshop" className="aspect-[4/3] w-full rounded-lg object-cover" />

      <Section title="Our story">
        <p>[Founding year]: [Write two or three lines on why Vernox started and who it is for.]</p>
        <p>We make wall art that suits how Indian homes are lived in: pooja rooms, living rooms, entrance walls, name plates at the gate and logo signs for offices.</p>
      </Section>

      <Section title="How a piece is made">
        <ul>
          <li>You choose a ready design or create your own in the Studio, and pick the size and finish.</li>
          <li>The design is cut from sheet metal on a laser cutter, then deburred and cleaned.</li>
          <li>The finish is applied: powder coat, brass, gold, copper, Corten rust or stainless.</li>
          <li>Each piece is checked, packed to protect the finish and shipped with mounting fittings.</li>
        </ul>
      </Section>

      <Section title="What we promise">
        <ul>
          <li>Made to order in India, priced in rupees with GST shown clearly at checkout.</li>
          <li>Finishes chosen to last on interior walls, and outdoor-ready options for name plates and balconies.</li>
          <li>Replacement if your piece arrives damaged in transit.</li>
        </ul>
      </Section>

      <div className="flex flex-wrap gap-3">
        <Link to="/shop" className="btn-primary">Shop designs</Link>
        <Link to="/trade" className="btn-secondary">Corporate and bulk orders</Link>
        <Link to="/contact" className="btn-secondary">Contact us</Link>
      </div>
    </ContentPage>
  );
}
