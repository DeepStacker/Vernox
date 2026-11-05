import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StoreLayout } from '@/components/shop/StoreLayout';
import { PageHeader } from '@/components/shop/PageHeader';
import { Reveal } from '@/components/shop/Reveal';

interface Props {
  title: string;
  /** One short line under the title. */
  intro?: string;
  children: ReactNode;
  /** Narrow reading column (policies, FAQs) vs. wide layout (forms with side panels). */
  wide?: boolean;
}

/** Frame for text pages (About, Shipping, Returns, FAQs, Legal, Contact): breadcrumb, one h1, readable column. */
export function ContentPage({ title, intro, children, wide }: Props) {
  return (
    <StoreLayout>
      <div className={`container py-6 sm:py-10 ${wide ? '' : 'max-w-3xl'}`}>
        <PageHeader title={title} line={intro} crumbs={[{ label: title }]} />
        <div className="space-y-7">{children}</div>
      </div>
    </StoreLayout>
  );
}

/** A short, scannable block: heading plus a few lines or bullets. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Reveal as="section" className="space-y-2">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="space-y-2 text-muted-foreground [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </Reveal>
  );
}

/**
 * Owner-only reminder (open the page with ?draft=1 to see it). Customers never see these, so policy pages
 * stay clean while the owner still has a visible checklist of what to confirm before launch.
 */
export function DraftNote({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  if (!params.has('draft')) return null;
  return <p className="rounded-lg border border-dashed border-brass bg-secondary p-3 text-sm text-foreground"><strong>Owner:</strong> {children}</p>;
}
