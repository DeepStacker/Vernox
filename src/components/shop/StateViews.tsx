import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** The storefront's one loading / empty / error treatment; every page uses these instead of ad-hoc text. */

export function LoadingBlock({ className }: { className?: string }) {
  return <div className={cn('skeleton h-64', className)} role="status" aria-label="Loading" />;
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4" role="status" aria-label="Loading designs">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="skeleton aspect-square rounded-none" />
          <div className="space-y-2 p-3"><div className="skeleton h-5 w-3/4" /><div className="skeleton h-4 w-1/2" /></div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: { label: string; to: string } }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-12 text-center">
      <p className="font-display text-2xl">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      {action && <Link to={action.to} className="btn-primary mt-5">{action.label}</Link>}
    </div>
  );
}

export function ErrorState({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{children}</p>;
}
