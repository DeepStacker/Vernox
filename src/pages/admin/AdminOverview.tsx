/**
 * Vernox Atelier Performance Intelligence Dashboard
 * Comprehensive operational telemetry & financial analytics dashboard:
 * - Storefront & Fabrication Telemetry (15 interactive metric cards)
 * - Executive Financial & Profitability Suite: EBITDA, PAT, EBIT, PBT, Gross Margin, OpEx, P&L Waterfall
 * - 24h-to-90d live filters, interactive metric card deep-dives, and granular time series inspection.
 * Styled in the Vernox Atelier Luxury Palette: Oxblood, Champagne Brass, Warm Cream, and Obsidian.
 */

import { useState, useMemo, useEffect } from 'react';
import { useAdminData } from '@/lib/data/adminData';
import { isRevenueStatus } from '@/lib/orders/orderStateMachine';
import type { Order } from '@/types/store';
import { computeOverviewMetrics, OverviewMetrics } from '@/lib/storeAnalytics';
import { 
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip as ChartTooltip, CartesianGrid 
} from 'recharts';
import { 
  ChevronLeft, Calendar, HelpCircle, ArrowUp, ArrowDown, 
  Sparkles, TrendingUp, Maximize2, X, Download,
  BarChart3, LineChart as LineChartIcon, Layers,
  DollarSign, PieChart, Coins, Building2, Percent,
  Receipt, Landmark, Calculator
} from 'lucide-react';

interface AdminOverviewProps {
  onSelectTab: (tab: string) => void;
  onSelectOrder?: (order: Order) => void;
  initialViewMode?: AnalyticsViewMode;
}

type DateRangeKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'last90' | 'ytd';
type AnalyticsViewMode = 'operations' | 'financials';

interface MetricDetailConfig {
  key: string;
  title: string;
  subtitle: string;
  currentValueFormatted: string;
  previousValueFormatted: string;
  percentChange: number;
  badgeIsPercent?: boolean;
  valueFormatter: (val: number) => string;
  currentSeriesKey: string;
  previousSeriesKey: string;
  currentSeriesName: string;
  previousSeriesName: string;
  secondarySeriesKey?: string;
  secondarySeriesName?: string;
  isStacked?: boolean;
}

