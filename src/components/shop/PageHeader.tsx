import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb { label: string; to?: string }

/** Breadcrumb + page title used by every storefront page, so titles, spacing and trails look identical. */
export function PageHeader({ title, crumbs, line, actions }: { title?: string; crumbs?: Crumb[]; line?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 sm:mb-8">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <li><Link to="/" className="hover:text-burgundy">Home</Link></li>
            {crumbs.map(c => (
              <Fragment key={c.label}>
                <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
                <li>{c.to ? <Link to={c.to} className="hover:text-burgundy">{c.label}</Link> : <span aria-current="page" className="text-foreground">{c.label}</span>}</li>
              </Fragment>
            ))}
          </ol>
        </nav>
      )}
      {title && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
            {line && <p className="mt-1 text-muted-foreground">{line}</p>}
          </div>
          {actions}
        </div>
      )}
    </header>
  );
}
