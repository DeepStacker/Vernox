/**
 * Vernox staff portal: one shell (sidebar + top bar) around the role consoles. The navigation is
 * data-driven and filtered by canAccessTab, which derives from the permission map in
 * src/types/admin.ts, so a role is never offered a screen the server would refuse. Styling uses
 * the storefront design tokens (src/index.css) and 44 px tap targets for workshop tablets.
 */
import { useState, useEffect, useMemo, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell, Briefcase, BarChart3, ClipboardCheck, ExternalLink, FileText, Hammer, Headphones, Home, LogOut, Lock, Menu,
  MessageSquare, Package, Palette, PanelLeftClose, PanelLeftOpen, Receipt, RotateCcw, Search, Settings, ShieldCheck,
  ShoppingCart, SlidersHorizontal, Tag, Truck, Users, ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminCommandPalette } from '@/components/admin/AdminCommandPalette';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canAccessTab, formatRole, type AdminTabId, type StaffRole } from '@/lib/auth/permissions';
import { useAdminData } from '@/lib/data/adminData';
import { cn } from '@/lib/utils';
import { useSeo } from '@/lib/seo';
import { safeLocal } from '@/lib/safeStorage';
import { RoleHome } from './admin/overview/RoleHome';
import { MetricsDashboard } from './admin/overview/MetricsDashboard';
import { ProductionConsole } from './admin/production/ProductionConsole';
import { QcConsole } from './admin/qc/QcConsole';
import { ShippingConsole } from './admin/shipping/ShippingConsole';
import { ReturnsConsole } from './admin/returns/ReturnsConsole';
import { FinanceConsole } from './admin/finance/FinanceConsole';
import { SupportConsole } from './admin/support/SupportConsole';
import { B2bInquiries } from './admin/b2b/B2bInquiries';
import { AdminOrders } from './admin/AdminOrders';
import { AdminProducts } from './admin/AdminProducts';
import { AdminCoupons } from './admin/AdminCoupons';
import { AdminCustomers } from './admin/AdminCustomers';
import { AdminNotifications } from './admin/AdminNotifications';
import { AdminReviews } from './admin/AdminReviews';
import { AdminRoles } from './admin/AdminRoles';
import { AdminAuditLogs } from './admin/AdminAuditLogs';
import { AdminSettings } from './admin/AdminSettings';
import { AdminHeroSlider } from './admin/AdminHeroSlider';

interface NavItem {
  id: AdminTabId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string | number;
}

const SIDEBAR_COLLAPSED_KEY = 'vernox-admin-sidebar-collapsed';