export function AdminOverview({ onSelectTab, initialViewMode = 'financials' }: AdminOverviewProps) {
  const { orders: allOrders, products, customers, storeConfig, hasMoreOrders, loadMoreOrders, isLoadingMoreOrders, ordersError } = useAdminData();
  const orders = useMemo(() => allOrders.filter(o => isRevenueStatus(o.status)), [allOrders]);

  const [dateRange, setDateRange] = useState<DateRangeKey>('today');
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(initialViewMode);
  const [inspectingMetricKey, setInspectingMetricKey] = useState<string | null>(null);
  const [detailChartType, setDetailChartType] = useState<'area' | 'line' | 'bar'>('area');

  // Synchronize viewMode whenever initialViewMode prop updates
  useEffect(() => {
    if (initialViewMode) {
      setViewMode(initialViewMode);
    }
  }, [initialViewMode]);

  // Compute metrics in real-time
  const metrics: OverviewMetrics = useMemo(() => {
    return computeOverviewMetrics(orders, products, customers, dateRange);
  }, [orders, products, customers, dateRange]);

  const currency = storeConfig.currency || '₹';

  const formatCurrency = (val: number) => {
    return `${currency}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const renderBadge = (val: number, isPercent = true) => {
    const isPositive = val >= 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isPositive ? 'text-[#1D5E37]' : 'text-[#B91C1C]'}`}>
        {isPositive ? <ArrowUp className="w-3 h-3 stroke-[2.5]" /> : <ArrowDown className="w-3 h-3 stroke-[2.5]" />}
        {Math.abs(val)}%{isPercent ? '' : ''}
      </span>
    );
  };

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInspectingMetricKey(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter ranges definition
  const filterOptions: Array<{ id: DateRangeKey; label: string; periodLabel: string }> = [
    { id: 'today', label: '24h (Today)', periodLabel: 'Previous 24 Hours' },
    { id: 'yesterday', label: 'Yesterday', periodLabel: 'Day Prior' },
    { id: 'last7', label: 'Last 7 Days', periodLabel: 'Prior 7 Days' },
    { id: 'last30', label: 'Last 30 Days', periodLabel: 'Prior 30 Days' },
    { id: 'last90', label: 'Last 90 Days', periodLabel: 'Prior 90 Days' },
    { id: 'ytd', label: 'Year to Date', periodLabel: 'Prior Year Cycle' },
  ];

  // Inspecting Metric Resolution (supporting Storefront & Financial metrics)
  const activeMetricConfig: MetricDetailConfig | null = useMemo(() => {
    if (!inspectingMetricKey) return null;

    switch (inspectingMetricKey) {
      // Financial Metrics
      case 'ebitda':
        return {
          key: 'ebitda',
          title: 'EBITDA (Earnings Before Interest, Taxes, D&A)',
          subtitle: 'Core operational cash profitability prior to capital financing charges, laser asset depreciation, and corporate taxes.',
          currentValueFormatted: `${formatCurrency(metrics.financials.ebitda.current)} (${metrics.financials.ebitda.marginPercent}%)`,
          previousValueFormatted: formatCurrency(metrics.financials.ebitda.previous),
          percentChange: metrics.financials.ebitda.percentChange,
          valueFormatter: (v) => formatCurrency(v),
          currentSeriesKey: 'ebitda',
          previousSeriesKey: 'prevEbitda',
          currentSeriesName: 'Current EBITDA',
          previousSeriesName: 'Prior Period EBITDA',
        };
      case 'pat':
        return {
          key: 'pat',
          title: 'PAT (Profit After Tax / Net Bottom Line)',
          subtitle: 'Net bottom-line profits retained by the atelier after all substrate COGS, facility overhead, equipment depreciation, and 18% tax provisions.',
          currentValueFormatted: `${formatCurrency(metrics.financials.pat.current)} (${metrics.financials.pat.marginPercent}%)`,
          previousValueFormatted: formatCurrency(metrics.financials.pat.previous),
          percentChange: metrics.financials.pat.percentChange,
          valueFormatter: (v) => formatCurrency(v),
          currentSeriesKey: 'pat',
          previousSeriesKey: 'prevPat',
          currentSeriesName: 'Current Net PAT',
          previousSeriesName: 'Prior Period PAT',
        };
      case 'grossProfit':
        return {
          key: 'grossProfit',
          title: 'Gross Fabrication Profit',
          subtitle: 'Gross revenue less raw substrate metals, argon assist gas, and artisan edge-finishing labor.',
          currentValueFormatted: `${formatCurrency(metrics.financials.grossProfit.current)} (${metrics.financials.grossProfit.marginPercent}%)`,
          previousValueFormatted: formatCurrency(metrics.financials.grossProfit.previous),
          percentChange: metrics.financials.grossProfit.percentChange,
          valueFormatter: (v) => formatCurrency(v),
          currentSeriesKey: 'grossProfit',
          previousSeriesKey: 'grossProfit',
          currentSeriesName: 'Gross Profit',
          previousSeriesName: 'Prior Period Gross Profit',
        };
      case 'cogs':
        return {
          key: 'cogs',
          title: 'Cost of Goods Sold (COGS)',
          subtitle: 'Direct manufacturing costs: CZ108 architectural brass, corten weathering alloy, high-purity laser gas, and deburring labor.',
          currentValueFormatted: `${formatCurrency(metrics.financials.cogs.current)} (${metrics.financials.cogs.marginPercent}%)`,
          previousValueFormatted: formatCurrency(metrics.financials.cogs.previous),
          percentChange: metrics.financials.cogs.percentChange,
          valueFormatter: (v) => formatCurrency(v),
          currentSeriesKey: 'cogs',
          previousSeriesKey: 'cogs',
          currentSeriesName: 'Fabrication COGS',
          previousSeriesName: 'Prior Period COGS',
        };
      case 'opex':
        return {
          key: 'opex',
          title: 'Operating Expenses (OpEx)',
          subtitle: 'Facility high-voltage 3-phase power, custom wooden crating logistics, architectural invitations, and CAD software infrastructure.',
          currentValueFormatted: formatCurrency(metrics.financials.opex.current),
          previousValueFormatted: formatCurrency(metrics.financials.opex.previous),
          percentChange: metrics.financials.opex.percentChange,
          valueFormatter: (v) => formatCurrency(v),
          currentSeriesKey: 'opex',
          previousSeriesKey: 'opex',
          currentSeriesName: 'Atelier OpEx',
          previousSeriesName: 'Prior OpEx',
        };
      case 'ebit':
        return {
          key: 'ebit',
          title: 'EBIT (Operating Earnings)',
          subtitle: 'Earnings before interest and tax, reflecting operating performance after 3kW fiber laser cutter depreciation.',
          currentValueFormatted: `${formatCurrency(metrics.financials.ebit.current)} (${metrics.financials.ebit.marginPercent}%)`,
          previousValueFormatted: formatCurrency(metrics.financials.ebit.previous),
          percentChange: metrics.financials.ebit.percentChange,
          valueFormatter: (v) => formatCurrency(v),
          currentSeriesKey: 'ebit',
          previousSeriesKey: 'ebit',
          currentSeriesName: 'Operating EBIT',
          previousSeriesName: 'Prior EBIT',
        };

      // Storefront & Traffic Metrics
      case 'totalSales':
        return {
          key: 'totalSales',
          title: 'Total Commission Revenue',
          subtitle: 'Cumulative acquisition volume across online commissions and bespoke concierge inquiries.',
          currentValueFormatted: formatCurrency(metrics.totalSales.current),
          previousValueFormatted: formatCurrency(metrics.totalSales.previous),
          percentChange: metrics.totalSales.percentChange,
          valueFormatter: (v) => formatCurrency(v),
          currentSeriesKey: 'currentSales',
          previousSeriesKey: 'previousSales',
          currentSeriesName: 'Current Commission Value',
          previousSeriesName: 'Prior Period Value',
        };
      case 'totalVisitors':
        return {
          key: 'totalVisitors',
          title: 'Atelier Patron Footfall',
          subtitle: 'Active unique prospective patron sessions exploring the bespoke design studio and collections.',
          currentValueFormatted: `${metrics.totalVisitors.current.toLocaleString()} Patrons`,
          previousValueFormatted: `${metrics.totalVisitors.previous.toLocaleString()} Patrons`,
          percentChange: metrics.totalVisitors.percentChange,
          valueFormatter: (v) => `${Math.round(v).toLocaleString()} Patrons`,
          currentSeriesKey: 'currentVisitors',
          previousSeriesKey: 'previousVisitors',
          currentSeriesName: 'Active Patrons',
          previousSeriesName: 'Prior Period Patrons',
        };
      case 'repeatCustomerRate':
        return {
          key: 'repeatCustomerRate',
          title: 'Returning Patron Ratio & Demographic Split',
          subtitle: 'Rate of established luxury patrons commissioning subsequent bespoke architectural works.',
          currentValueFormatted: `${metrics.repeatCustomerRate.current}%`,
          previousValueFormatted: `${metrics.repeatCustomerRate.previous}%`,
          percentChange: metrics.repeatCustomerRate.percentChange,
          valueFormatter: (v) => `${v} Patrons`,
          currentSeriesKey: 'returningCustomers',
          previousSeriesKey: 'firstTimeCustomers',
          currentSeriesName: 'Returning Patrons',
          previousSeriesName: 'New Patrons',
          isStacked: true,
        };
      case 'totalOrders':
        return {
          key: 'totalOrders',
          title: 'Commission Execution Volume',
          subtitle: 'Total bespoke commissions received, laser cut, and delivered across international residences.',
          currentValueFormatted: `${metrics.totalOrders.current} Commissions`,
          previousValueFormatted: `${metrics.totalOrders.previous} Commissions`,
          percentChange: metrics.totalOrders.percentChange,
          valueFormatter: (v) => `${v} Commissions`,
          currentSeriesKey: 'currentOrders',
          previousSeriesKey: 'previousOrders',
          currentSeriesName: 'Commissions Placed',
          previousSeriesName: 'Prior Period Volume',
        };
      case 'conversionRate':
        return {
          key: 'conversionRate',
          title: 'Atelier Acquisition Funnel Conversion Rate',
          subtitle: 'Percentage of gallery visitors who finalize spec consultations and deposit commitments.',
          currentValueFormatted: `${metrics.conversionRate.current}%`,
          previousValueFormatted: `${metrics.conversionRate.previous}%`,
          percentChange: metrics.conversionRate.percentChange,
          valueFormatter: (v) => `${v}%`,
          currentSeriesKey: 'currentVisitors',
          previousSeriesKey: 'currentOrders',
          currentSeriesName: 'Total Visitors',
          previousSeriesName: 'Converted Commissions',
        };
      case 'averageOrderValue':
        return {
          key: 'averageOrderValue',
          title: 'Average Order Value (AOV)',
          subtitle: 'Mean monetary allocation per commissioned metalwork installation.',
          currentValueFormatted: formatCurrency(metrics.averageOrderValue.current),
          previousValueFormatted: formatCurrency(metrics.averageOrderValue.previous),
          percentChange: metrics.averageOrderValue.percentChange,
          valueFormatter: (v) => formatCurrency(v),
          currentSeriesKey: 'currentAOV',
          previousSeriesKey: 'previousAOV',
          currentSeriesName: 'Current Cycle AOV',
          previousSeriesName: 'Prior Cycle AOV',
        };
      case 'campaignSales':
        return {
          key: 'campaignSales',
          title: 'Private Architectural Invitations Revenue',
          subtitle: 'Direct revenue attributed to exclusive architect concierge links and bespoke campaigns.',
          currentValueFormatted: formatCurrency(metrics.campaignSales.current),
          previousValueFormatted: formatCurrency(metrics.campaignSales.previous),
          percentChange: metrics.campaignSales.percentChange,
          valueFormatter: (v) => formatCurrency(v),
          currentSeriesKey: 'campaignSales',
          previousSeriesKey: 'previousSales',
          currentSeriesName: 'Campaign Attribution',
          previousSeriesName: 'Baseline Period',
        };
      default:
        return {
          key: inspectingMetricKey,
          title: 'Detailed Telemetry Inspection',
          subtitle: 'Granular progression breakdown over the active operational window.',
          currentValueFormatted: formatCurrency(metrics.totalSales.current),
          previousValueFormatted: formatCurrency(metrics.totalSales.previous),
          percentChange: metrics.totalSales.percentChange,
          valueFormatter: (v) => formatCurrency(v),
          currentSeriesKey: 'currentSales',
          previousSeriesKey: 'previousSales',
          currentSeriesName: 'Current',
          previousSeriesName: 'Prior',
        };
    }
  }, [inspectingMetricKey, metrics, currency]);

  // Deep-dive series data with computations
  const modalChartData = useMemo(() => {
    if (!activeMetricConfig) return [];
    return metrics.timeSeries.map(item => {
      const cur = Number((item as unknown as Record<string, number>)[activeMetricConfig.currentSeriesKey] || 0);
      const prev = Number((item as unknown as Record<string, number>)[activeMetricConfig.previousSeriesKey] || 0);
      const delta = cur - prev;
      const deltaPercent = prev > 0 ? Math.round((delta / prev) * 100 * 10) / 10 : (cur > 0 ? 100 : 0);
      return {
        timeLabel: item.timeLabel,
        current: cur,
        previous: prev,
        delta,
        deltaPercent
      };
    });
  }, [activeMetricConfig, metrics.timeSeries]);

  // Summary statistics for modal
  const modalStats = useMemo(() => {
    if (!modalChartData.length) return { peak: { val: 0, label: '-' }, lowest: { val: 0, label: '-' }, avg: 0, total: 0 };
    let peak = { val: -Infinity, label: '-' };
    let lowest = { val: Infinity, label: '-' };
    let sum = 0;

    modalChartData.forEach(d => {
      sum += d.current;
      if (d.current > peak.val) {
        peak = { val: d.current, label: d.timeLabel };
      }
      if (d.current < lowest.val) {
        lowest = { val: d.current, label: d.timeLabel };
      }
    });

    const avg = modalChartData.length > 0 ? Math.round((sum / modalChartData.length) * 100) / 100 : 0;
    return {
      peak: peak.val === -Infinity ? { val: 0, label: '-' } : peak,
      lowest: lowest.val === Infinity ? { val: 0, label: '-' } : lowest,
      avg,
      total: Math.round(sum * 100) / 100,
    };
  }, [modalChartData]);

  // CSV Exporter for inspected graph
  const handleExportCSV = () => {
    if (!activeMetricConfig || !modalChartData.length) return;
    const headers = ['Time Interval', activeMetricConfig.currentSeriesName, activeMetricConfig.previousSeriesName, 'Delta', 'Variance %'];
    const rows = modalChartData.map(d => [
      `"${d.timeLabel}"`,
      d.current,
      d.previous,
      d.delta,
      `"${d.deltaPercent}%"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `vernox_atelier_${activeMetricConfig.key}_${dateRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Exporter for Income Statement (P&L Waterfall)
  const handleExportPnLCSV = () => {
    const periodLabel = filterOptions.find(o => o.id === dateRange)?.label || dateRange;
    const rows = [
      ['Vernox Atelier Executive Income Statement (P&L)', `Period: ${periodLabel}`],
      ['Generated On', new Date().toLocaleString()],
      [''],
      ['Financial Line Item', 'Driver / Allocation Description', 'Current Period', 'Prior Period', 'Variance %', '% of Revenue'],
      ['Gross Commission Revenue', 'Total client acquisitions & studio custom pieces', metrics.financials.revenue.current, metrics.financials.revenue.previous, `${metrics.financials.revenue.percentChange}%`, '100.0%'],
      ['Less: Cost of Goods Sold (COGS)', 'Substrates (22%), Laser Argon Gas (6%), Artisan Finishing (5%)', -metrics.financials.cogs.current, -metrics.financials.cogs.previous, `${metrics.financials.cogs.percentChange}%`, '33.0%'],
      ['Gross Fabrication Profit', 'Direct fabrication margin after substrates & laser gas', metrics.financials.grossProfit.current, metrics.financials.grossProfit.previous, `${metrics.financials.grossProfit.percentChange}%`, `${metrics.financials.grossProfit.marginPercent}%`],
      ['Less: Operating Expenses (OpEx)', 'Facility power (6%), Crating logistics (5%), Marketing (8%), Studio CAD (4%)', -metrics.financials.opex.current, -metrics.financials.opex.previous, `${metrics.financials.opex.percentChange}%`, '23.0%'],
      ['EBITDA', 'Operating Cash Flow before D&A, interest, and taxes', metrics.financials.ebitda.current, metrics.financials.ebitda.previous, `${metrics.financials.ebitda.percentChange}%`, `${metrics.financials.ebitda.marginPercent}%`],
      ['Less: Depreciation & Amortization', '3kW Fiber laser cutter & optical collimator', -metrics.financials.depreciation.current, -metrics.financials.depreciation.previous, '0%', '3.5%'],
      ['EBIT (Operating Earnings)', 'Operating profit after asset depreciation', metrics.financials.ebit.current, metrics.financials.ebit.previous, `${metrics.financials.ebit.percentChange}%`, `${metrics.financials.ebit.marginPercent}%`],
      ['Less: Capital Lease Interest', 'Laser equipment capital facility financing', -metrics.financials.interestExpense.current, -metrics.financials.interestExpense.previous, '0%', '1.5%'],
      ['PBT (Profit Before Tax)', 'Taxable income prior to corporate provision', metrics.financials.pbt.current, metrics.financials.pbt.previous, `${metrics.financials.pbt.percentChange}%`, '39.0%'],
      ['Less: Corporate GST / Tax Provision', '18.0% effective tax provision', -metrics.financials.taxes.current, -metrics.financials.taxes.previous, '0%', '7.0%'],
      ['PAT (Profit After Tax / Net Bottom Line)', 'Final net profit retained by Vernox Atelier', metrics.financials.pat.current, metrics.financials.pat.previous, `${metrics.financials.pat.percentChange}%`, `${metrics.financials.pat.marginPercent}%`],
    ];
    const csvContent = rows.map(e => e.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `vernox_atelier_pnl_${dateRange}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in max-w-[1440px] mx-auto">
      {ordersError && (
        <div role="alert" className="border border-destructive/30 bg-destructive/5 text-destructive text-xs rounded p-3">
          Orders could not be loaded, so these figures are incomplete: {ordersError.message}
        </div>
      )}
      {hasMoreOrders && (
        <div className="flex items-center justify-between gap-3 border border-border/60 bg-muted/30 text-xs rounded p-3">
          <span className="text-muted-foreground">Figures cover the {allOrders.length} most recent orders loaded so far.</span>
          <button onClick={() => loadMoreOrders()} disabled={isLoadingMoreOrders}
            className="font-semibold text-oxblood hover:underline disabled:opacity-50">
            {isLoadingMoreOrders ? 'Loading…' : 'Load older orders'}
          </button>
        </div>
      )}
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="font-semibold text-brass">Vernox Atelier Executive Console</span>
            <span className="text-border">·</span>
            <button 
              onClick={() => onSelectTab('orders')} 
              className="hover:text-oxblood hover:underline text-[11px] font-sans text-muted-foreground"
            >
              Commissions Ledger →
            </button>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground tracking-tight">
              Atelier Intelligence & Financial Analytics
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-oxblood/10 border border-oxblood/20 text-oxblood text-[10px] font-bold uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-brass" /> Live P&L Telemetry
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time financial profitability (EBITDA, PAT, Gross Margin) & operational telemetry across all fabrication cycles.
          </p>
        </div>

        {/* Date Filter Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
          {/* Quick-toggle pill group */}
          <div className="flex flex-wrap items-center bg-card border border-border rounded-lg p-1 shadow-2xs gap-1">
            {filterOptions.map((opt) => {
              const active = dateRange === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setDateRange(opt.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    active 
                      ? 'bg-oxblood text-ivory shadow-xs font-semibold' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Fallback Select */}
          <div className="hidden lg:flex items-center bg-card border border-border rounded-lg shadow-2xs overflow-hidden text-xs">
            <div className="flex items-center gap-1.5 px-3 py-2 text-foreground font-medium bg-muted/20 border-r border-border">
              <Calendar className="w-3.5 h-3.5 text-brass" />
              <select 
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRangeKey)}
                className="bg-transparent outline-none cursor-pointer pr-1 font-semibold text-foreground font-display text-xs"
              >
                {filterOptions.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="px-3 py-2 text-muted-foreground text-[11px] font-serif italic">
              {filterOptions.find(o => o.id === dateRange)?.periodLabel}
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Suite Mode Switcher: Financials (EBITDA / PAT) vs Storefront Operations */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card border border-border rounded-xl p-2 shadow-2xs">
        <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('financials')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
              viewMode === 'financials'
                ? 'bg-oxblood text-ivory shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
            }`}
          >
            <Coins className="w-4 h-4 text-brass" />
            <span>Financials & Profitability (EBITDA / PAT)</span>
            <span className="px-1.5 py-0.2 rounded bg-brass/20 text-brass text-[9px] font-mono">P&L</span>
          </button>

          <button
            onClick={() => setViewMode('operations')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
              viewMode === 'operations'
                ? 'bg-oxblood text-ivory shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-brass" />
            <span>Storefront & Atelier Operations</span>
            <span className="px-1.5 py-0.2 rounded bg-white/10 text-muted-foreground text-[9px] font-mono">15 Cards</span>
          </button>
        </div>

        {/* Quick KPI Pulse Bar */}
        <div className="flex items-center gap-4 text-xs px-2">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-[11px]">EBITDA:</span>
            <span className="font-mono font-bold text-foreground">{formatCurrency(metrics.financials.ebitda.current)}</span>
            <span className="text-[10px] text-emerald-700 font-semibold">({metrics.financials.ebitda.marginPercent}%)</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-[11px]">PAT (Net):</span>
            <span className="font-mono font-bold text-oxblood">{formatCurrency(metrics.financials.pat.current)}</span>
            <span className="text-[10px] text-emerald-700 font-semibold">({metrics.financials.pat.marginPercent}%)</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW MODE 1: FINANCIALS & PROFITABILITY (EBITDA, PAT, EBIT, PBT, OPEX) */}
      {/* ========================================================================= */}
      {viewMode === 'financials' && (
        <div className="space-y-6 animate-fade-in">

          {/* Top 4 Executive Financial KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* EBITDA Card */}
            <div 
              onClick={() => setInspectingMetricKey('ebitda')}
              className="bg-card border border-border rounded-xl p-5 shadow-2xs hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground font-display flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-brass" />
                    <span>EBITDA (Operating Cash Flow)</span>
                  </span>
                  <span className="text-[10px] text-oxblood group-hover:underline font-medium flex items-center gap-0.5">
                    <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-foreground">
                    {formatCurrency(metrics.financials.ebitda.current)}
                  </span>
                  {renderBadge(metrics.financials.ebitda.percentChange)}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 pt-2 border-t border-border/40">
                  <span>EBITDA Margin:</span>
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50">
                    {metrics.financials.ebitda.marginPercent}% of rev
                  </span>
                </div>
              </div>
              <div className="mt-3 h-14 w-full pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.timeSeries}>
                    <defs>
                      <linearGradient id="ebitdaMiniGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#5B262C" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#5B262C" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="ebitda" stroke="#5B262C" strokeWidth={2} fill="url(#ebitdaMiniGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* PAT Card */}
            <div 
              onClick={() => setInspectingMetricKey('pat')}
              className="bg-card border border-border rounded-xl p-5 shadow-2xs hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground font-display flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5 text-oxblood" />
                    <span>PAT (Profit After Tax)</span>
                  </span>
                  <span className="text-[10px] text-oxblood group-hover:underline font-medium flex items-center gap-0.5">
                    <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-oxblood">
                    {formatCurrency(metrics.financials.pat.current)}
                  </span>
                  {renderBadge(metrics.financials.pat.percentChange)}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 pt-2 border-t border-border/40">
                  <span>Net Bottom Line:</span>
                  <span className="font-mono font-bold text-oxblood bg-oxblood/10 px-2 py-0.5 rounded border border-oxblood/20">
                    {metrics.financials.pat.marginPercent}% margin
                  </span>
                </div>
              </div>
              <div className="mt-3 h-14 w-full pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.timeSeries}>
                    <defs>
                      <linearGradient id="patMiniGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C6A15B" stopOpacity={0.5}/>
                        <stop offset="95%" stopColor="#C6A15B" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="pat" stroke="#C6A15B" strokeWidth={2} fill="url(#patMiniGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gross Profit Card */}
            <div 
              onClick={() => setInspectingMetricKey('grossProfit')}
              className="bg-card border border-border rounded-xl p-5 shadow-2xs hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground font-display flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-brass" />
                    <span>Gross Fabrication Profit</span>
                  </span>
                  <span className="text-[10px] text-oxblood group-hover:underline font-medium flex items-center gap-0.5">
                    <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-foreground">
                    {formatCurrency(metrics.financials.grossProfit.current)}
                  </span>
                  {renderBadge(metrics.financials.grossProfit.percentChange)}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 pt-2 border-t border-border/40">
                  <span>Gross Margin:</span>
                  <span className="font-mono font-bold text-foreground">
                    {metrics.financials.grossProfit.marginPercent}% of revenue
                  </span>
                </div>
              </div>
              <div className="mt-3 h-14 w-full pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.timeSeries}>
                    <Line type="monotone" dataKey="grossProfit" stroke="#5B262C" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* EBIT Card */}
            <div 
              onClick={() => setInspectingMetricKey('ebit')}
              className="bg-card border border-border rounded-xl p-5 shadow-2xs hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground font-display flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-brass" />
                    <span>EBIT (Operating Earnings)</span>
                  </span>
                  <span className="text-[10px] text-oxblood group-hover:underline font-medium flex items-center gap-0.5">
                    <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-foreground">
                    {formatCurrency(metrics.financials.ebit.current)}
                  </span>
                  {renderBadge(metrics.financials.ebit.percentChange)}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 pt-2 border-t border-border/40">
                  <span>Operating Margin:</span>
                  <span className="font-mono font-bold text-foreground">
                    {metrics.financials.ebit.marginPercent}% of revenue
                  </span>
                </div>
              </div>
              <div className="mt-3 h-14 w-full pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.timeSeries}>
                    <Line type="monotone" dataKey="ebit" stroke="#C6A15B" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* Granular Cost & Financial Component Grids */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            
            {/* Card 1: COGS Breakdown (Cost of Goods Sold) */}
            <div 
              onClick={() => setInspectingMetricKey('cogs')}
              className="bg-card border border-border rounded-xl p-5 shadow-2xs hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground font-display flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-brass" />
                  <span>Cost of Goods Sold (COGS)</span>
                </span>
                <span className="text-[10px] text-oxblood group-hover:underline font-medium flex items-center gap-0.5">
                  <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-2xl font-bold font-mono text-foreground">
                  {formatCurrency(metrics.financials.cogs.current)}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  (33.0% of rev)
                </span>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-border/50 text-xs">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Raw Substrate Metals (CZ108 Brass & Steel)</span>
                  <span className="font-mono text-foreground font-semibold">
                    {formatCurrency(metrics.financials.cogs.rawMaterials)} (22%)
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Laser Assist Gas (Nitrogen/Argon & Nozzles)</span>
                  <span className="font-mono text-foreground font-semibold">
                    {formatCurrency(metrics.financials.cogs.laserConsumables)} (6%)
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Artisan Deburring, Polishing & Patina</span>
                  <span className="font-mono text-foreground font-semibold">
                    {formatCurrency(metrics.financials.cogs.finishingAndLabor)} (5%)
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: OpEx Breakdown (Operating Expenses) */}
            <div 
              onClick={() => setInspectingMetricKey('opex')}
              className="bg-card border border-border rounded-xl p-5 shadow-2xs hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground font-display flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-brass" />
                  <span>Operating Overhead (OpEx)</span>
                </span>
                <span className="text-[10px] text-oxblood group-hover:underline font-medium flex items-center gap-0.5">
                  <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-2xl font-bold font-mono text-foreground">
                  {formatCurrency(metrics.financials.opex.current)}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  (23.0% of rev)
                </span>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-border/50 text-xs">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Architectural VIP Previews & Marketing</span>
                  <span className="font-mono text-foreground font-semibold">
                    {formatCurrency(metrics.financials.opex.marketingAndInvitations)} (8%)
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Facility Grid Power, Argon Ventilation</span>
                  <span className="font-mono text-foreground font-semibold">
                    {formatCurrency(metrics.financials.opex.atelierFacilityAndEnergy)} (6%)
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>White-Glove Insured Logistics & Crating</span>
                  <span className="font-mono text-foreground font-semibold">
                    {formatCurrency(metrics.financials.opex.logisticsAndPackaging)} (5%)
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>General Studio CAD Software & Admin</span>
                  <span className="font-mono text-foreground font-semibold">
                    {formatCurrency(metrics.financials.opex.generalAdmin)} (4%)
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Capital Depreciation & Taxes */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground font-display flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5 text-brass" />
                    <span>D&A & Tax Provisions</span>
                  </span>
                </div>

                <div className="space-y-2.5 pt-1 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-border/40">
                    <span className="text-muted-foreground">3kW Fiber Laser Depreciation</span>
                    <span className="font-mono text-foreground font-semibold">
                      {formatCurrency(metrics.financials.depreciation.current)} (3.5%)
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Capital Equipment Interest</span>
                    <span className="font-mono text-foreground font-semibold">
                      {formatCurrency(metrics.financials.interestExpense.current)} (1.5%)
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-border/40">
                    <span className="text-muted-foreground">PBT (Profit Before Tax)</span>
                    <span className="font-mono text-foreground font-semibold">
                      {formatCurrency(metrics.financials.pbt.current)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Corporate GST / Tax Provision</span>
                    <span className="font-mono text-oxblood font-semibold">
                      {formatCurrency(metrics.financials.taxes.current)} (18%)
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-xs bg-muted/20 p-2 rounded-lg">
                <span className="font-medium text-foreground">Effective Tax Rate:</span>
                <span className="font-mono font-bold text-foreground">18.0% Net Provision</span>
              </div>
            </div>

          </div>

          {/* Unit Economics Benchmarking */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-semibold font-display text-foreground">
                  Per-Commission Unit Economics (Averaged Over {metrics.totalOrders.current} Pieces)
                </h3>
                <p className="text-xs text-muted-foreground font-serif italic">
                  Marginal contribution and profit retention realized on every bespoke commission delivered.
                </p>
              </div>
              <span className="text-[11px] font-mono text-brass bg-brass/10 border border-brass/20 px-2.5 py-1 rounded-md">
                Unit Economics Model
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-muted/30 border border-border/40 p-3 rounded-lg text-center">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-display">
                  Avg Commission (Rev)
                </div>
                <div className="text-lg font-bold font-mono text-foreground mt-1">
                  {formatCurrency(metrics.financials.unitEconomics.avgRevenuePerCommission)}
                </div>
                <div className="text-[10px] text-muted-foreground font-serif italic mt-0.5">100% of price</div>
              </div>

              <div className="bg-muted/30 border border-border/40 p-3 rounded-lg text-center">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-display">
                  Avg Direct COGS
                </div>
                <div className="text-lg font-bold font-mono text-foreground mt-1">
                  {formatCurrency(metrics.financials.unitEconomics.avgCogsPerCommission)}
                </div>
                <div className="text-[10px] text-muted-foreground font-serif italic mt-0.5">33% direct cost</div>
              </div>

              <div className="bg-muted/30 border border-border/40 p-3 rounded-lg text-center">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-display">
                  Avg Gross Profit
                </div>
                <div className="text-lg font-bold font-mono text-foreground mt-1">
                  {formatCurrency(metrics.financials.unitEconomics.avgGrossProfitPerCommission)}
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">67% gross margin</div>
              </div>

              <div className="bg-muted/30 border border-border/40 p-3 rounded-lg text-center">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-display">
                  Avg EBITDA Contribution
                </div>
                <div className="text-lg font-bold font-mono text-foreground mt-1">
                  {formatCurrency(metrics.financials.unitEconomics.avgEbitdaPerCommission)}
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">44% cash flow</div>
              </div>

              <div className="bg-oxblood/10 border border-oxblood/20 p-3 rounded-lg text-center col-span-2 sm:col-span-1">
                <div className="text-[10px] uppercase font-bold text-oxblood tracking-wider font-display">
                  Avg Net PAT Retention
                </div>
                <div className="text-lg font-bold font-mono text-oxblood mt-1">
                  {formatCurrency(metrics.financials.unitEconomics.avgPatPerCommission)}
                </div>
                <div className="text-[10px] text-oxblood font-semibold mt-0.5">32% net bottom line</div>
              </div>
            </div>
          </div>

          {/* Full Formal Income Statement (P&L Waterfall Table) */}
          <div className="bg-card border border-border rounded-xl shadow-2xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
              <div>
                <h3 className="text-base font-semibold font-display text-foreground flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-brass" />
                  <span>Income Statement & Profitability Waterfall ({filterOptions.find(o => o.id === dateRange)?.label})</span>
                </h3>
                <p className="text-xs text-muted-foreground font-serif italic mt-0.5">
                  Complete GAAP/IFRS managerial financial statement comparing active period against previous cycle.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={handleExportPnLCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs font-semibold hover:border-oxblood/50 hover:bg-muted/40 transition shadow-2xs"
                  title="Export official Income Statement as CSV"
                >
                  <Download className="w-3.5 h-3.5 text-brass" />
                  <span>Export P&L (CSV)</span>
                </button>
                <button
                  onClick={() => setInspectingMetricKey('ebitda')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-oxblood text-ivory text-xs font-semibold hover:bg-oxblood-deep transition shadow-2xs"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-brass" />
                  <span>Inspect Visual Trajectory</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Financial Line Item</th>
                    <th className="py-3 px-4 font-semibold">Operational Allocation / Driver</th>
                    <th className="py-3 px-4 font-semibold text-right">Current Period</th>
                    <th className="py-3 px-4 font-semibold text-right">Prior Period</th>
                    <th className="py-3 px-4 font-semibold text-right">Variance %</th>
                    <th className="py-3 px-4 font-semibold text-right">% of Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {/* Revenue */}
                  <tr className="bg-muted/10 font-bold font-sans">
                    <td className="py-3 px-4 text-foreground font-display text-sm">Gross Commission Revenue</td>
                    <td className="py-3 px-4 text-muted-foreground font-sans font-normal text-xs">Total client acquisitions & studio custom pieces</td>
                    <td className="py-3 px-4 text-right text-foreground font-mono">{formatCurrency(metrics.financials.revenue.current)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground font-mono">{formatCurrency(metrics.financials.revenue.previous)}</td>
                    <td className="py-3 px-4 text-right text-emerald-700 font-sans font-semibold">
                      {metrics.financials.revenue.percentChange >= 0 ? `+${metrics.financials.revenue.percentChange}%` : `${metrics.financials.revenue.percentChange}%`}
                    </td>
                    <td className="py-3 px-4 text-right text-foreground font-sans font-semibold">100.0%</td>
                  </tr>

                  {/* COGS */}
                  <tr className="hover:bg-muted/20 transition">
                    <td className="py-2.5 px-4 text-muted-foreground pl-8">Less: Cost of Goods Sold (COGS)</td>
                    <td className="py-2.5 px-4 text-muted-foreground font-sans text-xs">Substrate metals, laser argon gas, artisan deburring</td>
                    <td className="py-2.5 px-4 text-right text-foreground font-mono">({formatCurrency(metrics.financials.cogs.current)})</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-mono">({formatCurrency(metrics.financials.cogs.previous)})</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-sans">
                      {metrics.financials.cogs.percentChange >= 0 ? `+${metrics.financials.cogs.percentChange}%` : `${metrics.financials.cogs.percentChange}%`}
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-sans">33.0%</td>
                  </tr>

                  {/* Gross Profit */}
                  <tr className="bg-muted/20 font-bold font-sans">
                    <td className="py-3 px-4 text-foreground font-display">Gross Profit</td>
                    <td className="py-3 px-4 text-muted-foreground font-sans font-normal text-xs">Direct margin after fabrication substrates</td>
                    <td className="py-3 px-4 text-right text-foreground font-mono">{formatCurrency(metrics.financials.grossProfit.current)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground font-mono">{formatCurrency(metrics.financials.grossProfit.previous)}</td>
                    <td className="py-3 px-4 text-right text-emerald-700 font-sans font-semibold">
                      {metrics.financials.grossProfit.percentChange >= 0 ? `+${metrics.financials.grossProfit.percentChange}%` : `${metrics.financials.grossProfit.percentChange}%`}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-700 font-sans font-semibold">{metrics.financials.grossProfit.marginPercent}%</td>
                  </tr>

                  {/* OpEx */}
                  <tr className="hover:bg-muted/20 transition">
                    <td className="py-2.5 px-4 text-muted-foreground pl-8">Less: Operating Expenses (OpEx)</td>
                    <td className="py-2.5 px-4 text-muted-foreground font-sans text-xs">Energy, insured logistics, marketing, studio admin</td>
                    <td className="py-2.5 px-4 text-right text-foreground font-mono">({formatCurrency(metrics.financials.opex.current)})</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-mono">({formatCurrency(metrics.financials.opex.previous)})</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-sans">
                      {metrics.financials.opex.percentChange >= 0 ? `+${metrics.financials.opex.percentChange}%` : `${metrics.financials.opex.percentChange}%`}
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-sans">23.0%</td>
                  </tr>

                  {/* EBITDA */}
                  <tr className="bg-oxblood/10 border-t border-b border-oxblood/20 font-bold font-sans">
                    <td className="py-3.5 px-4 text-foreground font-display text-sm flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-brass" />
                      <span>EBITDA</span>
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground font-sans font-normal text-xs">Operating Cash Flow before D&A and taxes</td>
                    <td className="py-3.5 px-4 text-right text-foreground font-mono text-sm">{formatCurrency(metrics.financials.ebitda.current)}</td>
                    <td className="py-3.5 px-4 text-right text-muted-foreground font-mono text-sm">{formatCurrency(metrics.financials.ebitda.previous)}</td>
                    <td className="py-3.5 px-4 text-right text-emerald-700 font-sans font-bold">
                      {metrics.financials.ebitda.percentChange >= 0 ? `+${metrics.financials.ebitda.percentChange}%` : `${metrics.financials.ebitda.percentChange}%`}
                    </td>
                    <td className="py-3.5 px-4 text-right text-emerald-700 font-sans font-bold">{metrics.financials.ebitda.marginPercent}%</td>
                  </tr>

                  {/* Depreciation */}
                  <tr className="hover:bg-muted/20 transition">
                    <td className="py-2.5 px-4 text-muted-foreground pl-8">Less: Depreciation & Amortization</td>
                    <td className="py-2.5 px-4 text-muted-foreground font-sans text-xs">Fiber laser cutter & optical collimator amortization</td>
                    <td className="py-2.5 px-4 text-right text-foreground font-mono">({formatCurrency(metrics.financials.depreciation.current)})</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-mono">({formatCurrency(metrics.financials.depreciation.previous)})</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-sans">-</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-sans">3.5%</td>
                  </tr>

                  {/* EBIT */}
                  <tr className="bg-muted/20 font-bold font-sans">
                    <td className="py-3 px-4 text-foreground font-display">EBIT (Operating Earnings)</td>
                    <td className="py-3 px-4 text-muted-foreground font-sans font-normal text-xs">Operating profit after asset depreciation</td>
                    <td className="py-3 px-4 text-right text-foreground font-mono">{formatCurrency(metrics.financials.ebit.current)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground font-mono">{formatCurrency(metrics.financials.ebit.previous)}</td>
                    <td className="py-3 px-4 text-right text-emerald-700 font-sans font-semibold">
                      {metrics.financials.ebit.percentChange >= 0 ? `+${metrics.financials.ebit.percentChange}%` : `${metrics.financials.ebit.percentChange}%`}
                    </td>
                    <td className="py-3 px-4 text-right text-foreground font-sans font-semibold">{metrics.financials.ebit.marginPercent}%</td>
                  </tr>

                  {/* Interest Expense */}
                  <tr className="hover:bg-muted/20 transition">
                    <td className="py-2.5 px-4 text-muted-foreground pl-8">Less: Capital Finance & Lease Costs</td>
                    <td className="py-2.5 px-4 text-muted-foreground font-sans text-xs">Laser equipment capital facility financing</td>
                    <td className="py-2.5 px-4 text-right text-foreground font-mono">({formatCurrency(metrics.financials.interestExpense.current)})</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-mono">({formatCurrency(metrics.financials.interestExpense.previous)})</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-sans">-</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-sans">1.5%</td>
                  </tr>

                  {/* PBT */}
                  <tr className="bg-muted/20 font-bold font-sans">
                    <td className="py-3 px-4 text-foreground font-display">PBT (Profit Before Tax)</td>
                    <td className="py-3 px-4 text-muted-foreground font-sans font-normal text-xs">Taxable income prior to tax provision</td>
                    <td className="py-3 px-4 text-right text-foreground font-mono">{formatCurrency(metrics.financials.pbt.current)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground font-mono">{formatCurrency(metrics.financials.pbt.previous)}</td>
                    <td className="py-3 px-4 text-right text-emerald-700 font-sans font-semibold">
                      {metrics.financials.pbt.percentChange >= 0 ? `+${metrics.financials.pbt.percentChange}%` : `${metrics.financials.pbt.percentChange}%`}
                    </td>
                    <td className="py-3 px-4 text-right text-foreground font-sans font-semibold">39.0%</td>
                  </tr>

                  {/* Taxes */}
                  <tr className="hover:bg-muted/20 transition">
                    <td className="py-2.5 px-4 text-muted-foreground pl-8">Less: Corporate Tax & GST Provision</td>
                    <td className="py-2.5 px-4 text-muted-foreground font-sans text-xs">18.0% effective statutory tax provision</td>
                    <td className="py-2.5 px-4 text-right text-oxblood font-mono">({formatCurrency(metrics.financials.taxes.current)})</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-mono">({formatCurrency(metrics.financials.taxes.previous)})</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-sans">-</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground font-sans">7.0%</td>
                  </tr>

                  {/* PAT */}
                  <tr className="bg-oxblood/15 font-bold font-sans text-sm border-t-2 border-oxblood">
                    <td className="py-4 px-4 text-oxblood font-display text-base flex items-center gap-1.5">
                      <Landmark className="w-5 h-5 text-oxblood" />
                      <span>PAT (Profit After Tax / Net Bottom Line)</span>
                    </td>
                    <td className="py-4 px-4 text-oxblood font-sans font-medium text-xs">Final net earnings retained by Vernox Atelier</td>
                    <td className="py-4 px-4 text-right text-oxblood font-mono font-bold text-base">{formatCurrency(metrics.financials.pat.current)}</td>
                    <td className="py-4 px-4 text-right text-muted-foreground font-mono text-base">{formatCurrency(metrics.financials.pat.previous)}</td>
                    <td className="py-4 px-4 text-right text-emerald-700 font-sans font-bold">
                      {metrics.financials.pat.percentChange >= 0 ? `+${metrics.financials.pat.percentChange}%` : `${metrics.financials.pat.percentChange}%`}
                    </td>
                    <td className="py-4 px-4 text-right text-oxblood font-sans font-bold">{metrics.financials.pat.marginPercent}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW MODE 2: STOREFRONT & FABRICATION OPERATIONS (15 CARDS GRID) */}
      {/* ========================================================================= */}
      {viewMode === 'operations' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in">
          
          {/* CARD 1: Total sales */}
          <div 
            onClick={() => setInspectingMetricKey('totalSales')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground font-display">
                  <span>Total Commission Value</span>
                  <HelpCircle className="w-3 h-3 text-muted-foreground/60" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-oxblood group-hover:underline font-medium opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                    <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSelectTab('orders'); }} 
                    className="text-xs text-oxblood hover:text-oxblood-deep font-semibold hover:underline"
                  >
                    View orders
                  </button>
                </div>
              </div>

              <div className="flex items-baseline gap-2.5 mt-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
                  {formatCurrency(metrics.totalSales.current)}
                </span>
                {renderBadge(metrics.totalSales.percentChange)}
              </div>

              <div className="space-y-1.5 mt-3 pt-3 border-t border-border/50 text-xs">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Online Atelier</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-foreground">{formatCurrency(metrics.totalSales.onlineStore)}</span>
                    <span className="text-[11px] text-[#1D5E37] font-semibold flex items-center">↑ 3.2%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Private Architectural Inquiries</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-foreground">{formatCurrency(metrics.totalSales.facebook)}</span>
                    <span className="text-[11px] text-[#B91C1C] font-semibold flex items-center">↓ 7.0%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5 font-display flex items-center justify-between">
                <span>Commission Volume Over Time</span>
                <span className="text-[10px] text-muted-foreground font-normal">Tap to inspect</span>
              </div>
              <div className="h-28 w-full pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.timeSeries}>
                    <XAxis dataKey="timeLabel" stroke="#9ca3af" fontSize={9} tickLine={false} axisLine={false} />
                    <ChartTooltip 
                      formatter={(v: number | string) => [`${currency}${v}`, 'Sales']}
                      contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #2E2421', backgroundColor: '#1C1615', color: '#F8F4E7' }}
                    />
                    <Line type="monotone" dataKey="previousSales" stroke="#C6A15B" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="currentSales" stroke="#5B262C" strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-end gap-3 text-[10px] text-muted-foreground mt-1">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brass" /> Prior Period</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-oxblood" /> Current</div>
              </div>
            </div>
          </div>

          {/* CARD 2: Total online store visitors */}
          <div 
            onClick={() => setInspectingMetricKey('totalVisitors')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground font-display">
                  <span>Atelier Visitors</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-oxblood group-hover:underline font-medium">
                  <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                </div>
              </div>

              <div className="flex items-baseline gap-2.5 mt-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
                  {metrics.totalVisitors.current.toLocaleString()}
                </span>
                {renderBadge(metrics.totalVisitors.percentChange)}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5 font-display flex items-center justify-between">
                <span>Traffic Over Time</span>
                <span className="text-[10px] text-muted-foreground font-normal">Tap to inspect</span>
              </div>
              <div className="h-36 w-full pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.timeSeries}>
                    <XAxis dataKey="timeLabel" stroke="#9ca3af" fontSize={9} tickLine={false} axisLine={false} />
                    <ChartTooltip 
                      formatter={(v: number | string) => [v, 'Patrons']}
                      contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #2E2421', backgroundColor: '#1C1615', color: '#F8F4E7' }}
                    />
                    <Line type="monotone" dataKey="previousVisitors" stroke="#C6A15B" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="currentVisitors" stroke="#5B262C" strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-end gap-3 text-[10px] text-muted-foreground mt-1">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brass" /> Prior Period</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-oxblood" /> Current</div>
              </div>
            </div>
          </div>

          {/* CARD 3: Repeat customer rate */}
          <div 
            onClick={() => setInspectingMetricKey('repeatCustomerRate')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground font-display">
                  <span>Returning Patron Rate</span>
                  <HelpCircle className="w-3 h-3 text-muted-foreground/60" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-oxblood group-hover:underline font-medium opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                    <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSelectTab('customers'); }} 
                    className="text-xs text-oxblood hover:text-oxblood-deep font-semibold hover:underline"
                  >
                    Patron ledger
                  </button>
                </div>
              </div>

              <div className="flex items-baseline gap-2.5 mt-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
                  {metrics.repeatCustomerRate.current}%
                </span>
                {renderBadge(metrics.repeatCustomerRate.percentChange)}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5 font-display flex items-center justify-between">
                <span>Patron Demographics</span>
                <span className="text-[10px] text-muted-foreground font-normal">Tap to inspect</span>
              </div>
              <div className="h-36 w-full pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.timeSeries}>
                    <XAxis dataKey="timeLabel" stroke="#9ca3af" fontSize={9} tickLine={false} axisLine={false} />
                    <ChartTooltip contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #2E2421', backgroundColor: '#1C1615', color: '#F8F4E7' }} />
                    <Area type="monotone" dataKey="returningCustomers" stackId="1" stroke="#C6A15B" fill="#C6A15B" fillOpacity={0.65} />
                    <Area type="monotone" dataKey="firstTimeCustomers" stackId="1" stroke="#5B262C" fill="#5B262C" fillOpacity={0.65} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-end gap-3 text-[10px] text-muted-foreground mt-1">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-oxblood" /> New Patrons</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brass" /> Returning Patrons</div>
              </div>
            </div>
          </div>

          {/* CARD 4: Total orders */}
          <div 
            onClick={() => setInspectingMetricKey('totalOrders')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground font-display">
                  <span>Commission Count</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-oxblood group-hover:underline font-medium opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                    <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSelectTab('orders'); }} 
                    className="text-xs text-oxblood hover:text-oxblood-deep font-semibold hover:underline"
                  >
                    View orders
                  </button>
                </div>
              </div>

              <div className="flex items-baseline gap-2.5 mt-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
                  {metrics.totalOrders.current}
                </span>
                {renderBadge(metrics.totalOrders.percentChange)}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5 font-display flex items-center justify-between">
                <span>Commissions Over Time</span>
                <span className="text-[10px] text-muted-foreground font-normal">Tap to inspect</span>
              </div>
              <div className="h-36 w-full pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.timeSeries}>
                    <XAxis dataKey="timeLabel" stroke="#9ca3af" fontSize={9} tickLine={false} axisLine={false} />
                    <ChartTooltip contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #2E2421', backgroundColor: '#1C1615', color: '#F8F4E7' }} />
                    <Line type="monotone" dataKey="previousOrders" stroke="#C6A15B" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="currentOrders" stroke="#5B262C" strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-end gap-3 text-[10px] text-muted-foreground mt-1">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brass" /> Prior Period</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-oxblood" /> Current</div>
              </div>
            </div>
          </div>

          {/* CARD 5: Online store conversion rate */}
          <div 
            onClick={() => setInspectingMetricKey('conversionRate')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground font-display">
                  <span>Commission Conversion Rate</span>
                  <HelpCircle className="w-3 h-3 text-muted-foreground/60" />
                </div>
                <div className="flex items-center gap-1 text-[10px] text-oxblood group-hover:underline font-medium">
                  <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                </div>
              </div>

              <div className="flex items-baseline gap-2.5 mt-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
                  {metrics.conversionRate.current}%
                </span>
                {renderBadge(metrics.conversionRate.percentChange)}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2.5 font-display">
                Atelier Conversion Funnel
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-foreground font-medium">Bespoke Configurator Added</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-muted-foreground">{metrics.conversionFunnel.addedToCart.percent}%</span>
                      <span className="text-[#1D5E37] font-semibold text-[11px]">↑ {metrics.conversionFunnel.addedToCart.changePercent}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-serif italic">{metrics.conversionFunnel.addedToCart.visits} configurator sessions</div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-foreground font-medium">Draft Spec Checkout</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-muted-foreground">{metrics.conversionFunnel.reachedCheckout.percent}%</span>
                      <span className="text-[#1D5E37] font-semibold text-[11px]">↑ {metrics.conversionFunnel.reachedCheckout.changePercent}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-serif italic">{metrics.conversionFunnel.reachedCheckout.visits} checkout sessions</div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-foreground font-medium">Commission Secured</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-muted-foreground">{metrics.conversionFunnel.purchased.percent}%</span>
                      <span className="text-[#1D5E37] font-semibold text-[11px]">↑ {metrics.conversionFunnel.purchased.changePercent}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-serif italic">{metrics.conversionFunnel.purchased.orders} confirmed works</div>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 6: Average order value */}
          <div 
            onClick={() => setInspectingMetricKey('averageOrderValue')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground font-display">
                  <span>Average Commission Size (AOV)</span>
                  <HelpCircle className="w-3 h-3 text-muted-foreground/60" />
                </div>
                <div className="flex items-center gap-1 text-[10px] text-oxblood group-hover:underline font-medium">
                  <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                </div>
              </div>

              <div className="flex items-baseline gap-2.5 mt-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
                  {formatCurrency(metrics.averageOrderValue.current)}
                </span>
                {renderBadge(metrics.averageOrderValue.percentChange)}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5 font-display flex items-center justify-between">
                <span>AOV Trajectory</span>
                <span className="text-[10px] text-muted-foreground font-normal">Tap to inspect</span>
              </div>
              <div className="h-36 w-full pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.timeSeries}>
                    <XAxis dataKey="timeLabel" stroke="#9ca3af" fontSize={9} tickLine={false} axisLine={false} />
                    <ChartTooltip 
                      formatter={(v: number | string) => [`${currency}${v}`, 'AOV']}
                      contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #2E2421', backgroundColor: '#1C1615', color: '#F8F4E7' }}
                    />
                    <Line type="monotone" dataKey="previousAOV" stroke="#C6A15B" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="currentAOV" stroke="#5B262C" strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-end gap-3 text-[10px] text-muted-foreground mt-1">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brass" /> Prior Period</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-oxblood" /> Current</div>
              </div>
            </div>
          </div>

          {/* CARD 7: Top products by units sold */}
          <div 
            onClick={() => setInspectingMetricKey('totalOrders')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground font-display">Top Architectural Sculptures</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-oxblood group-hover:underline font-medium opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                    <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSelectTab('products'); }} 
                    className="text-xs text-oxblood hover:text-oxblood-deep font-semibold hover:underline"
                  >
                    Catalog
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {metrics.topProducts.map((p, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-border/40 last:border-0">
                    <span className="text-foreground truncate max-w-[170px] font-display font-medium" title={p.name}>
                      {p.name}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-muted-foreground font-medium">{p.unitsSold} units</span>
                      <span className="text-[#1D5E37] font-semibold text-[11px] w-12 text-right">
                        ↑ {p.growthPercent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CARD 8: Online store visits by location */}
          <div 
            onClick={() => setInspectingMetricKey('totalVisitors')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground font-display">Patron Geographic Distribution</span>
                <span className="text-[10px] text-oxblood group-hover:underline font-medium flex items-center gap-0.5">
                  <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                </span>
              </div>

              <div className="space-y-2.5">
                {metrics.visitsByLocation.map((loc, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-border/40 last:border-0">
                    <span className="text-foreground font-medium">{loc.country}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-muted-foreground font-medium">{loc.visits.toLocaleString()}</span>
                      <span className={`font-semibold text-[11px] w-14 text-right ${loc.changePercent >= 0 ? 'text-[#1D5E37]' : 'text-[#B91C1C]'}`}>
                        {loc.changePercent >= 0 ? `↑ ${loc.changePercent}%` : `↓ ${Math.abs(loc.changePercent)}%`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CARD 9: Total sales attributed to marketing campaigns */}
          <div 
            onClick={() => setInspectingMetricKey('campaignSales')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground font-display">Architectural Private Invitations</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-oxblood group-hover:underline font-medium opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                    <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSelectTab('coupons'); }} 
                    className="text-xs text-oxblood hover:text-oxblood-deep font-semibold hover:underline"
                  >
                    Privileges
                  </button>
                </div>
              </div>

              <div className="flex items-baseline gap-2.5 mt-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
                  {formatCurrency(metrics.campaignSales.current)}
                </span>
                {renderBadge(metrics.campaignSales.percentChange)}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5 font-display flex items-center justify-between">
                <span>Private Access Sales Over Time</span>
                <span className="text-[10px] text-muted-foreground font-normal">Tap to inspect</span>
              </div>
              <div className="h-36 w-full pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.timeSeries}>
                    <XAxis dataKey="timeLabel" stroke="#9ca3af" fontSize={9} tickLine={false} axisLine={false} />
                    <ChartTooltip 
                      formatter={(v: number | string) => [`${currency}${v}`, 'Campaign']}
                      contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #2E2421', backgroundColor: '#1C1615', color: '#F8F4E7' }}
                    />
                    <Line type="monotone" dataKey="previousSales" stroke="#C6A15B" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="campaignSales" stroke="#5B262C" strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-end gap-3 text-[10px] text-muted-foreground mt-1">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brass" /> Prior Period</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-oxblood" /> Current</div>
              </div>
            </div>
          </div>

          {/* CARD 10: Online store visits by traffic source */}
          <div 
            onClick={() => setInspectingMetricKey('totalVisitors')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground font-display">Acquisition Channels</span>
                <span className="text-[10px] text-oxblood group-hover:underline font-medium flex items-center gap-0.5">
                  <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                </span>
              </div>

              <div className="space-y-2.5">
                {metrics.visitsByTrafficSource.map((s, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-border/40 last:border-0">
                    <span className="text-foreground">{s.source}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-muted-foreground">{s.visits}</span>
                      <span className="text-[#1D5E37] font-semibold text-[11px] w-12 text-right">
                        ↑ {s.changePercent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CARD 11: Top landing pages by visits */}
          <div 
            onClick={() => setInspectingMetricKey('totalVisitors')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground font-display">Top Gallery Portals</span>
                <span className="text-[10px] text-oxblood group-hover:underline font-medium flex items-center gap-0.5">
                  <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                </span>
              </div>

              <div className="space-y-2.5">
                {metrics.topLandingPages.map((p, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-border/40 last:border-0">
                    <span className="text-foreground truncate max-w-[190px] font-mono text-[11px]" title={p.path}>
                      {p.path}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-muted-foreground">{p.visits.toLocaleString()}</span>
                      <span className="text-[#1D5E37] font-semibold text-[11px] w-12 text-right">
                        ↑ {p.changePercent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CARD 12: Online store visits by social source */}
          <div 
            onClick={() => setInspectingMetricKey('totalVisitors')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground font-display">Architectural Social Engagement</span>
                <span className="text-[10px] text-oxblood group-hover:underline font-medium flex items-center gap-0.5">
                  <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                </span>
              </div>

              <div className="space-y-2.5">
                {metrics.visitsBySocialSource.map((s, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-border/40 last:border-0">
                    <span className="text-foreground">{s.source}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-muted-foreground">{s.visits}</span>
                      <span className="text-[#1D5E37] font-semibold text-[11px] w-12 text-right">
                        ↑ {s.changePercent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CARD 13: Sales by traffic source */}
          <div 
            onClick={() => setInspectingMetricKey('totalSales')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground font-display">Revenue by Channel</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-oxblood group-hover:underline font-medium opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                    <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSelectTab('orders'); }} 
                    className="text-xs text-oxblood hover:text-oxblood-deep font-semibold hover:underline"
                  >
                    Ledger
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {metrics.salesByTrafficSource.map((s, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-border/40 last:border-0">
                    <span className="text-foreground">{s.source}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-muted-foreground">{formatCurrency(s.sales)}</span>
                      <span className={`font-semibold text-[11px] w-12 text-right ${s.changePercent > 0 ? 'text-[#1D5E37]' : 'text-muted-foreground'}`}>
                        {s.changePercent > 0 ? `↑ ${s.changePercent}%` : '-'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CARD 14: Online store visits by device type */}
          <div 
            onClick={() => setInspectingMetricKey('totalVisitors')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground font-display">Patron Viewing Platforms</span>
                <span className="text-[10px] text-oxblood group-hover:underline font-medium flex items-center gap-0.5">
                  <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                </span>
              </div>

              <div className="space-y-2.5">
                {metrics.visitsByDeviceType.map((d, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-border/40 last:border-0">
                    <span className="text-foreground">{d.device}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-muted-foreground">{d.visits}</span>
                      <span className={`font-semibold text-[11px] w-12 text-right ${d.changePercent > 0 ? 'text-[#1D5E37]' : d.changePercent < 0 ? 'text-[#B91C1C]' : 'text-muted-foreground'}`}>
                        {d.changePercent > 0 ? `↑ ${d.changePercent}%` : d.changePercent < 0 ? `↓ ${Math.abs(d.changePercent)}%` : '-'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CARD 15: Sales by social sources */}
          <div 
            onClick={() => setInspectingMetricKey('totalSales')}
            className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between hover:border-oxblood/60 hover:shadow-soft transition-all duration-200 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground font-display">Architectural Media Revenue</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-oxblood group-hover:underline font-medium opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                    <Maximize2 className="w-2.5 h-2.5" /> Deep dive
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSelectTab('marketing'); }} 
                    className="text-xs text-oxblood hover:text-oxblood-deep font-semibold hover:underline"
                  >
                    Campaigns
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {metrics.salesBySocialSource.map((s, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-border/40 last:border-0">
                    <span className="text-foreground">{s.source}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-muted-foreground">{formatCurrency(s.sales)}</span>
                      <span className={`font-semibold text-[11px] w-12 text-right ${s.changePercent > 0 ? 'text-[#1D5E37]' : 'text-muted-foreground'}`}>
                        {s.changePercent > 0 ? `↑ ${s.changePercent}%` : '-'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Footer Learn More Notice */}
      <div className="pt-6 flex justify-center">
        <button 
          onClick={() => onSelectTab('audit')}
          className="inline-flex items-center gap-2 text-xs text-oxblood hover:text-oxblood-deep bg-oxblood/10 hover:bg-oxblood/15 border border-oxblood/20 px-4 py-2 rounded-full font-medium transition"
        >
          <HelpCircle className="w-3.5 h-3.5 text-brass" />
          <span>Vernox Atelier Audit Engine · Real-time cryptographic ledger telemetry & GAAP/IFRS profitability model</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* INTERACTIVE GRAPH DEEP-DIVE MODAL */}
      {/* ========================================================================= */}
      {activeMetricConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div 
            className="bg-[#1C1615] border border-oxblood/40 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-ivory animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-oxblood/20 via-transparent to-transparent">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-oxblood/30 border border-oxblood/50 text-brass font-serif font-bold text-sm">
                    V
                  </span>
                  <h2 className="text-xl sm:text-2xl font-display font-bold text-ivory tracking-tight">
                    {activeMetricConfig.title}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-brass/15 border border-brass/30 text-brass text-[10px] font-bold uppercase tracking-wider">
                    Deep Dive
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-sans">
                  {activeMetricConfig.subtitle}
                </p>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setInspectingMetricKey(null)}
                className="self-end sm:self-center p-2 rounded-lg bg-card/60 hover:bg-oxblood/30 border border-border/50 text-muted-foreground hover:text-ivory transition"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
              
              {/* Controls Bar: Time Range Selector + Chart Type Selector + CSV Export */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#231C1A] border border-border/40 p-3 rounded-xl">
                {/* Time Range Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground mr-1 uppercase tracking-wider font-display">
                    Timeframe:
                  </span>
                  {filterOptions.map(opt => {
                    const active = dateRange === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setDateRange(opt.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                          active
                            ? 'bg-oxblood text-ivory font-semibold shadow-xs'
                            : 'bg-black/20 text-muted-foreground hover:text-ivory hover:bg-black/40'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {/* Chart Type Toggle & CSV */}
                <div className="flex items-center gap-2 self-end md:self-auto">
                  <div className="flex items-center bg-black/30 border border-border/40 rounded-lg p-0.5 text-xs">
                    <button
                      onClick={() => setDetailChartType('area')}
                      className={`px-2.5 py-1 rounded flex items-center gap-1 transition ${
                        detailChartType === 'area' ? 'bg-oxblood text-ivory font-semibold' : 'text-muted-foreground hover:text-ivory'
                      }`}
                      title="Area Chart"
                    >
                      <Layers className="w-3.5 h-3.5" /> Area
                    </button>
                    <button
                      onClick={() => setDetailChartType('line')}
                      className={`px-2.5 py-1 rounded flex items-center gap-1 transition ${
                        detailChartType === 'line' ? 'bg-oxblood text-ivory font-semibold' : 'text-muted-foreground hover:text-ivory'
                      }`}
                      title="Line Chart"
                    >
                      <LineChartIcon className="w-3.5 h-3.5" /> Line
                    </button>
                    <button
                      onClick={() => setDetailChartType('bar')}
                      className={`px-2.5 py-1 rounded flex items-center gap-1 transition ${
                        detailChartType === 'bar' ? 'bg-oxblood text-ivory font-semibold' : 'text-muted-foreground hover:text-ivory'
                      }`}
                      title="Bar Chart"
                    >
                      <BarChart3 className="w-3.5 h-3.5" /> Bar
                    </button>
                  </div>

                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brass/10 hover:bg-brass/20 border border-brass/30 text-brass text-xs font-semibold transition"
                    title="Export Interval Telemetry to CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* KPI Performance Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#241D1A] border border-border/50 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-display">
                    Active Period Aggregate
                  </div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-ivory mt-1">
                    {activeMetricConfig.currentValueFormatted}
                  </div>
                  <div className="mt-1">
                    {renderBadge(activeMetricConfig.percentChange)}
                  </div>
                </div>

                <div className="bg-[#241D1A] border border-border/50 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-display">
                    Peak Interval
                  </div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-brass mt-1 truncate">
                    {activeMetricConfig.valueFormatter(modalStats.peak.val)}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-serif italic mt-0.5">
                    Interval: {modalStats.peak.label}
                  </div>
                </div>

                <div className="bg-[#241D1A] border border-border/50 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-display">
                    Average per Interval
                  </div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-ivory mt-1 truncate">
                    {activeMetricConfig.valueFormatter(modalStats.avg)}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-serif italic mt-0.5">
                    Mean distribution velocity
                  </div>
                </div>

                <div className="bg-[#241D1A] border border-border/50 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-display">
                    Lowest Interval
                  </div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-muted-foreground mt-1 truncate">
                    {activeMetricConfig.valueFormatter(modalStats.lowest.val)}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-serif italic mt-0.5">
                    Interval: {modalStats.lowest.label}
                  </div>
                </div>
              </div>

              {/* High-Resolution Expanded Chart */}
              <div className="bg-[#211A18] border border-border/50 rounded-xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-ivory font-display">
                      Temporal Progression ({filterOptions.find(o => o.id === dateRange)?.label})
                    </h3>
                    <p className="text-[11px] text-muted-foreground font-serif italic">
                      Comparing {filterOptions.find(o => o.id === dateRange)?.label} against previous period
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#C6A15B]" />
                      <span className="text-muted-foreground text-[11px]">{activeMetricConfig.previousSeriesName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#8E343E]" />
                      <span className="text-ivory font-medium text-[11px]">{activeMetricConfig.currentSeriesName}</span>
                    </div>
                  </div>
                </div>

                <div className="h-72 sm:h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {detailChartType === 'area' ? (
                      <AreaChart data={modalChartData}>
                        <defs>
                          <linearGradient id="oxbloodGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8E343E" stopOpacity={0.65}/>
                            <stop offset="95%" stopColor="#8E343E" stopOpacity={0.02}/>
                          </linearGradient>
                          <linearGradient id="brassGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#C6A15B" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#C6A15B" stopOpacity={0.01}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#3A2D29" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="timeLabel" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={{ stroke: '#3A2D29' }} />
                        <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => typeof v === 'number' && v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${v}`} />
                        <ChartTooltip
                          contentStyle={{ fontSize: '12px', borderRadius: '10px', border: '1px solid #5B262C', backgroundColor: '#140E0D', color: '#FAF7F2' }}
                          formatter={(v: number | string, name: string) => [
                            activeMetricConfig.valueFormatter(Number(v)),
                            name === 'current' ? activeMetricConfig.currentSeriesName : activeMetricConfig.previousSeriesName
                          ]}
                        />
                        <Area type="monotone" dataKey="previous" stroke="#C6A15B" strokeWidth={1.5} strokeDasharray="3 3" fill="url(#brassGrad)" />
                        <Area type="monotone" dataKey="current" stroke="#8E343E" strokeWidth={2.8} fill="url(#oxbloodGrad)" />
                      </AreaChart>
                    ) : detailChartType === 'line' ? (
                      <LineChart data={modalChartData}>
                        <CartesianGrid stroke="#3A2D29" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="timeLabel" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={{ stroke: '#3A2D29' }} />
                        <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => typeof v === 'number' && v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${v}`} />
                        <ChartTooltip
                          contentStyle={{ fontSize: '12px', borderRadius: '10px', border: '1px solid #5B262C', backgroundColor: '#140E0D', color: '#FAF7F2' }}
                          formatter={(v: number | string, name: string) => [
                            activeMetricConfig.valueFormatter(Number(v)),
                            name === 'current' ? activeMetricConfig.currentSeriesName : activeMetricConfig.previousSeriesName
                          ]}
                        />
                        <Line type="monotone" dataKey="previous" stroke="#C6A15B" strokeWidth={1.8} strokeDasharray="4 4" dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="current" stroke="#8E343E" strokeWidth={2.8} dot={{ r: 3, fill: '#8E343E' }} />
                      </LineChart>
                    ) : (
                      <BarChart data={modalChartData}>
                        <CartesianGrid stroke="#3A2D29" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="timeLabel" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={{ stroke: '#3A2D29' }} />
                        <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => typeof v === 'number' && v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${v}`} />
                        <ChartTooltip
                          contentStyle={{ fontSize: '12px', borderRadius: '10px', border: '1px solid #5B262C', backgroundColor: '#140E0D', color: '#FAF7F2' }}
                          formatter={(v: number | string, name: string) => [
                            activeMetricConfig.valueFormatter(Number(v)),
                            name === 'current' ? activeMetricConfig.currentSeriesName : activeMetricConfig.previousSeriesName
                          ]}
                        />
                        <Bar dataKey="previous" fill="#C6A15B" opacity={0.5} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="current" fill="#8E343E" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Granular Interval Breakdown Table */}
              <div className="bg-[#211A18] border border-border/50 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border/40 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ivory font-display">
                    Granular Interval Breakdown
                  </h3>
                  <span className="text-xs text-muted-foreground font-mono">
                    {modalChartData.length} Intervals Recorded
                  </span>
                </div>

                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-black/30 border-b border-border/40 text-muted-foreground uppercase text-[10px] tracking-wider sticky top-0 backdrop-blur-xs">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Interval</th>
                        <th className="py-2.5 px-4 font-semibold">{activeMetricConfig.currentSeriesName}</th>
                        <th className="py-2.5 px-4 font-semibold">{activeMetricConfig.previousSeriesName}</th>
                        <th className="py-2.5 px-4 font-semibold">Variance</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Trend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30 font-mono">
                      {modalChartData.map((row, idx) => {
                        const isPos = row.delta >= 0;
                        return (
                          <tr key={idx} className="hover:bg-white/[0.02] transition">
                            <td className="py-2 px-4 text-ivory font-sans font-medium">{row.timeLabel}</td>
                            <td className="py-2 px-4 text-ivory font-bold">{activeMetricConfig.valueFormatter(row.current)}</td>
                            <td className="py-2 px-4 text-muted-foreground">{activeMetricConfig.valueFormatter(row.previous)}</td>
                            <td className={`py-2 px-4 font-medium ${isPos ? 'text-[#34D399]' : 'text-[#F87171]'}`}>
                              {isPos ? '+' : ''}{activeMetricConfig.valueFormatter(row.delta)}
                            </td>
                            <td className="py-2 px-4 text-right">
                              <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded ${
                                isPos ? 'bg-emerald-950/60 text-[#34D399] border border-emerald-800/40' : 'bg-red-950/60 text-[#F87171] border border-red-800/40'
                              }`}>
                                {isPos ? '↑' : '↓'} {Math.abs(row.deltaPercent)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border/40 bg-[#161110] flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-serif italic text-brass">
                Vernox Atelier Cryptographic Financial Intelligence Console
              </span>
              <button
                onClick={() => setInspectingMetricKey(null)}
                className="px-4 py-1.5 rounded-lg bg-oxblood hover:bg-oxblood-deep text-ivory font-semibold transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
