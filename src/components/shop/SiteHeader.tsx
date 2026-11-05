import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ChevronDown, Heart, Menu, Search, ShoppingBag, User } from 'lucide-react';
import { useCart } from '@/lib/cartContext';
import { useCatalog } from '@/lib/catalogContext';
import { ROOMS, THEMES } from '@/lib/catalog';
import { formatINR } from '@/lib/storefront/format';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface MenuLink { label: string; to: string; note?: string }
interface MenuGroup { id: string; label: string; links: MenuLink[] }

const MENUS: MenuGroup[] = [
  { id: 'room', label: 'Shop by Room', links: ROOMS.map(r => ({ label: r.name, to: `/shop?room=${r.id}`, note: r.blurb })) },
  { id: 'theme', label: 'Shop by Theme', links: THEMES.map(t => ({ label: t.name, to: `/shop?theme=${t.id}` })) },
  {
    id: 'custom',
    label: 'Custom',
    links: [
      { label: 'Design in the Studio', to: '/studio', note: 'Upload a logo or draw your own shape' },
      { label: 'Name plates & house signs', to: '/shop?category=nameplates', note: 'Customisable, weather-ready' },
    ],
  },
];

const PLAIN_LINKS: MenuLink[] = [
  { label: 'Corporate & Bulk', to: '/trade' },
  { label: 'Track Order', to: '/track-order' },
];

function SearchBox({ className, onDone }: { className?: string; onDone?: () => void }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  return (
    <form
      role="search"
      className={cn('relative', className)}
      onSubmit={e => {
        e.preventDefault();
        navigate(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : '/shop');
        onDone?.();
      }}
    >
      <label htmlFor="site-search" className="sr-only">Search designs</label>
      <input
        id="site-search"
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search Om, peacock, name plate..."
        className="field pl-10"
      />
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </form>
  );
}

function DesktopMenu({ group }: { group: MenuGroup }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 py-3 text-sm font-medium text-foreground hover:text-burgundy"
      >
        {group.label}
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 w-72 rounded-lg border border-border bg-card p-2 shadow-luxe">
          {group.links.map(l => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 hover:bg-secondary">
              <span className="block text-sm font-medium text-foreground">{l.label}</span>
              {l.note && <span className="block text-xs text-muted-foreground">{l.note}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** `onOpenStudio` is accepted for backward compatibility with older callers; the Studio is now a route. */
export function SiteHeader(_props: { onOpenStudio?: () => void } = {}) {
  const { count } = useCart();
  const { wishlist, storeConfig } = useCatalog();
  const [menuOpen, setMenuOpen] = useState(false);
  const threshold = storeConfig.freeShippingThreshold;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="bg-burgundy text-cream">
        <p className="container py-1.5 text-center text-xs sm:text-sm">
          Free shipping above {formatINR(threshold)} · COD on ready designs
        </p>
      </div>

      <div className="container flex items-center gap-3 py-3">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="-ml-2 flex h-11 w-11 items-center justify-center lg:hidden">
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>

        <Link to="/" className="font-brand text-xl text-foreground sm:text-2xl" aria-label="Vernox home">Vernox</Link>

        <SearchBox className="ml-6 hidden max-w-md flex-1 md:block" />

        <div className="ml-auto flex items-center">
          <Link to="/account?tab=wishlist" aria-label={`Wishlist, ${wishlist.length} saved`} className="relative flex h-11 w-11 items-center justify-center hover:text-burgundy">
            <Heart className="h-5 w-5" aria-hidden="true" />
            {wishlist.length > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-burgundy px-1 text-[10px] font-semibold text-cream">{wishlist.length}</span>}
          </Link>
          <Link to="/account" aria-label="Account" className="hidden h-11 w-11 items-center justify-center hover:text-burgundy sm:flex">
            <User className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link to="/cart" data-cart-icon aria-label={`Cart, ${count} items`} className="relative flex h-11 w-11 items-center justify-center hover:text-burgundy">
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            {count > 0 && <span key={count} className="cart-bump absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-burgundy px-1 text-[10px] font-semibold text-cream">{count}</span>}
          </Link>
        </div>
      </div>

      <div className="container pb-3 md:hidden">
        <SearchBox />
      </div>

      <nav aria-label="Main" className="hidden border-t border-border lg:block">
        <div className="container flex items-center gap-8">
          {MENUS.map(g => <DesktopMenu key={g.id} group={g} />)}
          {PLAIN_LINKS.map(l => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('py-3 text-sm font-medium hover:text-burgundy', isActive ? 'text-burgundy' : 'text-foreground')}>
              {l.label}
            </NavLink>
          ))}
          <NavLink to="/shop" className="ml-auto py-3 text-sm font-medium text-burgundy hover:underline">All designs</NavLink>
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto bg-background">
          <SheetHeader><SheetTitle className="font-brand text-xl">Vernox</SheetTitle></SheetHeader>
          <nav aria-label="Menu" className="mt-4 space-y-5">
            {MENUS.map(g => (
              <section key={g.id}>
                <h3 className="eyebrow mb-1">{g.label}</h3>
                <ul>
                  {g.links.map(l => (
                    <li key={l.to}><Link to={l.to} onClick={() => setMenuOpen(false)} className="block py-2.5 text-base text-foreground">{l.label}</Link></li>
                  ))}
                </ul>
              </section>
            ))}
            <ul className="border-t border-border pt-3">
              {[...PLAIN_LINKS, { label: 'Wishlist', to: '/account?tab=wishlist' }, { label: 'Account', to: '/account' }, { label: 'Contact', to: '/contact' }].map(l => (
                <li key={l.to}><Link to={l.to} onClick={() => setMenuOpen(false)} className="block py-2.5 text-base text-foreground">{l.label}</Link></li>
              ))}
            </ul>
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
