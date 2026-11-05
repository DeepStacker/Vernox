import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CartProvider } from '@/lib/cartContext';
import { useDiskFonts } from '@/lib/studio/__tests__/testFonts';
import Index from '@/pages/Index';

// The Konva canvas needs a real 2D context (covered by the Playwright run); the shell,
// engine, pricing and cart flow are exercised here.
vi.mock('@/components/editor/canvas/StudioCanvas', () => ({ default: () => <div data-testid="canvas-stub" /> }));
// Settings come from Firestore in the app; tests use the server defaults.
vi.mock('@/lib/data/settings', () => ({ useStoreConfig: () => ({ data: undefined }) }));

beforeAll(() => {
  useDiskFonts();
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

function renderStudio(path = '/studio') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <CartProvider>
          <MemoryRouter initialEntries={[path]}>
            <Index />
          </MemoryRouter>
        </CartProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('Design studio', () => {
  it('renders the start step with templates', () => {
    renderStudio();
    expect(screen.getByText('What would you like to make?')).toBeDefined();
    expect(screen.getByRole('button', { name: /House name plate/ })).toBeDefined();
  });

  it('builds a template, prices it like the server and adds it to the cart', async () => {
    localStorage.clear();
    renderStudio();
    fireEvent.click(screen.getByRole('button', { name: /House name plate/ }));
    await waitFor(() => expect(screen.getByTestId('canvas-stub')).toBeDefined(), { timeout: 10_000 });
    const price = await screen.findByTestId('studio-price', {}, { timeout: 15_000 });
    expect(price.textContent).toMatch(/^₹\d/);
    const add = screen.getByTestId('studio-primary');
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false), { timeout: 15_000 });
    fireEvent.click(add);
    await waitFor(() => {
      const cart = JSON.parse(localStorage.getItem('vernox-cart') ?? '[]');
      expect(cart).toHaveLength(1);
    }, { timeout: 15_000 });
    const [line] = JSON.parse(localStorage.getItem('vernox-cart') ?? '[]');
    expect(line).toMatchObject({ productId: 'custom-bespoke', finish: 'black_patina', quantity: 1 });
    expect(line.widthMm).toBeGreaterThanOrEqual(100);
    const design = JSON.parse(line.customDesignRef);
    expect(design.schemaVersion).toBe(4);
    expect(design.production.contours.length).toBeGreaterThan(2);
  }, 40_000);

  it('opens a deep link straight into the design step', async () => {
    renderStudio('/studio?template=office-plaque&text=VERNOX&finish=brass&w=500&h=250');
    await screen.findByTestId('canvas-stub', {}, { timeout: 10_000 });
    expect((screen.getByDisplayValue('VERNOX') as HTMLInputElement).value).toBe('VERNOX');
  }, 20_000);
});
