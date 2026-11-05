/**
 * Enterprise Admin Activity & Audit Log View
 * Features: Tamper-evident logging of administrative actions,
 * target resource tracking, IP logging, action filters, and CSV/JSON compliance exports.
 */

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { fetchAuditLogs } from '@/lib/data/staff';
import type { AuditEntry as AuditLog } from '@/types/store';
import { 
  Shield, Search, Download, RefreshCw, Filter, 
  Clock, Eye, User, FileText, CheckCircle2, AlertTriangle, Key, X
} from 'lucide-react';
import { toast } from 'sonner';

export function AdminAuditLogs() {
  const { permissions } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('all');
  const [inspectingLog, setInspectingLog] = useState<AuditLog | null>(null);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const fetched = await fetchAuditLogs(targetTypeFilter !== 'all' ? targetTypeFilter : undefined);
      setLogs(fetched);
    } catch (err) {
      toast.error(`Failed to retrieve audit log records: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (permissions?.canViewAuditLogs) loadLogs();
  }, [targetTypeFilter, permissions?.canViewAuditLogs]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        log.action?.toLowerCase().includes(q) ||
        log.adminEmail?.toLowerCase().includes(q) ||
        log.targetId?.toLowerCase().includes(q) ||
        log.targetType?.toLowerCase().includes(q);

      return matchesSearch;
    });
  }, [logs, searchQuery]);

  // Export CSV Handler
  const handleExportCSV = () => {
    if (logs.length === 0) {
      toast.error('No audit records to export');
      return;
    }

    const headers = ['Timestamp', 'Date', 'Admin Email', 'Admin Role', 'Action', 'Target Type', 'Target ID', 'IP Address'];
    const rows = logs.map(l => [
      l.timestamp,
      `"${new Date(l.timestamp).toISOString()}"`,
      `"${l.adminEmail}"`,
      `"${l.adminRole}"`,
      `"${l.action}"`,
      `"${l.targetType}"`,
      `"${l.targetId}"`,
      `"${l.ip || 'internal'}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vernox-audit-trail-${Date.now()}.csv`;
    link.click();
    toast.success('Audit trail CSV exported');
  };

  // Export JSON Handler
  const handleExportJSON = () => {
    const payload = JSON.stringify(logs, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vernox-audit-trail-${Date.now()}.json`;
    link.click();
    toast.success('Audit trail JSON exported');
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('LOGIN')) return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    if (action.includes('DELETE') || action.includes('FAILED')) return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
    if (action.includes('CREATED') || action.includes('SUCCESS')) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  };

  if (!permissions?.canViewAuditLogs) {
    return <p className="text-sm text-muted-foreground">Audit logs are available to super admins only.</p>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl text-oxblood-deep">System Activity & Audit Logs</h2>
          <p className="text-muted-foreground text-sm">
            Tamper-evident administrative compliance trail tracking authentication, inventory adjustments, and catalog updates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadLogs}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-oxblood/10 border border-oxblood/20 rounded-lg text-xs font-semibold text-oxblood hover:bg-oxblood/20 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportJSON}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-muted border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-muted/80 transition"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-card border border-border/70 rounded-xl p-4 shadow-soft flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by action, admin, or target..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-oxblood transition"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: 'All Records' },
            { id: 'auth', label: 'Auth & Login' },
            { id: 'coupon', label: 'Coupons' },
            { id: 'order', label: 'Orders' },
            { id: 'inventory', label: 'Inventory' },
            { id: 'product', label: 'Products' },
            { id: 'config', label: 'Banners & Hero' },
            { id: 'admin', label: 'Team Roles' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setTargetTypeFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                targetTypeFilter === f.id
                  ? 'bg-oxblood text-ivory shadow-xs'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-card border border-border/70 rounded-xl overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="p-4">Timestamp</th>
                <th className="p-4">Administrator</th>
                <th className="p-4">Action</th>
                <th className="p-4">Target Resource</th>
                <th className="p-4">IP Address</th>
                <th className="p-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    <Shield className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="font-medium text-foreground">
                      {isLoading ? 'Loading system audit records...' : 'No activity records found'}
                    </p>
                    <p className="text-xs mt-1">Actions performed by administrators automatically generate records here.</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map(l => (
                  <tr key={l.id || l.timestamp} className="hover:bg-muted/20 transition group">
                    <td className="p-4 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {new Date(l.timestamp).toLocaleString()}
                    </td>

                    <td className="p-4">
                      <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-oxblood" />
                        <span>{l.adminEmail}</span>
                      </div>
                      <span className="text-[10px] font-mono uppercase text-brass">
                        {l.adminRole}
                      </span>
                    </td>

                    <td className="p-4">
                      <span className={`inline-block font-mono text-xs px-2.5 py-0.5 rounded border font-semibold ${getActionBadgeColor(l.action)}`}>
                        {l.action}
                      </span>
                    </td>

                    <td className="p-4">
                      <div className="text-xs font-mono text-foreground">
                        <span className="text-muted-foreground uppercase text-[10px] block">{l.targetType}</span>
                        <span>{l.targetId || 'global'}</span>
                      </div>
                    </td>

                    <td className="p-4 text-xs font-mono text-muted-foreground">
                      {l.ip || '127.0.0.1'}
                    </td>

                    <td className="p-4 text-right">
                      <button
                        onClick={() => setInspectingLog(l)}
                        className="p-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INSPECT LOG MODAL */}
      {inspectingLog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 shadow-luxe space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-oxblood" />
                <h3 className="font-display text-lg text-oxblood-deep">
                  Audit Record: {inspectingLog.action}
                </h3>
              </div>
              <button 
                onClick={() => setInspectingLog(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between border-b border-border/60 py-1.5">
                <span className="text-muted-foreground font-semibold">Timestamp:</span>
                <span className="font-mono">{new Date(inspectingLog.timestamp).toISOString()}</span>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1.5">
                <span className="text-muted-foreground font-semibold">Administrator:</span>
                <span className="font-mono">{inspectingLog.adminEmail} ({inspectingLog.adminRole})</span>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1.5">
                <span className="text-muted-foreground font-semibold">Target Resource:</span>
                <span className="font-mono">{inspectingLog.targetType} / {inspectingLog.targetId}</span>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1.5">
                <span className="text-muted-foreground font-semibold">IP Address:</span>
                <span className="font-mono">{inspectingLog.ip || 'internal'}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Payload Details (JSON)
              </label>
              <pre className="bg-muted/40 border border-border/70 rounded-lg p-3 text-xs font-mono overflow-x-auto text-foreground max-h-48">
                {JSON.stringify(inspectingLog.details || {}, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                onClick={() => setInspectingLog(null)}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
