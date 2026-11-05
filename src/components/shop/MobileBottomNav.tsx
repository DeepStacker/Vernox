import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, PenTool, ShoppingBag, User, type LucideIcon } from 'lucide-react';
import { useCart } from '@/lib/cartContext';
import { cn } from '@/lib/utils';

const ITEMS: { label: string; to: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { label: 'Home', to: '/', icon: Home, match: p => p === '/' },
  { label: 'Shop', to: '/shop', icon: LayoutGrid, match: p => p.startsWith('/shop') },
  { label: 'Custom', to: '/studio', icon: PenTool, match: p => p.startsWith('/studio') },
  { label: 'Cart', to: '/cart', icon: ShoppingBag, match: p => p.startsWith('/cart') },
  { label: 'Account', to: '/account', icon: User, match: p => p.startsWith('/account') },
];

// The product page and checkout have their own sticky action bars; stacking a second bar would cover them.
const HIDDEN_ON = ['/product/', '/checkout', '/studio'];

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { count } = useCart();
  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null;

  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ label, to, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={to}>
              <Link to={to} aria-current={active ? 'page' : undefined} className={cn('relative flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium', active ? 'text-burgundy' : 'text-muted-foreground')}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
                {label === 'Cart' && count > 0 && (
                  <span className="absolute right-[28%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-burgundy px-1 text-[10px] font-semibold text-cream">{count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
