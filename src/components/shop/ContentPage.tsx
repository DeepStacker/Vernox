import type { ReactNode } from 'react';
import { StoreLayout } from '@/components/shop/StoreLayout';

interface Props {
  title: string;
  intro?: string;
  children: ReactNode;
  /** Narrow reading column (policies, FAQs) vs. wide layout (forms with side panels). */
  wide?: boolean;
}

/** Frame for text pages (About, Shipping, Returns, FAQs, Legal, Contact): one h1, readable column. */
export function ContentPage({ title, intro, children, wide }: Props) {
  return (
    <StoreLayout>
      <div className={`container py-8 sm:py-12 ${wide ? '' : 'max-w-3xl'}`}>
        <h1 className="font-display text-4xl sm:text-5xl">{title}</h1>
        {intro && <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{intro}</p>}
        <div className="mt-8 space-y-8">{children}</div>
      </div>
    </StoreLayout>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="space-y-2 text-muted-foreground [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </section>
  );
}

/** Flags text the owner must confirm or replace before launch. */
export function DraftNote({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-brass bg-secondary p-3 text-sm text-foreground">{children}</p>;
}
