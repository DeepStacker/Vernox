import { Link } from 'react-router-dom';
import { ContentPage, DraftNote, Section } from '@/components/shop/ContentPage';
import { Picture, SITE_IMAGES } from '@/components/shop/Picture';
import { useSeo } from '@/lib/seo';

export default function About() {
  useSeo({ title: 'About Vernox', description: 'Vernox makes laser-cut metal wall art to order in India. Learn how a design becomes a piece on your wall.' });
  return (
    <ContentPage title="About Vernox" intro="Laser-cut metal wall art, made to order in India.">
      <DraftNote>Add the founding year, founder story, workshop city and capacity here when ready. Nothing on this page claims history, awards or customer numbers.</DraftNote>
      <Picture {...SITE_IMAGES.workshop} alt="Metal wall art being finished in the workshop" className="aspect-[16/9] w-full rounded-lg object-cover" />
      <Section title="How a piece is made">
        <ul>
          <li>Choose a design, size and finish.</li>
          <li>It is laser-cut from sheet metal and finished by hand.</li>
          <li>Packed with mounting fittings and shipped across India.</li>
        </ul>
      </Section>
      <div className="flex flex-wrap gap-3">
        <Link to="/shop" className="btn-primary">Shop designs</Link>
        <Link to="/contact" className="btn-secondary">Contact us</Link>
      </div>
    </ContentPage>
  );
}
