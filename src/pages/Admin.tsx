import { useSeo } from '@/lib/seo';
/**
 * Vernox Atelier Enterprise Management Portal
 * Luxury Bespoke Aesthetic tailored to the Vernox brand identity:
 * Deep Oxblood, Warm Cream, Champagne Brass, and Charcoal Obsidian.
 */

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canAccessTab, formatRole, type AdminTabId, type StaffRole } from '@/lib/auth/permissions';
import { useAdminData } from '@/lib/data/adminData';
import { safeLocal } from '@/lib/safeStorage';
import { RoleHome } from './admin/overview/RoleHome';
import { MetricsDashboard } from './admin/overview/MetricsDashboard';
import { ProductionConsole } from './admin/production/ProductionConsole';
import { QcConsole } from './admin/qc/QcConsole';
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
import { AdminCommandPalette } from '@/components/admin/AdminCommandPalette';
import { 
  Home, ShoppingCart, Package, Users, BarChart3, Megaphone, 
  Tag, Settings, Palette, SlidersHorizontal, Bell, MessageSquare, 
  ShieldCheck, FileText, Headphones, Hammer, ClipboardCheck, Briefcase, HelpCircle, LogOut, Search, 
  ExternalLink, Menu, X, ChevronRight, PanelLeftClose, PanelLeftOpen, 
  Lock, ArrowLeft, KeyRound
} from 'lucide-react';
import { toast } from 'sonner';

type AdminTab = AdminTabId;

