import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CartProvider } from '@/lib/cartContext';
import { useDiskFonts } from '@/lib/studio/__tests__/testFonts';
import Index from '@/pages/Index';

vi.mock('@/components/editor/canvas/StudioCanvas', () => ({ default: () => <div data-testid="canvas-stub" /> }));
vi.mock('@/lib/data/settings', () => ({ useStoreConfig: () => ({ data: undefined }) }));

beforeAll(() => {
  useDiskFonts();
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

describe('Studio batch screen', () => {
  it('validates a pasted sheet, prices it and adds one custom line per distinct design', async () => {
    localStorage.clear();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <CartProvider>
            <MemoryRouter initialEntries={['/studio?template=office-plaque&text=VERNOX&w=500&h=250']}>
              <Index />
            </MemoryRouter>
          </CartProvider>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    await screen.findByTestId('canvas-stub', {}, { timeout: 10_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));

    fireEvent.change(await screen.findByLabelText(/Variable for VERNOX/), { target: { value: '{name}' } });
    fireEvent.change(screen.getByLabelText(/Paste CSV/), { target: { value: 'name,qty\nAsha,2\n,1\nRavi,x\nAsha,3\nMina,1' } });

    // 5 records: 2 valid designs (Asha merged), 2 flagged inline, 1 more valid.
    const rows = await screen.findAllByTestId('batch-row');
    expect(rows).toHaveLength(5);
    expect(screen.getByText(/is empty/)).toBeDefined();
    expect(screen.getByText(/not a whole number/)).toBeDefined();

    const add = screen.getByTestId('batch-add-to-cart') as HTMLButtonElement;
    await waitFor(() => expect(add.disabled).toBe(false), { timeout: 20_000 });
    expect(add.textContent).toBe('Add 2 to cart');
    expect(screen.getByTestId('batch-total').textContent).toMatch(/^₹\d/);

    fireEvent.click(add);
    await waitFor(() => expect(JSON.parse(localStorage.getItem('vernox-cart') ?? '[]')).toHaveLength(2), { timeout: 20_000 });
    const lines = JSON.parse(localStorage.getItem('vernox-cart') ?? '[]');
    expect(lines.map((l: { quantity: number }) => l.quantity)).toEqual([5, 1]);
    expect(lines[0].customDesignRef).toContain('Asha');
    expect(lines[1].customDesignRef).toContain('Mina');
    expect(lines[0].productName).toContain('Asha');
  }, 60_000);
});
