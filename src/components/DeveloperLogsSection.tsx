import React, { useState, useMemo, useCallback } from 'react';
import {
  Check,
  Copy,
  Search,
  RefreshCw,
  Trash2,
  ChevronDown,
  Clock,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  ScrollText,
  Filter,
  X,
  Code2,
  Layers,
  ArrowDownUp,
} from 'lucide-react';
import { DeveloperRequestLog } from '../services/developerApi';

interface DeveloperLogsSectionProps {
  logs: DeveloperRequestLog[];
  onRefresh?: () => void;
  onClear?: () => void;
  onRunTest?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type OutcomeFilter = 'all' | 'succeeded' | 'failed' | 'blocked' | 'processing';
type TimeFilter = 'all' | 'today' | '24h' | '7d' | '30d';

const PAGE_SIZE_OPTIONS = [25, 50, 100];

/**
 * Format relative time (e.g. "2.4s ago", "8m ago", "2h ago", "Today, 3:42 PM")
 */
function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'just now';
  try {
    const d = new Date(dateStr);
    const timeMs = d.getTime();
    if (isNaN(timeMs)) return dateStr;

    const now = Date.now();
    const diffSec = Math.max(0, (now - timeMs) / 1000);

    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return `${Math.floor(diffSec)}s ago`;

    const diffMin = diffSec / 60;
    if (diffMin < 60) return `${Math.floor(diffMin)}m ago`;

    const diffHours = diffMin / 60;
    if (diffHours < 24) {
      const isToday = new Date().toDateString() === d.toDateString();
      if (isToday) {
        return `Today, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
      }
      return `${Math.floor(diffHours)}h ago`;
    }

    const diffDays = diffHours / 24;
    if (diffDays < 7) {
      return `${Math.floor(diffDays)}d ago`;
    }

    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format exact timestamp (e.g. "Aug 21, 2026 · 3:42:18 PM")
 */
function formatExactTime(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();
    const year = d.getFullYear();
    const time = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    return `${month} ${day}, ${year} · ${time}`;
  } catch {
    return dateStr;
  }
}

/**
 * Clean endpoint/action label helper
 */
function formatActionName(actionKey?: string, endpoint?: string): string {
  if (actionKey && actionKey.trim()) return actionKey.trim();
  if (endpoint) {
    const cleaned = endpoint.replace(/^\/api\/?/, '').trim();
    if (cleaned) return cleaned;
  }
  return 'apiRequest';
}

export const DeveloperLogsSection: React.FC<DeveloperLogsSectionProps> = ({
  logs = [],
  onRefresh,
  onClear,
  onRunTest,
  showToast,
}) => {
  // Single expanded item ID at a time for optimal memory and rendering performance
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Filters
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination / Load More
  const [pageSize, setPageSize] = useState<number>(25);
  const [visibleCount, setVisibleCount] = useState<number>(25);

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedJsonId, setCopiedJsonId] = useState<string | null>(null);

  // Toggle expand
  const toggleExpand = useCallback((logId: string) => {
    setExpandedLogId((prev) => (prev === logId ? null : logId));
  }, []);

  // Copy helpers
  const handleCopyRequestId = async (reqId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(reqId);
      setCopiedId(reqId);
      showToast?.('Request ID copied to clipboard', 'success');
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      showToast?.('Failed to copy ID', 'error');
    }
  };

  const handleCopyJson = async (log: DeveloperRequestLog, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const id = log.id || log.request_id || 'json';
    try {
      const payload = log.details || {
        request_id: log.request_id || log.id,
        action: log.action_key || log.action,
        outcome: log.outcome,
        status_code: log.status_code || log.status,
        latency_ms: log.latency_ms,
        error_code: log.error_code,
        error_message: log.error_message || log.message,
        quota_consumed: log.quota_consumed,
        requested_at: log.requested_at || log.created_at,
        completed_at: log.completed_at,
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopiedJsonId(id);
      showToast?.('JSON details copied to clipboard', 'success');
      setTimeout(() => setCopiedJsonId(null), 1800);
    } catch {
      showToast?.('Failed to copy JSON', 'error');
    }
  };

  // Distinct actions present in logs + common endpoints
  const distinctActions = useMemo(() => {
    const actionSet = new Set<string>();
    actionSet.add('getAllTokens');
    actionSet.add('getBlockchainTokens');
    actionSet.add('getTokenByAddress');
    actionSet.add('getTokenPrice');
    actionSet.add('getTokenDetails');

    logs.forEach((l) => {
      const name = l.action_key || l.action;
      if (name) actionSet.add(name);
    });
    return Array.from(actionSet);
  }, [logs]);

  // Counts by outcome
  const counts = useMemo(() => {
    let succeeded = 0;
    let failed = 0;
    let blocked = 0;
    let processing = 0;

    for (const log of logs) {
      const o = (log.outcome || (log.status_code && log.status_code < 400 ? 'succeeded' : 'failed')).toLowerCase();
      if (o === 'succeeded' || o === 'success') succeeded++;
      else if (o === 'blocked' || log.status_code === 429) blocked++;
      else if (o === 'processing' || o === 'pending') processing++;
      else failed++;
    }

    return {
      all: logs.length,
      succeeded,
      failed,
      blocked,
      processing,
    };
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    const now = Date.now();
    const query = searchQuery.trim().toLowerCase();

    return logs.filter((log) => {
      // 1. Outcome Filter
      if (outcomeFilter !== 'all') {
        const normOutcome = (
          log.outcome || (log.status_code && log.status_code < 400 ? 'succeeded' : 'failed')
        ).toLowerCase();
        if (outcomeFilter === 'succeeded' && normOutcome !== 'succeeded' && normOutcome !== 'success') return false;
        if (outcomeFilter === 'failed' && normOutcome !== 'failed' && normOutcome !== 'error') return false;
        if (outcomeFilter === 'blocked' && normOutcome !== 'blocked' && log.status_code !== 429) return false;
        if (outcomeFilter === 'processing' && normOutcome !== 'processing' && normOutcome !== 'pending') return false;
      }

      // 2. Action Filter
      if (actionFilter !== 'all') {
        const actionName = (log.action_key || log.action || '').toLowerCase();
        if (actionName !== actionFilter.toLowerCase()) return false;
      }

      // 3. Time Filter
      if (timeFilter !== 'all') {
        const timestampStr = log.requested_at || log.created_at || log.timestamp;
        if (!timestampStr) return false;
        const logTime = new Date(timestampStr).getTime();
        if (isNaN(logTime)) return false;

        const diffMs = now - logTime;
        if (timeFilter === 'today') {
          const logDate = new Date(logTime).toDateString();
          const todayDate = new Date().toDateString();
          if (logDate !== todayDate) return false;
        } else if (timeFilter === '24h') {
          if (diffMs > 24 * 60 * 60 * 1000) return false;
        } else if (timeFilter === '7d') {
          if (diffMs > 7 * 24 * 60 * 60 * 1000) return false;
        } else if (timeFilter === '30d') {
          if (diffMs > 30 * 24 * 60 * 60 * 1000) return false;
        }
      }

      // 4. Search Query
      if (query) {
        const actionStr = (log.action_key || log.action || log.endpoint || '').toLowerCase();
        const reqIdStr = (log.request_id || log.id || '').toLowerCase();
        const errCodeStr = (log.error_code || '').toLowerCase();
        const msgStr = (log.error_message || log.message || '').toLowerCase();
        const statusStr = String(log.status_code || log.status || '');
        return (
          actionStr.includes(query) ||
          reqIdStr.includes(query) ||
          errCodeStr.includes(query) ||
          msgStr.includes(query) ||
          statusStr.includes(query)
        );
      }

      return true;
    });
  }, [logs, outcomeFilter, actionFilter, timeFilter, searchQuery]);

  // Windowed visible logs for high-speed rendering
  const visibleLogs = useMemo(() => {
    return filteredLogs.slice(0, visibleCount);
  }, [filteredLogs, visibleCount]);

  const hasMore = visibleCount < filteredLogs.length;

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + pageSize);
  };

  const handleResetFilters = () => {
    setOutcomeFilter('all');
    setActionFilter('all');
    setTimeFilter('all');
    setSearchQuery('');
    setVisibleCount(pageSize);
  };

  const isFiltered = outcomeFilter !== 'all' || actionFilter !== 'all' || timeFilter !== 'all' || searchQuery !== '';

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 1. Header & Quick Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800/60">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">Developer Logs</h3>
            <span className="text-xs font-mono font-medium text-zinc-400">
              {logs.length.toLocaleString()} {logs.length === 1 ? 'request' : 'requests'}
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
            Realtime activity stream and inline diagnostic inspector.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Refresh logs from Supabase"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          )}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="px-3 py-1.5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 text-xs font-semibold text-zinc-400 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Clear logs view"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* 2. Status Outcome Tabs Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {/* All */}
          <button
            type="button"
            onClick={() => {
              setOutcomeFilter('all');
              setVisibleCount(pageSize);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              outcomeFilter === 'all'
                ? 'bg-zinc-100 text-black shadow-sm'
                : 'bg-zinc-900/70 text-zinc-400 hover:text-zinc-200 border border-zinc-800/60'
            }`}
          >
            All
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                outcomeFilter === 'all' ? 'bg-black/15 text-black font-bold' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {counts.all}
            </span>
          </button>

          {/* Success */}
          <button
            type="button"
            onClick={() => {
              setOutcomeFilter('succeeded');
              setVisibleCount(pageSize);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              outcomeFilter === 'succeeded'
                ? 'bg-[#00E575] text-black shadow-sm font-bold shadow-[#00E575]/20'
                : 'bg-zinc-900/70 text-zinc-400 hover:text-emerald-400 border border-zinc-800/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            Success
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                outcomeFilter === 'succeeded' ? 'bg-black/20 text-black font-bold' : 'bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {counts.succeeded}
            </span>
          </button>

          {/* Failed */}
          <button
            type="button"
            onClick={() => {
              setOutcomeFilter('failed');
              setVisibleCount(pageSize);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              outcomeFilter === 'failed'
                ? 'bg-rose-500 text-white shadow-sm font-bold shadow-rose-500/20'
                : 'bg-zinc-900/70 text-zinc-400 hover:text-rose-400 border border-zinc-800/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
            Failed
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                outcomeFilter === 'failed' ? 'bg-white/20 text-white font-bold' : 'bg-rose-500/10 text-rose-400'
              }`}
            >
              {counts.failed}
            </span>
          </button>

          {/* Blocked */}
          <button
            type="button"
            onClick={() => {
              setOutcomeFilter('blocked');
              setVisibleCount(pageSize);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              outcomeFilter === 'blocked'
                ? 'bg-amber-500 text-black shadow-sm font-bold shadow-amber-500/20'
                : 'bg-zinc-900/70 text-zinc-400 hover:text-amber-400 border border-zinc-800/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
            Blocked
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                outcomeFilter === 'blocked' ? 'bg-black/20 text-black font-bold' : 'bg-amber-500/10 text-amber-400'
              }`}
            >
              {counts.blocked}
            </span>
          </button>

          {/* Processing (if any) */}
          {counts.processing > 0 && (
            <button
              type="button"
              onClick={() => {
                setOutcomeFilter('processing');
                setVisibleCount(pageSize);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                outcomeFilter === 'processing'
                  ? 'bg-sky-500 text-black shadow-sm font-bold'
                  : 'bg-zinc-900/70 text-zinc-400 hover:text-sky-400 border border-zinc-800/60'
              }`}
            >
              <Loader2 className="w-3 h-3 text-sky-400 animate-spin" />
              Processing
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  outcomeFilter === 'processing' ? 'bg-black/20 text-black font-bold' : 'bg-sky-500/10 text-sky-400'
                }`}
              >
                {counts.processing}
              </span>
            </button>
          )}
        </div>

        {/* Time Filter Select */}
        <div className="flex items-center gap-2">
          <select
            value={timeFilter}
            onChange={(e) => {
              setTimeFilter(e.target.value as TimeFilter);
              setVisibleCount(pageSize);
            }}
            className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-medium text-zinc-300 focus:border-emerald-500/60 outline-none cursor-pointer"
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="24h">Past 24 hours</option>
            <option value="7d">Past 7 days</option>
            <option value="30d">Past 30 days</option>
          </select>
        </div>
      </div>

      {/* 3. Search & Action Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        {/* Search Input */}
        <div className="sm:col-span-8 relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(pageSize);
            }}
            placeholder="Search action, error, request ID, status code..."
            className="w-full pl-8 pr-7 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:border-emerald-500/60 outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Action Filter Dropdown */}
        <div className="sm:col-span-4">
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setVisibleCount(pageSize);
            }}
            className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 focus:border-emerald-500/60 outline-none cursor-pointer truncate"
          >
            <option value="all">All Actions ({distinctActions.length})</option>
            {distinctActions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active Filter Indicator / Reset */}
      {isFiltered && (
        <div className="flex items-center justify-between text-xs text-zinc-400 bg-zinc-900/40 px-3 py-1.5 rounded-lg border border-zinc-800/50">
          <div className="flex items-center gap-1.5 truncate">
            <Filter className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate">
              Showing <strong className="text-white">{filteredLogs.length}</strong> matching logs
            </span>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors shrink-0 ml-2"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* 4. Accordion Logs List */}
      <div className="space-y-2">
        {filteredLogs.length === 0 ? (
          <div className="p-8 sm:p-12 text-center rounded-xl border border-zinc-800/40 bg-zinc-950/40 backdrop-blur-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 text-zinc-500 flex items-center justify-center mx-auto border border-zinc-800">
              <ScrollText className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-zinc-300">No request logs found</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                {isFiltered
                  ? 'No logs match your active filter and search query. Try clearing filters.'
                  : 'No API calls have been processed yet. Run a live test request in the Endpoints tab to generate audit telemetry.'}
              </p>
            </div>
            {isFiltered ? (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
              >
                Reset Filters
              </button>
            ) : onRunTest ? (
              <button
                type="button"
                onClick={onRunTest}
                className="px-3.5 py-1.5 rounded-lg bg-[#00E575] text-black text-xs font-bold hover:bg-[#00E575]/90 transition-all flex items-center gap-1.5 mx-auto"
              >
                <Zap className="w-3.5 h-3.5" />
                Run Test Request
              </button>
            ) : null}
          </div>
        ) : (
          visibleLogs.map((log, index) => {
            const rowId = log.id || log.request_id || `log_${index}`;
            const isExpanded = expandedLogId === rowId;
            const actionName = formatActionName(log.action_key || log.action, log.endpoint);
            const statusCode = Number(
              log.status_code ??
                log.status ??
                (log.outcome === 'succeeded' ? 200 : log.outcome === 'blocked' ? 429 : 500)
            );

            // Normalized outcome
            const outcome = (
              log.outcome || (statusCode < 400 ? 'succeeded' : statusCode === 429 ? 'blocked' : 'failed')
            ).toLowerCase();

            const isSuccess = outcome === 'succeeded' || outcome === 'success';
            const isBlocked = outcome === 'blocked' || statusCode === 429;
            const isFailed = outcome === 'failed' || outcome === 'error' || (!isSuccess && !isBlocked);

            // Summary Sub-line Message
            let summaryText = '';
            if (isSuccess) {
              summaryText = `Successful request · ${log.latency_ms || 0} ms`;
            } else if (isBlocked) {
              summaryText = log.error_message || log.message || log.error_code || 'Rate limited · Quota limit reached';
            } else {
              summaryText = log.error_code || log.error_message || log.message || 'Request failed';
            }

            const relativeTime = formatRelativeTime(log.requested_at || log.created_at || log.timestamp);
            const exactTime = formatExactTime(log.requested_at || log.created_at || log.timestamp);

            return (
              <div
                key={rowId}
                className={`rounded-xl border transition-all duration-150 overflow-hidden ${
                  isExpanded
                    ? 'border-zinc-700 bg-zinc-900/60 shadow-lg ring-1 ring-zinc-700/50'
                    : 'border-zinc-800/80 bg-zinc-950/80 hover:bg-zinc-900/40 hover:border-zinc-700/80'
                }`}
              >
                {/* ── TOP SUMMARY ROW (Compact Notification Style) ── */}
                <button
                  type="button"
                  onClick={() => toggleExpand(rowId)}
                  className="w-full text-left p-3 sm:p-3.5 flex items-center justify-between gap-2.5 cursor-pointer select-none"
                  aria-expanded={isExpanded}
                >
                  {/* Left: Status Icon + Action + Subtitle */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Status Icon */}
                    <div className="shrink-0 flex items-center justify-center">
                      {isSuccess && (
                        <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        </div>
                      )}
                      {isBlocked && (
                        <div className="w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                          <ShieldAlert className="w-3.5 h-3.5 stroke-[2.5]" />
                        </div>
                      )}
                      {isFailed && (
                        <div className="w-6 h-6 rounded-md bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                          <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
                        </div>
                      )}
                    </div>

                    {/* Action & Summary Subtitle */}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs sm:text-sm text-white tracking-tight truncate">
                          {actionName}
                        </span>
                        {log.request_id && (
                          <span className="text-[10px] font-mono text-zinc-500 hidden md:inline">
                            #{log.request_id.slice(-6)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 truncate">
                        <span className="truncate max-w-[200px] sm:max-w-md">{summaryText}</span>
                        <span className="text-zinc-600">·</span>
                        <span className="text-zinc-400 shrink-0 font-sans">{relativeTime}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: HTTP Status Code Pill + Chevron */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span
                      className={`font-mono text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded border ${
                        isSuccess
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : isBlocked
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {statusCode}
                    </span>

                    <div
                      className={`p-1 rounded-md text-zinc-400 transition-transform duration-150 ${
                        isExpanded ? 'rotate-180 text-white bg-zinc-800' : 'hover:text-white'
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </button>

                {/* ── INLINE ACCORDION EXPANDED CONTENT (Lazy Rendered) ── */}
                {isExpanded && (
                  <div className="px-3 sm:px-4 pb-4 pt-2 border-t border-zinc-800/80 space-y-3.5 bg-[#070b14]/70 animate-in fade-in-50 duration-150">
                    {/* SECTION 1: REQUEST METRICS */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 font-mono">
                        REQUEST
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                          <span className="text-[10px] text-zinc-400 block">Action</span>
                          <span className="font-mono font-bold text-white text-[11px] truncate block">
                            {actionName}
                          </span>
                        </div>

                        <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                          <span className="text-[10px] text-zinc-400 block">Status</span>
                          <span
                            className={`font-mono font-bold text-[11px] block ${
                              isSuccess ? 'text-emerald-400' : isBlocked ? 'text-amber-400' : 'text-rose-400'
                            }`}
                          >
                            HTTP {statusCode}
                          </span>
                        </div>

                        <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                          <span className="text-[10px] text-zinc-400 block">Outcome</span>
                          <span className="font-bold text-white text-[11px] capitalize block">{outcome}</span>
                        </div>

                        <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                          <span className="text-[10px] text-zinc-400 block">Duration</span>
                          <span className="font-mono font-bold text-zinc-200 text-[11px] block">
                            {log.latency_ms || 0} ms
                          </span>
                        </div>

                        <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80 col-span-2">
                          <span className="text-[10px] text-zinc-400 block">Time (Timestamp)</span>
                          <span className="font-mono text-zinc-300 text-[11px] block truncate">{exactTime}</span>
                        </div>

                        <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80 col-span-2">
                          <span className="text-[10px] text-zinc-400 block">Quota Consumed</span>
                          <span className="font-semibold text-zinc-300 text-[11px] block">
                            {log.quota_consumed ? 'Yes (1 call deducted)' : 'No (0 calls deducted)'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: ERROR INFO (If applicable) */}
                    {(log.error_code || (!isSuccess && (log.error_message || log.message))) && (
                      <div className="space-y-1.5">
                        <span className="text-[9px] uppercase font-bold tracking-wider text-rose-400 font-mono">
                          ERROR DIAGNOSTICS
                        </span>
                        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs space-y-1.5">
                          {log.error_code && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase font-bold text-rose-300">Code:</span>
                              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold">
                                {log.error_code}
                              </span>
                            </div>
                          )}
                          <div>
                            <span className="text-[10px] uppercase font-bold text-rose-300 block mb-0.5">
                              Message:
                            </span>
                            <p className="text-[11px] text-rose-200 font-medium leading-relaxed break-words font-mono">
                              {log.error_message || log.message || 'No additional error text provided.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SECTION 3: REQUEST ID */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 font-mono">
                        REQUEST ID
                      </span>
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-950 border border-zinc-800/90 font-mono text-xs">
                        <span className="flex-1 text-zinc-300 text-[11px] select-all break-all">
                          {log.request_id || log.id || 'N/A'}
                        </span>
                        {(log.request_id || log.id) && (
                          <button
                            type="button"
                            onClick={(e) => handleCopyRequestId(log.request_id || log.id || '', e)}
                            className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-[11px] font-semibold text-zinc-300 hover:text-white flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                          >
                            {copiedId === (log.request_id || log.id) ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* SECTION 4: DETAILS / JSON PAYLOAD */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 font-mono flex items-center gap-1">
                          <Code2 className="w-3 h-3 text-emerald-400" />
                          DETAILS & PAYLOAD
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyJson(log, e)}
                          className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-semibold text-zinc-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {copiedJsonId === rowId ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5" />
                              <span>Copy JSON</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Constrained code box with internal scroll */}
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-emerald-300/90 max-h-48 overflow-y-auto leading-relaxed select-text">
                        <pre className="whitespace-pre-wrap break-all">
                          {JSON.stringify(
                            log.details || {
                              action: log.action_key || log.action,
                              outcome: log.outcome,
                              status_code: statusCode,
                              latency_ms: log.latency_ms,
                              error_code: log.error_code,
                              error_message: log.error_message || log.message,
                              quota_consumed: log.quota_consumed,
                              requested_at: log.requested_at || log.created_at,
                              completed_at: log.completed_at,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 5. Pagination & Load More Footer */}
      {filteredLogs.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-zinc-800/60 text-xs text-zinc-400">
          <div>
            Showing <strong className="text-white">{Math.min(visibleCount, filteredLogs.length)}</strong> of{' '}
            <strong className="text-white">{filteredLogs.length}</strong> logs
          </div>

          <div className="flex items-center gap-2">
            {hasMore && (
              <button
                type="button"
                onClick={handleLoadMore}
                className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-semibold text-white hover:bg-zinc-800 hover:border-zinc-600 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <ArrowDownUp className="w-3.5 h-3.5 text-emerald-400" />
                Load More ({Math.min(pageSize, filteredLogs.length - visibleCount)} remaining)
              </button>
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500">Page size:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const size = Number(e.target.value);
                  setPageSize(size);
                  setVisibleCount(size);
                }}
                className="p-1 rounded bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 outline-none cursor-pointer"
              >
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