function AdminShell({ role, displayName, onSignOut }: { role: StaffRole; displayName: string; onSignOut: () => void }) {
  const { orders, products } = useAdminData();
  const [activeTab, setActiveTab] = useState<AdminTab>('home');
  const allowed = (tab: AdminTab) => canAccessTab(role, tab);
  const selectTab = (tab: AdminTab) => { if (allowed(tab)) setActiveTab(tab); };

  // Ergonomic UI States
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return safeLocal.get('vernox-admin-sidebar-collapsed') === 'true';
  });
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Keyboard shortcut listener for universal Ctrl+K / ⌘K Spotlight search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileDrawerOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isMobileDrawerOpen]);

  // Real-time Operational Telemetry Badges
  const pendingOrdersCount = useMemo(() => {
    return orders.filter(o => o.status === 'Paid' || o.status === 'In_Design').length;
  }, [orders]);

  const customOrdersCount = useMemo(() => {
    return orders.filter(o => o.items?.some(i => i.customDesignRef || i.userUploadedImage || i.productId === 'custom-bespoke')).length;
  }, [orders]);

  const lowStockCount = useMemo(() => {
    return products.filter(p => (p.stock ?? 0) <= 5).length;
  }, [products]);

  const urgentAlertsCount = useMemo(() => {
    const outStock = products.filter(p => (p.stock ?? 0) === 0).length;
    const lowStock = products.filter(p => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5).length;
    const pending = orders.filter(o => o.status === 'Paid').length;
    return outStock + lowStock + pending;
  }, [products, orders]);

  // Navigation Items Structure (Luxury Atelier Aesthetic)
  const primaryNavigation = [
    { id: 'home' as AdminTab, label: 'Home', icon: Home },
    { 
      id: 'orders' as AdminTab, 
      label: 'Orders', 
      icon: ShoppingCart, 
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
      badgeColor: 'bg-[#5B262C] text-[#FDE8EC] border border-[#85343D]'
    },
    { 
      id: 'products' as AdminTab, 
      label: 'Products', 
      icon: Package, 
      badge: lowStockCount > 0 ? `${lowStockCount} low` : undefined,
      badgeColor: 'bg-[#3D2817] text-[#E8A34E] border border-[#855324]/60'
    },
    { id: 'production' as AdminTab, label: 'Production', icon: Hammer },
    { id: 'qc' as AdminTab, label: 'QC & Packing', icon: ClipboardCheck },
    { id: 'support' as AdminTab, label: 'Support', icon: Headphones },
    { id: 'b2b' as AdminTab, label: 'Trade Enquiries', icon: Briefcase },
    { id: 'customers' as AdminTab, label: 'Customers', icon: Users },
    { id: 'analytics' as AdminTab, label: 'Analytics', icon: BarChart3 },
    { id: 'marketing' as AdminTab, label: 'Marketing', icon: Megaphone },
    { id: 'coupons' as AdminTab, label: 'Discounts', icon: Tag },
  ];

  const secondaryNavigation = [
    { 
      id: 'custom-orders' as AdminTab, 
      label: 'Custom CAM', 
      icon: Palette,
      badge: customOrdersCount > 0 ? `${customOrdersCount}` : undefined,
      badgeColor: 'bg-[#2D2315] text-[#D4AF37] border border-[#8C6D23]/60'
    },
    { id: 'hero-slider' as AdminTab, label: 'Hero Sliders', icon: SlidersHorizontal },
    { id: 'reviews' as AdminTab, label: 'Reviews', icon: MessageSquare },
    { 
      id: 'notifications' as AdminTab, 
      label: 'Notifications', 
      icon: Bell, 
      badge: urgentAlertsCount > 0 ? urgentAlertsCount : undefined,
      badgeColor: 'bg-[#3D2527] text-[#E5A8B2] border border-[#5B262C]/60'
    },
    { id: 'roles' as AdminTab, label: 'Team', icon: ShieldCheck },
    { id: 'audit' as AdminTab, label: 'Activity Log', icon: FileText },
  ];

  const visiblePrimary = primaryNavigation.filter(t => allowed(t.id));
  const visibleSecondary = secondaryNavigation.filter(t => allowed(t.id));
  const allNavItems = [...primaryNavigation, ...secondaryNavigation, { id: 'settings' as AdminTab, label: 'Settings', icon: Settings }];
  const currentTabInfo = allNavItems.find(item => item.id === activeTab);

  // 2. Authenticated Admin Dashboard Workspace (Vernox Luxury Theme)
  return (
    <div className="h-screen h-[100dvh] bg-[#F7F4EE] text-[#1C1615] flex flex-col overflow-hidden">
      {/* Universal Command Palette (⌘K) Modal */}
      <AdminCommandPalette 
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTab={(tab) => {
          selectTab(tab as AdminTab);
          setIsCommandPaletteOpen(false);
        }}
        onSelectOrder={() => {
          selectTab('orders');
          setIsCommandPaletteOpen(false);
        }}
        onSelectProduct={() => {
          selectTab('products');
          setIsCommandPaletteOpen(false);
        }}
      />

      {/* Top Header Bar matching Vernox Luxury Aesthetic */}
      <header className="h-16 bg-[#1C1615] text-[#E8DFD3] border-b border-[#2E2421] flex items-center justify-between px-4 sm:px-6 relative z-20 shrink-0">
        <div className="flex items-center gap-3">
          {/* Mobile Navigation Drawer Toggle */}
          <button
            onClick={() => setIsMobileDrawerOpen(true)}
            className="md:hidden p-2 rounded-lg border border-[#2E2421] text-[#A8988E] hover:text-white hover:bg-[#2A211E] transition"
            title="Open Navigation"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Desktop Sidebar Toggle Button */}
          <button
            onClick={() => {
              setIsSidebarCollapsed(prev => {
                const next = !prev;
                safeLocal.set('vernox-admin-sidebar-collapsed', String(next));
                return next;
              });
            }}
            className="hidden md:flex p-2 rounded-lg border border-[#2E2421] text-[#A8988E] hover:text-white hover:bg-[#2A211E] transition items-center justify-center"
            title={isSidebarCollapsed ? "Open Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4 text-brass" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>

          {/* Vernox Heraldic Monogram Mark */}
          <div className="w-8 h-8 rounded-lg bg-oxblood border border-brass/40 flex items-center justify-center text-ivory font-display font-bold text-sm shadow-soft shrink-0">
            V
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-base sm:text-lg text-[#F8F4E7] font-bold tracking-tight">
                Vernox Atelier Portal
              </h1>
            </div>
            <div className="text-[10px] text-[#A8988E] flex items-center gap-1 mt-0.5">
              <span>Operations Console</span>
              <ChevronRight className="w-2.5 h-2.5 text-[#A8988E]/60" />
              <span className="font-semibold text-brass">
                {currentTabInfo?.label || 'Orders'}
              </span>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Universal Search (⌘K) */}
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#2E2421] bg-[#120D0C] hover:bg-[#241A18] text-xs text-[#A8988E] hover:text-white transition shadow-2xs group"
            title="Search (Ctrl+K or ⌘K)"
          >
            <Search className="w-3.5 h-3.5 text-brass group-hover:text-brass" />
            <span className="hidden sm:inline">Spotlight search</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 font-mono text-[10px] bg-[#1C1615] px-1.5 py-0.5 rounded border border-[#2E2421] text-[#D8CDC4]">
              ⌘K
            </kbd>
          </button>

          {/* Concierge Support */}
          <a
            href="mailto:concierge@vernoxatelier.com"
            title="Concierge & Support"
            className="p-2 rounded-lg text-[#A8988E] hover:text-white hover:bg-[#2A211E] transition"
          >
            <Headphones className="w-4 h-4" />
          </a>

          {/* Help & Audit Log */}
          <button
            onClick={() => selectTab('audit')}
            title="Activity Log & System Audit"
            className="p-2 rounded-lg text-[#A8988E] hover:text-white hover:bg-[#2A211E] transition"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Notification Bell */}
          <button
            onClick={() => selectTab('notifications')}
            className="relative p-2 rounded-lg text-[#A8988E] hover:text-white hover:bg-[#2A211E] transition"
            title="Operational Notifications"
          >
            <Bell className="w-4 h-4" />
            {urgentAlertsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-oxblood ring-2 ring-[#1C1615]" />
            )}
          </button>

          <div className="h-4 w-px bg-[#2E2421] mx-1" />

          {/* Storefront Link */}
          <Link 
            to="/" 
            className="text-xs font-medium text-[#A8988E] hover:text-[#F8F4E7] hidden lg:inline-flex items-center gap-1.5 transition"
          >
            Storefront <ExternalLink className="w-3 h-3 text-brass" />
          </Link>

          {/* Profile Avatar */}
          <div className="flex items-center gap-2 pl-1">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-brass/40 shadow-2xs bg-oxblood text-ivory shrink-0 flex items-center justify-center font-bold text-xs">
              {displayName.charAt(0).toUpperCase() || 'V'}
            </div>

            <button
              onClick={() => {
                onSignOut();
              }}
              title="Sign Out"
              className="p-1.5 text-[#A8988E] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout: Luxury Obsidian Sidebar & Content Viewport */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Desktop Sidebar Navigation (Charcoal Obsidian & Warm Brass) */}
        <aside 
          className={`bg-[#181211] text-[#E8DFD3] border-r border-[#2A1F1C] transition-all duration-200 shrink-0 hidden md:flex flex-col justify-between h-full select-none ${
            isSidebarCollapsed ? 'w-16' : 'w-60'
          }`}
        >
          {/* Top Section of Sidebar */}
          <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0 font-sans">
            {/* Primary Section Header */}
            {!isSidebarCollapsed && (
              <div className="px-3 pt-1 pb-1">
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#9E8E84] font-semibold">
                  Atelier Console
                </span>
              </div>
            )}

            {/* Primary Navigation */}
            <nav className="flex flex-col gap-1">
              {visiblePrimary.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.label}
                    className={`flex items-center gap-3 px-3 py-2 text-[13px] rounded-xl transition-all duration-150 font-sans font-medium whitespace-nowrap group relative w-full ${
                      isActive 
                        ? 'bg-gradient-to-r from-[#5B262C] via-[#481D23] to-[#36161A] text-[#FAF6EE] font-semibold border border-brass/35 shadow-[0_2px_8px_rgba(0,0,0,0.35)]' 
                        : 'text-[#B8AAA0] hover:text-[#FAF6EE] hover:bg-[#261B18]/70 border border-transparent'
                    } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-brass shadow-[0_0_8px_rgba(198,161,91,0.6)]" />
                    )}

                    <Icon className={`w-4 h-4 shrink-0 transition-transform duration-150 group-hover:scale-105 ${
                      isActive ? 'text-brass drop-shadow-[0_0_5px_rgba(198,161,91,0.5)]' : 'text-[#9E8E84] group-hover:text-brass'
                    }`} />
                    
                    {!isSidebarCollapsed && (
                      <span className="truncate flex-1 text-left tracking-[0.015em]">{tab.label}</span>
                    )}

                    {tab.badge && !isSidebarCollapsed && (
                      <span className={`min-w-[20px] h-[18px] px-1.5 flex items-center justify-center rounded-full text-[10px] font-mono font-bold leading-none shrink-0 ${tab.badgeColor}`}>
                        {tab.badge}
                      </span>
                    )}

                    {tab.badge && isSidebarCollapsed && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brass ring-2 ring-[#181211]" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Atelier Craftsmanship Secondary Nav */}
            <div className="pt-3 border-t border-[#2A1F1C]">
              {!isSidebarCollapsed && (
                <div className="px-3 pb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#9E8E84] font-semibold">
                    Fabrication & System
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-[#3D2C27] to-transparent ml-2.5" />
                </div>
              )}
              <nav className="flex flex-col gap-1">
                {visibleSecondary.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      title={tab.label}
                      className={`flex items-center gap-3 px-3 py-1.5 text-xs rounded-xl transition-all duration-150 font-sans font-medium whitespace-nowrap group relative w-full ${
                        isActive 
                          ? 'bg-gradient-to-r from-[#5B262C] via-[#481D23] to-[#36161A] text-[#FAF6EE] font-semibold border border-brass/35 shadow-[0_2px_8px_rgba(0,0,0,0.35)]' 
                          : 'text-[#B8AAA0] hover:text-[#FAF6EE] hover:bg-[#261B18]/70 border border-transparent'
                      } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-brass shadow-[0_0_8px_rgba(198,161,91,0.6)]" />
                      )}

                      <Icon className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 group-hover:scale-105 ${
                        isActive ? 'text-brass drop-shadow-[0_0_5px_rgba(198,161,91,0.5)]' : 'text-[#9E8E84] group-hover:text-brass'
                      }`} />
                      {!isSidebarCollapsed && (
                        <span className="truncate flex-1 text-left tracking-[0.015em]">{tab.label}</span>
                      )}
                      {tab.badge && !isSidebarCollapsed && (
                        <span className={`min-w-[20px] h-[18px] px-1.5 flex items-center justify-center rounded-full text-[10px] font-mono font-bold leading-none shrink-0 ${tab.badgeColor}`}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Bottom Settings Link & Laser Status Widget */}
          <div className="p-3 border-t border-[#2A1F1C] space-y-2 shrink-0 bg-[#140E0D]/60 font-sans">
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-3 px-3 py-2 text-[13px] rounded-xl transition-all duration-150 font-sans font-medium w-full relative ${
                activeTab === 'settings' 
                  ? 'bg-gradient-to-r from-[#5B262C] to-[#36161A] text-[#FAF6EE] font-semibold border border-brass/35 shadow-soft' 
                  : 'text-[#B8AAA0] hover:text-[#FAF6EE] hover:bg-[#261B18]/70 border border-transparent'
              } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
              title="Store Settings"
            >
              {activeTab === 'settings' && allowed('settings') && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-brass shadow-[0_0_8px_rgba(198,161,91,0.6)]" />
              )}
              <Settings className={`w-4 h-4 shrink-0 transition-transform duration-150 group-hover:rotate-45 ${activeTab === 'settings' ? 'text-brass drop-shadow-[0_0_5px_rgba(198,161,91,0.5)]' : 'text-[#9E8E84] group-hover:text-brass'}`} />
              {!isSidebarCollapsed && (
                <span className="truncate flex-1 text-left tracking-[0.015em]">Settings</span>
              )}
            </button>

            {!isSidebarCollapsed && (
              <div className="px-2.5 py-1.5 rounded-lg bg-[#0F0A09] border border-[#261B18] flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brass opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-brass"></span>
                  </span>
                  <span className="font-mono text-[#A8988E] truncate">Laser CAM Engine</span>
                </div>
                <span className="font-mono text-[9px] font-semibold text-brass shrink-0 bg-brass/10 px-1.5 py-0.5 rounded border border-brass/20">3kW Fiber</span>
              </div>
            )}
          </div>
        </aside>

        {/* Content Viewport */}
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 sm:p-6 md:p-8 bg-[#FAF7F2] text-[#1C1615]">
          {activeTab === 'home' && allowed('home') && (
            <RoleHome role={role} onSelectTab={selectTab} />
          )}

          {activeTab === 'analytics' && allowed('analytics') && <MetricsDashboard />}

          {activeTab === 'production' && allowed('production') && <ProductionConsole />}
          {activeTab === 'qc' && allowed('qc') && <QcConsole />}
          {activeTab === 'support' && allowed('support') && <SupportConsole />}
          {activeTab === 'b2b' && allowed('b2b') && <B2bInquiries />}

          {activeTab === 'orders' && allowed('orders') && (
            <AdminOrders onSelectTab={(tab) => selectTab(tab as AdminTab)} />
          )}

          {activeTab === 'products' && allowed('products') && (
            <AdminProducts />
          )}

          {activeTab === 'customers' && allowed('customers') && (
            <AdminCustomers />
          )}

          {activeTab === 'marketing' && allowed('marketing') && (
            <AdminCoupons />
          )}

          {activeTab === 'coupons' && allowed('coupons') && (
            <AdminCoupons />
          )}

          {activeTab === 'custom-orders' && allowed('custom-orders') && (
            <AdminOrders initialFilter="custom" onSelectTab={(tab) => selectTab(tab as AdminTab)} />
          )}

          {activeTab === 'hero-slider' && allowed('hero-slider') && (
            <AdminHeroSlider />
          )}

          {activeTab === 'reviews' && allowed('reviews') && (
            <AdminReviews />
          )}

          {activeTab === 'notifications' && allowed('notifications') && (
            <AdminNotifications onSelectTab={(tab) => selectTab(tab as AdminTab)} />
          )}

          {activeTab === 'roles' && allowed('roles') && (
            <AdminRoles />
          )}

          {activeTab === 'audit' && allowed('audit') && (
            <AdminAuditLogs />
          )}

          {activeTab === 'settings' && allowed('settings') && (
            <AdminSettings />
          )}
        </main>
      </div>

      {/* Mobile Navigation Drawer */}
      {isMobileDrawerOpen && createPortal(
        <div 
          className="fixed inset-0 z-[9995] bg-black/75 backdrop-blur-sm animate-fade-in md:hidden"
          onClick={() => setIsMobileDrawerOpen(false)}
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="fixed inset-y-0 left-0 w-72 bg-[#1C1615] text-[#E8DFD3] border-r border-[#2E2421] p-4 flex flex-col justify-between shadow-2xl animate-in slide-in-from-left duration-200 z-[9996]"
          >
            <div className="space-y-4 overflow-y-auto">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#2E2421]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-oxblood text-ivory font-display font-bold flex items-center justify-center text-xs">
                    V
                  </div>
                  <span className="font-display text-base text-[#F8F4E7] font-bold">
                    Vernox Atelier
                  </span>
                </div>
                <button 
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="p-1.5 rounded-md text-[#A8988E] hover:text-white hover:bg-[#2A211E]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Navigation Items */}
              <nav className="flex flex-col gap-1 font-sans">
                {allNavItems.filter(tab => allowed(tab.id)).map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setIsMobileDrawerOpen(false);
                      }}
                      className={`flex items-center gap-3 px-3 py-2 text-[13px] rounded-xl transition-all duration-150 font-sans font-medium w-full text-left relative ${
                        isActive 
                          ? 'bg-gradient-to-r from-[#5B262C] via-[#481D23] to-[#36161A] text-[#FAF6EE] font-semibold border border-brass/35 shadow-[0_2px_8px_rgba(0,0,0,0.35)]' 
                          : 'text-[#B8AAA0] hover:text-[#FAF6EE] hover:bg-[#261B18]/70 border border-transparent'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-brass shadow-[0_0_8px_rgba(198,161,91,0.6)]" />
                      )}
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-brass drop-shadow-[0_0_5px_rgba(198,161,91,0.5)]' : 'text-[#9E8E84]'}`} />
                      <span className="truncate flex-1 tracking-[0.015em]">{tab.label}</span>
                      {tab.badge && (
                        <span className={`min-w-[20px] h-[18px] px-1.5 flex items-center justify-center rounded-full text-[10px] font-mono font-bold leading-none shrink-0 ${tab.badgeColor}`}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Drawer Footer User Info */}
            <div className="pt-3 border-t border-[#2E2421] mt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-oxblood/20 border border-brass/40 flex items-center justify-center font-bold text-xs text-brass shrink-0">
                    {displayName.charAt(0).toUpperCase() || 'V'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate text-[#F8F4E7]">
                      {displayName || 'Staff'}
                    </div>
                    <div className="text-[10px] font-mono text-[#A8988E] truncate">
                      {formatRole(role)}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onSignOut();
                  }}
                  className="p-1.5 text-[#A8988E] hover:text-red-400 rounded-md transition"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function AdminLogin() {
  const { staffSignIn, user, signOut } = useAuth();
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim() || !adminPassword) {
      toast.error('Please enter both email and password');
      return;
    }
    setIsAuthenticating(true);
    try {
      await staffSignIn(adminEmail.trim(), adminPassword);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error(message.includes('staff access') ? message : 'Invalid credentials');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Signed in as a customer: explain instead of showing a form that cannot succeed.
  if (user) {
    return (
      <div className="min-h-screen bg-[#140F0E] text-[#E8DFD3] flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-[#1C1615] border border-[#2E2421] rounded-2xl p-8 space-y-4 text-center">
          <Lock className="w-6 h-6 text-brass mx-auto" />
          <h1 className="font-display text-xl font-bold text-[#F8F4E7]">No staff access</h1>
          <p className="text-xs text-[#A8988E]">{user.email} is not a staff account. Sign out to use a different account.</p>
          <button onClick={() => signOut()} className="bg-oxblood hover:bg-oxblood-deep text-ivory font-semibold py-2 px-4 rounded-xl text-sm transition">Sign out</button>
          <div><Link to="/" className="text-xs text-[#A8988E] hover:text-[#F8F4E7]">Return to storefront</Link></div>
        </div>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-[#140F0E] text-[#E8DFD3] flex flex-col justify-center items-center p-4 selection:bg-oxblood selection:text-ivory">
        <div className="w-full max-w-md bg-[#1C1615] border border-[#2E2421] rounded-2xl p-8 shadow-2xl space-y-6 animate-scale-in">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-oxblood/20 border border-oxblood/40 flex items-center justify-center mx-auto text-brass mb-3 shadow-soft">
              <Lock className="w-6 h-6 text-brass" />
            </div>
            <h1 className="font-display text-2xl font-bold text-[#F8F4E7]">Vernox Atelier Portal</h1>
            <p className="text-xs text-[#A8988E] leading-relaxed font-serif-italic">
              Administrative gateway for bespoke architectural commissions, CAM production routing, patron intelligence, and atelier analytics.
            </p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#C4B7AC]">Administrator Email</label>
              <input 
                type="email"
                required
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-[#120D0C] border border-[#2E2421] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-oxblood focus:ring-1 focus:ring-oxblood transition text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#C4B7AC]">Password</label>
              <input 
                type="password"
                required
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-[#120D0C] border border-[#2E2421] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-oxblood focus:ring-1 focus:ring-oxblood transition text-white"
              />
            </div>

            <button 
              type="submit"
              disabled={isAuthenticating}
              className="w-full bg-oxblood hover:bg-oxblood-deep text-ivory font-semibold py-2.5 rounded-xl text-sm transition shadow-soft disabled:opacity-50 mt-2 border border-oxblood/50"
            >
              {isAuthenticating ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-[#2E2421]">
            <Link to="/" className="text-xs text-[#A8988E] hover:text-[#F8F4E7] inline-flex items-center gap-1 transition">
              <ArrowLeft className="w-3 h-3" /> Return to Vernox Storefront
            </Link>
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
    return <div className="min-h-screen bg-[#140F0E] flex items-center justify-center text-[#A8988E] text-sm">Checking access…</div>;
  }
  if (!staffRole) return <AdminLogin />;

  const displayName = profile?.name || user?.displayName || user?.email || '';
  return <AdminShell role={staffRole} displayName={displayName} onSignOut={() => { void signOut(); toast.success('Signed out'); }} />;
}
