import { Link, NavLink } from 'react-router-dom';
import { ShoppingBag, Menu, X, User, Heart, Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/lib/cartContext';
import { cn } from '@/lib/utils';
import { useCatalog } from '@/lib/catalogContext';
import { SearchModal } from '@/components/editorial/SearchModal';

interface Props {
  onOpenStudio?: () => void;
}

export function SiteHeader({ onOpenStudio }: Props = {}) {
  const { count, setDrawerOpen } = useCart();
  const { wishlist } = useCatalog();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Global Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navLinks = [
    { label: 'WALL ART', to: '/shop/wall-art' },
    { label: 'SCULPTURES', to: '/shop/sculptures' },
    { label: 'COLLECTIONS', to: '/shop' },
    { label: 'CRAFTING STUDIO', to: '/customize' },
    { label: 'TRADE', to: '/trade' },
    { label: 'ABOUT', to: '/about' },
  ];

  return (
    <>
      {/* 1. TOP ANNOUNCEMENT RIBBON - Fixed edge-to-edge, ultra-clean luxury typographic hierarchy */}
      <div className="bg-[#4E1E24] text-[#F8F4E7] text-[9.5px] sm:text-[10px] uppercase font-sans border-b border-[#C6A15B]/20 relative z-30 w-full overflow-hidden select-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-8 sm:h-8.5 flex items-center justify-between">
          
          {/* Left: Architect & Designer Trade Link */}
          <Link 
            to="/trade" 
            className="hidden md:inline-flex items-center gap-1.5 text-[#C6A15B] hover:text-[#F8F4E7] transition-colors tracking-[0.2em] font-medium shrink-0 cursor-pointer"
          >
            <span>Architect & Designer Trade Program</span>
          </Link>

          {/* Center: Main Atelier Assurance Message (Always fits seamlessly without truncating) */}
          <div className="flex-1 text-center px-2 sm:px-4">
            <span className="tracking-[0.2em] sm:tracking-[0.26em] text-[#F8F4E7]/95 font-medium whitespace-nowrap">
              Curated Wall Art & Statement Pieces · Complimentary Insured Crating Worldwide
            </span>
          </div>

          {/* Right: Track Order Link */}
          <Link 
            to="/track-order" 
            className="hidden md:inline-flex items-center gap-1 text-[#F8F4E7]/80 hover:text-[#C6A15B] transition-colors tracking-[0.2em] shrink-0 cursor-pointer font-medium"
          >
            <span>Track Order</span>
            <span className="text-[#C6A15B]">→</span>
          </Link>

        </div>
      </div>

      {/* 2. MAIN STICKY LUXURY HEADER */}
      <header
        className={cn(
          "sticky top-0 z-40 transition-all duration-300 bg-[#F8F4E7]/95 backdrop-blur-md border-b border-[#EBE4D6] w-full",
          scrolled ? "py-3 shadow-xs" : "py-4 sm:py-4.5"
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          
          {/* Left: Iconic Brand Mark */}
          <Link 
            to="/" 
            className="flex items-center group py-0.5 select-none shrink-0" 
            title="Vernox Art & Sculptures"
          >
            <div className="flex flex-col">
              <span className="font-brand text-2xl sm:text-[26px] tracking-[0.3em] font-medium text-dark-brown uppercase leading-none group-hover:text-burgundy transition-colors duration-200">
                VERNOX
              </span>
              <span className="text-[7.5px] uppercase tracking-[0.4em] text-dark-brown/60 font-sans mt-1">
                Art & Sculptures
              </span>
            </div>
          </Link>

          {/* Center: Perfectly Spaced Navigation Bar - Guaranteed Single-Line (whitespace-nowrap) */}
          <nav className="hidden lg:flex items-center gap-6 xl:gap-8 2xl:gap-10">
            {navLinks.map(item => (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) => cn(
                  "relative text-[11px] xl:text-[11.5px] uppercase tracking-[0.22em] font-sans font-medium transition-colors py-1 group/nav whitespace-nowrap shrink-0",
                  isActive
                    ? "text-burgundy font-semibold"
                    : "text-dark-brown hover:text-[#C6A15B]"
                )}
              >
                {({ isActive }) => (
                  <>
                    <span>{item.label}</span>
                    <span
                      className={cn(
                        "absolute bottom-0 left-0 w-full h-[1.5px] transition-transform duration-200 origin-left bg-[#C6A15B]",
                        isActive ? "scale-x-100" : "scale-x-0 group-hover/nav:scale-x-100"
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right: Functional Action Icons */}
          <div className="flex items-center gap-3.5 sm:gap-4.5 text-dark-brown shrink-0">
            
            {/* Search Trigger */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="p-1.5 hover:text-[#C6A15B] transition-colors cursor-pointer relative"
              title="Search collection (⌘K)"
              aria-label="Search"
            >
              <Search className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>

            {/* Collector Account */}
            <Link
              to="/account"
              className="p-1.5 hover:text-[#C6A15B] transition-colors hidden sm:block"
              title="Collector Account"
              aria-label="Account"
            >
              <User className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </Link>

            {/* Wishlist */}
            <Link
              to="/account?tab=wishlist"
              className="p-1.5 hover:text-[#C6A15B] transition-colors relative"
              title="Wishlist"
              aria-label="Wishlist"
            >
              <Heart className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              {wishlist.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-burgundy text-cream text-[8px] font-mono flex items-center justify-center font-bold">
                  {wishlist.length}
                </span>
              )}
            </Link>

            {/* Cart Bag */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="p-1.5 hover:text-[#C6A15B] transition-colors relative cursor-pointer"
              title="Shopping Cart"
              aria-label="Cart"
            >
              <ShoppingBag className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-burgundy text-cream text-[9px] font-mono flex items-center justify-center font-bold shadow-xs">
                  {count}
                </span>
              )}
            </button>

            {/* Mobile Menu Trigger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 lg:hidden hover:text-[#C6A15B] transition-colors cursor-pointer ml-1"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

          </div>

        </div>

        {/* 3. MOBILE RESPONSIVE DRAWER */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="lg:hidden border-t border-[#EBE4D6] bg-cream px-6 py-6 overflow-hidden"
            >
              <div className="flex flex-col space-y-4">
                {navLinks.map(item => (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) => cn(
                      "text-xs uppercase tracking-[0.24em] font-sans py-1.5 transition-colors",
                      isActive ? "text-burgundy font-bold" : "text-dark-brown hover:text-gold"
                    )}
                  >
                    {item.label}
                  </NavLink>
                ))}

                <div className="pt-4 border-t border-[#EBE4D6] space-y-2 text-xs text-dark-brown/80 font-sans">
                  <div className="flex items-center justify-between pb-2">
                    <Link
                      to="/account"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 hover:text-burgundy"
                    >
                      <User className="w-4 h-4" />
                      <span>My Account</span>
                    </Link>
                    <Link
                      to="/account?tab=wishlist"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 hover:text-burgundy"
                    >
                      <Heart className="w-4 h-4" />
                      <span>Wishlist ({wishlist.length})</span>
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-[#EBE4D6]/60">
                    <Link
                      to="/track-order"
                      onClick={() => setMobileMenuOpen(false)}
                      className="text-burgundy font-semibold hover:underline"
                    >
                      Track Order →
                    </Link>
                    <Link
                      to="/shipping"
                      onClick={() => setMobileMenuOpen(false)}
                      className="text-dark-brown/70 hover:text-burgundy"
                    >
                      Shipping & Crating
                    </Link>
                    <Link
                      to="/trade"
                      onClick={() => setMobileMenuOpen(false)}
                      className="text-dark-brown/70 hover:text-burgundy"
                    >
                      Trade Program
                    </Link>
                    <Link
                      to="/contact"
                      onClick={() => setMobileMenuOpen(false)}
                      className="text-dark-brown/70 hover:text-burgundy"
                    >
                      Contact Concierge
                    </Link>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Global Quick Search Modal (⌘K) */}
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onOpenChange={setSearchOpen} />
    </>
  );
}
