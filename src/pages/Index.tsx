import { StudioApp } from '@/components/editor/StudioApp';
import { useSeo } from '@/lib/seo';

/** /studio — the custom design studio (lazy-loaded route, see src/App.tsx). */
const Index = () => {
  useSeo({
    title: 'Design Studio',
    description: 'Design your own laser-cut metal name plate or wall art. Pick a template, type your name, see the price, order made to order in India.',
    canonicalPath: '/studio',
  });
  return <StudioApp />;
};

export default Index;
