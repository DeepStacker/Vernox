import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Picture, responsiveSrcSet } from '../Picture';

describe('Picture responsive variants', () => {
  it('builds a srcset with each width plus the full-size file', () => {
    expect(responsiveSrcSet('/images/a', 'webp', [640, 960], 1200)).toBe('/images/a-640.webp 640w, /images/a-960.webp 960w, /images/a.webp 1200w');
  });

  it('offers AVIF then WebP sources with sizes, and marks the priority image high', () => {
    const { container } = render(<Picture src="/images/a.jpg" width={1200} height={896} alt="x" priority widths={[640, 960]} sizes="100vw" />);
    const sources = [...container.querySelectorAll('source')];
    expect(sources.map(s => s.getAttribute('type'))).toEqual(['image/avif', 'image/webp']);
    expect(sources[0].getAttribute('sizes')).toBe('100vw');
    expect(container.querySelector('img')?.getAttribute('fetchpriority')).toBe('high');
  });

  it('keeps the single WebP source and lazy loading without widths', () => {
    const { container } = render(<Picture src="/images/a.jpg" width={10} height={10} alt="x" />);
    expect(container.querySelectorAll('source')).toHaveLength(1);
    expect(container.querySelector('img')?.getAttribute('loading')).toBe('lazy');
    expect(container.querySelector('img')?.hasAttribute('fetchpriority')).toBe(false);
  });
});