function NavButton({ item, active, collapsed, onSelect }: { item: NavItem; active: boolean; collapsed: boolean; onSelect: () => void }) {
  const Icon = item.icon;
  return (
    <button type="button" onClick={onSelect} title={item.label} aria-current={active ? 'page' : undefined}
      className={cn('relative flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent', collapsed && 'justify-center px-2')}>
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
      {item.badge !== undefined && (collapsed
        ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brass" />
        : <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', active ? 'bg-primary-foreground/20' : 'bg-secondary text-secondary-foreground')}>{item.badge}</span>)}
    </button>
  );
}

function NavList({ groups, active, collapsed, onSelect }: { groups: Array<{ title: string; items: NavItem[] }>; active: AdminTabId; collapsed: boolean; onSelect: (tab: AdminTabId) => void }) {
  return (
    <nav aria-label="Admin sections" className="space-y-4">
      {groups.map(group => (
        <div key={group.title} className="space-y-1">
          {!collapsed && <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group.title}</h2>}
          {group.items.map(item => <NavButton key={item.id} item={item} active={active === item.id} collapsed={collapsed} onSelect={() => onSelect(item.id)} />)}
        </div>
      ))}
    </nav>
  );
}

function AdminShell({ role, displayName, onSignOut }: { role: StaffRole; displayName: string; onSignOut: () => void }) {
  const { orders, products } = useAdminData();
  const [activeTab, setActiveTab] = useState<AdminTabId>('home');
  const selectTab = (tab: AdminTabId) => { if (canAccessTab(role, tab)) setActiveTab(tab); };

  const [collapsed, setCollapsed] = useState(() => safeLocal.get(SIDEBAR_COLLAPSED_KEY) === 'true');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Ctrl+K / ⌘K opens the search palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pendingOrders = useMemo(() => orders.filter(o => o.status === 'Paid' || o.status === 'In_Design').length, [orders]);
  const customOrders = useMemo(() => orders.filter(o => o.items?.some(i => i.customDesignRef || i.userUploadedImage || i.productId === 'custom-bespoke')).length, [orders]);
  const lowStock = useMemo(() => products.filter(p => (p.stock ?? 0) <= 5).length, [products]);
  const urgentAlerts = useMemo(
    () => products.filter(p => (p.stock ?? 0) <= 5).length + orders.filter(o => o.status === 'Paid').length,
    [products, orders],
  );

  const groups = useMemo(() => {
    const all: Array<{ title: string; items: NavItem[] }> = [
      { title: 'Operations', items: [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'orders', label: 'Orders', icon: ShoppingCart, badge: pendingOrders || undefined },
        { id: 'production', label: 'Production', icon: Hammer },
        { id: 'qc', label: 'QC and packing', icon: ClipboardCheck },
        { id: 'shipping', label: 'Shipping', icon: Truck },
        { id: 'returns', label: 'Returns', icon: RotateCcw },
        { id: 'finance', label: 'Finance', icon: Receipt },
        { id: 'support', label: 'Support', icon: Headphones },
        { id: 'b2b', label: 'Trade enquiries', icon: Briefcase },
      ] },
      { title: 'Store', items: [
        { id: 'products', label: 'Products', icon: Package, badge: lowStock ? `${lowStock} low` : undefined },
        { id: 'customers', label: 'Customers', icon: Users },
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
        { id: 'coupons', label: 'Discounts', icon: Tag },
        { id: 'custom-orders', label: 'Custom CAM', icon: Palette, badge: customOrders || undefined },
        { id: 'hero-slider', label: 'Hero sliders', icon: SlidersHorizontal },
        { id: 'reviews', label: 'Reviews', icon: MessageSquare },
      ] },
      { title: 'System', items: [
        { id: 'notifications', label: 'Notifications', icon: Bell, badge: urgentAlerts || undefined },
        { id: 'roles', label: 'Team', icon: ShieldCheck },
        { id: 'audit', label: 'Activity log', icon: FileText },
        { id: 'settings', label: 'Settings', icon: Settings },
      ] },
    ];
    return all.map(g => ({ ...g, items: g.items.filter(i => canAccessTab(role, i.id)) })).filter(g => g.items.length > 0);
  }, [role, pendingOrders, lowStock, customOrders, urgentAlerts]);

  const current = groups.flatMap(g => g.items).find(i => i.id === activeTab);
  const initial = displayName.charAt(0).toUpperCase() || 'V';
  const toggleSidebar = () => setCollapsed(prev => { safeLocal.set(SIDEBAR_COLLAPSED_KEY, String(!prev)); return !prev; });
  const iconButton = 'inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <AdminCommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)}
        onSelectTab={tab => { selectTab(tab as AdminTabId); setPaletteOpen(false); }}
        onSelectOrder={() => { selectTab('orders'); setPaletteOpen(false); }}
        onSelectProduct={() => { selectTab('products'); setPaletteOpen(false); }} />

      <header className="relative z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => setDrawerOpen(true)} className={cn(iconButton, 'md:hidden')} aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
          <button type="button" onClick={toggleSidebar} className={cn(iconButton, 'hidden md:inline-flex')} aria-label={collapsed ? 'Open sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary font-display text-lg text-primary-foreground" aria-hidden="true">V</span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate font-display text-xl">Vernox staff</h1>
            <p className="truncate text-xs text-muted-foreground">{current?.label ?? 'Home'} · {formatRole(role)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPaletteOpen(true)} className="btn-secondary !px-3" aria-label="Search">
            <Search className="h-4 w-4" /><span className="hidden sm:inline">Search</span><kbd className="hidden rounded border border-border px-1.5 font-mono text-[11px] sm:inline">⌘K</kbd>
          </button>
          {canAccessTab(role, 'notifications') && (
            <button type="button" onClick={() => selectTab('notifications')} className={cn(iconButton, 'relative')} aria-label="Notifications">
              <Bell className="h-5 w-5" />
              {urgentAlerts > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-destructive" />}
            </button>
          )}
          <Link to="/" className={cn(iconButton, 'hidden lg:inline-flex')} aria-label="Open storefront" title="Storefront"><ExternalLink className="h-5 w-5" /></Link>
          <span className="ml-1 hidden h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground sm:flex" aria-hidden="true">{initial}</span>
          <button type="button" onClick={onSignOut} className={iconButton} aria-label="Sign out" title="Sign out"><LogOut className="h-5 w-5" /></button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <aside className={cn('hidden shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar p-3 md:block', collapsed ? 'w-16' : 'w-60')}>
          <NavList groups={groups} active={activeTab} collapsed={collapsed} onSelect={selectTab} />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {activeTab === 'home' && <RoleHome role={role} onSelectTab={selectTab} />}
          {activeTab === 'analytics' && canAccessTab(role, 'analytics') && <MetricsDashboard />}
          {activeTab === 'production' && canAccessTab(role, 'production') && <ProductionConsole />}
          {activeTab === 'qc' && canAccessTab(role, 'qc') && <QcConsole />}
          {activeTab === 'shipping' && canAccessTab(role, 'shipping') && <ShippingConsole onNavigate={selectTab} />}
          {activeTab === 'returns' && canAccessTab(role, 'returns') && <ReturnsConsole onNavigate={selectTab} />}
          {activeTab === 'finance' && canAccessTab(role, 'finance') && <FinanceConsole />}
          {activeTab === 'support' && canAccessTab(role, 'support') && <SupportConsole />}
          {activeTab === 'b2b' && canAccessTab(role, 'b2b') && <B2bInquiries />}
          {activeTab === 'orders' && canAccessTab(role, 'orders') && <AdminOrders onSelectTab={tab => selectTab(tab as AdminTabId)} />}
          {activeTab === 'custom-orders' && canAccessTab(role, 'custom-orders') && <AdminOrders initialFilter="custom" onSelectTab={tab => selectTab(tab as AdminTabId)} />}
          {activeTab === 'products' && canAccessTab(role, 'products') && <AdminProducts />}
          {activeTab === 'customers' && canAccessTab(role, 'customers') && <AdminCustomers />}
          {(activeTab === 'coupons' || activeTab === 'marketing') && canAccessTab(role, activeTab) && <AdminCoupons />}
          {activeTab === 'hero-slider' && canAccessTab(role, 'hero-slider') && <AdminHeroSlider />}
          {activeTab === 'reviews' && canAccessTab(role, 'reviews') && <AdminReviews />}
          {activeTab === 'notifications' && <AdminNotifications onSelectTab={tab => selectTab(tab as AdminTabId)} />}
          {activeTab === 'roles' && canAccessTab(role, 'roles') && <AdminRoles />}
          {activeTab === 'audit' && canAccessTab(role, 'audit') && <AdminAuditLogs />}
          {activeTab === 'settings' && canAccessTab(role, 'settings') && <AdminSettings />}
        </main>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 overflow-y-auto bg-sidebar p-4">
          <SheetTitle className="font-display text-xl">Vernox staff</SheetTitle>
          <SheetDescription className="mb-3 text-xs">{displayName || 'Staff'} · {formatRole(role)}</SheetDescription>
          <NavList groups={groups} active={activeTab} collapsed={false} onSelect={tab => { selectTab(tab); setDrawerOpen(false); }} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AdminLogin() {
  const { staffSignIn, user, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error('Please enter both email and password');
      return;
    }
    setSigningIn(true);
    try {
      await staffSignIn(email.trim(), password);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error(message.includes('staff access') ? message : 'Invalid credentials');
    } finally {
      setSigningIn(false);
    }
  };

  const shell = 'flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground';
  const card = 'w-full max-w-md space-y-5 rounded-lg border border-border bg-card p-8 shadow-soft';

  // Signed in as a customer: explain instead of showing a form that cannot succeed.
  if (user) {
    return (
      <div className={shell}>
        <div className={cn(card, 'text-center')}>
          <Lock className="mx-auto h-6 w-6 text-brass" />
          <h1 className="font-display text-2xl">No staff access</h1>
          <p className="text-sm text-muted-foreground">{user.email} is not a staff account. Sign out to use a different account.</p>
          <button onClick={() => void signOut()} className="btn-primary">Sign out</button>
          <div><Link to="/" className="text-sm text-muted-foreground underline">Return to storefront</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className={card}>
        <div className="space-y-2 text-center">
          <Lock className="mx-auto h-6 w-6 text-brass" />
          <h1 className="font-display text-3xl">Vernox staff</h1>
          <p className="text-sm text-muted-foreground">Sign in to manage orders, production, shipping and finance.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Email</span>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="username" className="field" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Password</span>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" className="field" />
          </label>
          <button type="submit" disabled={signingIn} className="btn-primary w-full">{signingIn ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div className="border-t border-border pt-4 text-center">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back to the storefront</Link>
        </div>
      </div>
    </div>
  );
}

/** Route guard for /admin: nothing from the admin data layer is mounted until a staff role is verified. */
export default function Admin() {
  useSeo({ title: 'Admin', noindex: true });
  const { loading, user, staffRole, signOut, profile } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Checking access…</div>;
  }
  if (!staffRole) return <AdminLogin />;

  const displayName = profile?.name || user?.displayName || user?.email || '';
  return <AdminShell role={staffRole} displayName={displayName} onSignOut={() => { void signOut(); toast.success('Signed out'); }} />;
}
