import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';

/** Shared page frame: header, main landmark and footer (which also mounts the mobile bottom bar). */
export function StoreLayout({ children, mainClassName = '' }: { children: ReactNode; mainClassName?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      <SiteHeader />
      <main id="main" className={`flex-1 ${mainClassName}`}>{children}</main>
      <SiteFooter />
    </div>
  );
}
