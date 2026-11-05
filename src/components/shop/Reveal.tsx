import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  as?: ElementType;
  /** Position in a staggered group; delay = index x --stagger (capped so long grids never feel slow). */
  index?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Fades and lifts its child into place the first time it scrolls into view (CSS in index.css: `.reveal`).
 * Transform/opacity only, runs once, and is skipped under prefers-reduced-motion. Content that is already
 * on screen (or already scrolled past) is shown immediately by the observer, so nothing waits on this.
 */
export function Reveal({ as: Tag = 'div', index = 0, className, children }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.setAttribute('data-in', '');
      return;
    }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        el.setAttribute('data-in', '');
        io.disconnect();
      }
    }, { rootMargin: '100000px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={cn('reveal', className)} style={{ '--i': Math.min(index, 6) } as CSSProperties}>
      {children}
    </Tag>
  );
}
