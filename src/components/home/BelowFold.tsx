import { Bestsellers } from '@/components/home/Bestsellers';
import { CorporateBand, HowItsMade, StudioCta } from '@/components/home/HomeBands';

/** Everything under the first screen of the home page; loaded lazily so the hero paints first. */
export default function BelowFold() {
  return (
    <>
      <Bestsellers />
      <StudioCta />
      <HowItsMade />
      <CorporateBand />
    </>
  );
}
