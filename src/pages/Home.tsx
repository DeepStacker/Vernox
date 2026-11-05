import { lazy, Suspense, useState } from 'react';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { HeroSlider } from '@/components/home/HeroSlider';
import { CategorySection } from '@/components/home/CategorySection';
import { AtelierTrustBar } from '@/components/editorial/AtelierTrustBar';
import { useSeo, organizationJsonLd, websiteJsonLd } from '@/lib/seo';

// Below-the-fold sections and the CAD studio / trade modals are split out of the
// initial route chunk; they load after first paint (modals only when opened).
const FeaturedProducts = lazy(() => import('@/components/home/FeaturedProducts').then(m => ({ default: m.FeaturedProducts })));
const ShopBySpace = lazy(() => import('@/components/home/ShopBySpace').then(m => ({ default: m.ShopBySpace })));
const MaroonCollection = lazy(() => import('@/components/home/MaroonCollection').then(m => ({ default: m.MaroonCollection })));
const BrandStory = lazy(() => import('@/components/home/BrandStory').then(m => ({ default: m.BrandStory })));
const NewsletterSection = lazy(() => import('@/components/home/NewsletterSection').then(m => ({ default: m.NewsletterSection })));
const CraftingStudioSection = lazy(() => import('@/components/home/CraftingStudioSection').then(m => ({ default: m.CraftingStudioSection })));
const ArchitecturalProof = lazy(() => import('@/components/editorial/ArchitecturalProof').then(m => ({ default: m.ArchitecturalProof })));
const InteriorInspiration = lazy(() => import('@/components/editorial/InteriorInspiration').then(m => ({ default: m.InteriorInspiration })));
const InlineStudio = lazy(() => import('@/components/experience/InlineStudio').then(m => ({ default: m.InlineStudio })));
const B2BTradeModal = lazy(() => import('@/components/shop/B2BTradeModal').then(m => ({ default: m.B2BTradeModal })));

const SectionSkeleton = () => (
  <div className="min-h-[60vh] w-full animate-pulse bg-cream" aria-hidden="true" />
);

export default function Home() {
  const [studioOpen, setStudioOpen] = useState(false);
  const [b2bOpen, setB2bOpen] = useState(false);
  useSeo({ jsonLd: [organizationJsonLd(), websiteJsonLd()] });

  return (
    <div className="min-h-screen flex flex-col bg-cream text-dark-brown selection:bg-maroon-deep selection:text-cream">
      {/* 01. Clean Sticky Header */}
      <SiteHeader onOpenStudio={() => setStudioOpen(true)} />

      {/* Main Luxury Minimalist Ecommerce Flow */}
      <main className="flex-1">
        {/* 02. Split Editorial Hero Slider */}
        <HeroSlider />

        {/* 03. Atelier Quality & Trust Bar */}
        <AtelierTrustBar />

        {/* 04. Explore Our Collections Category Grid */}
        <CategorySection />

        <Suspense fallback={<SectionSkeleton />}>
          {/* 05. Curated for Your Space - Product Grid */}
          <FeaturedProducts />

          {/* 06. Real Architectural Installations & Spaces Showcase */}
          <InteriorInspiration />

          {/* 07. The Bespoke Crafting Studio - Design Your Own */}
          <CraftingStudioSection onOpenStudio={() => setStudioOpen(true)} />

          {/* 08. Find Art for Your Space - Architectural Environments */}
          <ShopBySpace />

          {/* 09. The Maroon Collection - Deep Maroon Editorial Feature */}
          <MaroonCollection />

          {/* 10. Architectural Provenance & Collector Voices */}
          <ArchitecturalProof />

          {/* 11. Art for the Way You Live - Asymmetric Brand Story */}
          <BrandStory />

          {/* 12. Stay Inspired - Luxury Minimalist Newsletter */}
          <NewsletterSection />
        </Suspense>
      </main>

      {/* 09. Deep Maroon Luxury Footer */}
      <SiteFooter />

      {/* Bespoke Studio & Trade Inquiries Modals */}
      <Suspense fallback={null}>
        {studioOpen && <InlineStudio open={studioOpen} onOpenChange={setStudioOpen} />}
        {b2bOpen && <B2BTradeModal open={b2bOpen} onOpenChange={setB2bOpen} />}
      </Suspense>
    </div>
  );
}
