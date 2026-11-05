import { lazy, Suspense } from 'react';
import { StoreLayout } from '@/components/shop/StoreLayout';
import { HomeHero } from '@/components/home/HomeHero';
import { TrustStrip } from '@/components/home/TrustStrip';
import { ShopByRoom } from '@/components/home/ShopByRoom';
import { useSeo, organizationJsonLd, websiteJsonLd } from '@/lib/seo';

// Everything below the first screen loads after first paint.
const BelowFold = lazy(() => import('@/components/home/BelowFold'));

export default function Home() {
  useSeo({ jsonLd: [organizationJsonLd(), websiteJsonLd()] });
  return (
    <StoreLayout>
      <HomeHero />
      <TrustStrip />
      <ShopByRoom />
      <Suspense fallback={<div className="min-h-[50vh]" aria-hidden="true" />}>
        <BelowFold />
      </Suspense>
    </StoreLayout>
  );
}
