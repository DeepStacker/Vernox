import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { robotsTxt } from '../../api/seo';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { isChunkLoadError } from '@/lib/app/staleBuild';

function Boom({ error }: { error: Error }): never {
  throw error;
}

describe('app resilience', () => {
  afterEach(() => vi.restoreAllMocks());

  it('recognises chunk load failures from each browser', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Shop-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('shows a way forward instead of a blank page when a page crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AppErrorBoundary resetKey="/shop"><Boom error={new Error('bad data')} /></AppErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('This page could not be shown');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });

  it('clears the error when the route changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<AppErrorBoundary resetKey="/a"><Boom error={new Error('x')} /></AppErrorBoundary>);
    rerender(<AppErrorBoundary resetKey="/b"><p>next page</p></AppErrorBoundary>);
    expect(screen.getByText('next page')).toBeInTheDocument();
  });

  it('points robots.txt at the configured site and keeps private pages out', () => {
    const txt = robotsTxt('https://shop.example.in');
    expect(txt).toContain('Sitemap: https://shop.example.in/sitemap.xml');
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toContain('Disallow: /checkout');
  });
});

describe('order confirmation details', () => {
  it('puts cash-on-delivery orders on the first progress stage', async () => {
    const { fulfilmentStageIndex } = await import('@/lib/orders/fulfilmentStages');
    expect(fulfilmentStageIndex('Confirmed_COD')).toBe(0);
  });

  it('keeps the guest email out of the URL but available to this tab', async () => {
    const { confirmationEmail, rememberConfirmationEmail } = await import('@/lib/orders/confirmationEmail');
    rememberConfirmationEmail('ord1', 'a@example.test');
    expect(confirmationEmail('ord1')).toBe('a@example.test');
    expect(confirmationEmail('other')).toBeUndefined();
  });
});
