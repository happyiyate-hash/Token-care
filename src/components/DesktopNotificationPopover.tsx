import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  CheckCheck,
  ChevronDown,
  Coins,
  ExternalLink,
  FileText,
  Gift,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  AppNotification,
  fetchUserNotifications,
  getCachedNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  saveCachedNotifications,
  subscribeToRealtimeNotifications,
} from '../lib/supabase';
import {
  deleteAllNotificationsFromSupabase,
  deleteNotificationFromSupabase,
} from '../lib/notificationActions';

interface DesktopNotificationPopoverProps {
  currentUser?: any;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTab?: (tab: string) => void;
  onUnreadCountChange?: (count: number) => void;
}

const notificationFingerprint = (n: AppNotification) => [
  String(n?.type || '').trim().toLowerCase(),
  String(n?.title || '').trim().toLowerCase(),
  String(n?.message || '').trim(),
  String(n?.action_url || '').trim(),
].join('|');

const dedupeNotifications = (items: AppNotification[]): AppNotification[] => {
  const map = new Map<string, AppNotification>();
  for (const item of items || []) {
    if (!item?.id) continue;
    const key = notificationFingerprint(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }

    const existingTime = new Date(existing.created_at || 0).getTime();
    const itemTime = new Date(item.created_at || 0).getTime();
    const preferred = itemTime >= existingTime ? item : existing;
    map.set(key, {
      ...preferred,
      is_read: Boolean(existing.is_read || item.is_read),
    });
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
};

export const DesktopNotificationPopover: React.FC<DesktopNotificationPopoverProps> = ({
  currentUser,
  isOpen,
  onClose,
  onNavigateToTab,
  onUnreadCountChange,
}) => {
  const userId = currentUser?.id || 'demo-user-id';
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    dedupeNotifications(getCachedNotifications(userId))
  );
  const [loading, setLoading] = useState(() => getCachedNotifications(userId).length === 0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'rewards' | 'transactions' | 'system'>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});
  const popoverRef = useRef<HTMLDivElement>(null);

  const syncNotifications = async () => {
    try {
      const fresh = dedupeNotifications(await fetchUserNotifications(userId));
      setNotifications(fresh);
      saveCachedNotifications(userId, fresh);
      onUnreadCountChange?.(fresh.filter((n) => !n.is_read).length);
    } catch (error) {
      console.warn('[Notifications] Sync failed:', error);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setIsSyncing(notifications.length > 0);
      try {
        const fresh = dedupeNotifications(await fetchUserNotifications(userId));
        if (!mounted) return;
        setNotifications(fresh);
        saveCachedNotifications(userId, fresh);
        onUnreadCountChange?.(fresh.filter((n) => !n.is_read).length);
      } catch (error) {
        console.warn('[Notifications] Initial sync failed:', error);
      } finally {
        if (mounted) {
          setLoading(false);
          setIsSyncing(false);
        }
      }
    };
    run();

    const unsubscribe = subscribeToRealtimeNotifications(userId, (incoming) => {
      if (!mounted) return;
      if (!incoming) {
        syncNotifications();
        return;
      }
      setNotifications((prev) => {
        const byId = prev.findIndex((n) => n.id === incoming.id);
        const withIncoming =
          byId >= 0
            ? prev.map((n, i) => (i === byId ? { ...incoming, is_read: n.is_read || incoming.is_read } : n))
            : [incoming, ...prev];
        const next = dedupeNotifications(withIncoming);
        saveCachedNotifications(userId, next);
        onUnreadCountChange?.(next.filter((n) => !n.is_read).length);
        return next;
      });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [userId]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const markRead = async (id: string) => {
    const target = notifications.find((n) => n.id === id);
    if (!target || target.is_read) return;
    const next = notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
    setNotifications(next);
    saveCachedNotifications(userId, next);
    onUnreadCountChange?.(next.filter((n) => !n.is_read).length);
    try {
      await markNotificationAsRead(id, userId);
    } catch (error) {
      console.warn('[Notifications] Mark read failed:', error);
    }
  };

  const markAllRead = async () => {
    if (!notifications.some((n) => !n.is_read)) return;
    const next = notifications.map((n) => ({ ...n, is_read: true }));
    setNotifications(next);
    saveCachedNotifications(userId, next);
    onUnreadCountChange?.(0);
    try {
      await markAllNotificationsAsRead(userId);
    } catch (error) {
      console.warn('[Notifications] Mark all read failed:', error);
    }
  };

  const deleteOne = async (id: string) => {
    if (deletingIds[id]) return;
    setDeletingIds((prev) => ({ ...prev, [id]: true }));
    const success = await deleteNotificationFromSupabase(id);
    if (success) {
      const next = notifications.filter((n) => n.id !== id);
      setNotifications(next);
      saveCachedNotifications(userId, next);
      onUnreadCountChange?.(next.filter((n) => !n.is_read).length);
      setExpandedIds((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }
    setDeletingIds((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const deleteAll = async () => {
    if (!notifications.length) return;
    setIsSyncing(true);
    const success = await deleteAllNotificationsFromSupabase();
    if (success) {
      setNotifications([]);
      saveCachedNotifications(userId, []);
      onUnreadCountChange?.(0);
      setExpandedIds({});
    }
    setIsSyncing(false);
  };

  const category = (n: AppNotification) => {
    const type = (n.type || '').toLowerCase();
    const cat = String(n.metadata?.category || '').toLowerCase();
    if (type.includes('reward') || type.includes('donat') || cat === 'rewards') return 'rewards';
    if (
      type.includes('withdraw') ||
      type.includes('payout') ||
      type.includes('transaction') ||
      type.includes('tx') ||
      cat === 'transactions'
    )
      return 'transactions';
    if (
      type.includes('security') ||
      type.includes('system') ||
      type.includes('alert') ||
      type.includes('login') ||
      cat === 'system'
    )
      return 'system';
    return 'all';
  };

  const filtered = notifications.filter((n) => activeFilter === 'all' || category(n) === activeFilter);
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const counts = {
    all: notifications.length,
    rewards: notifications.filter((n) => category(n) === 'rewards').length,
    transactions: notifications.filter((n) => category(n) === 'transactions').length,
    system: notifications.filter((n) => category(n) === 'system').length,
  };

  const iconFor = (n: AppNotification) => {
    const type = (n.type || '').toLowerCase();
    const title = (n.title || '').toLowerCase();
    if (
      type.includes('security') ||
      type.includes('login') ||
      title.includes('security') ||
      title.includes('login')
    )
      return <ShieldCheck className="w-3.5 h-3.5" />;
    if (type.includes('reward') || title.includes('reward')) return <Coins className="w-3.5 h-3.5" />;
    if (title.includes('welcome')) return <Gift className="w-3.5 h-3.5" />;
    if (type.includes('withdraw') || title.includes('approved')) return <ArrowDown className="w-3.5 h-3.5" />;
    if (type.includes('failed') || title.includes('rejected')) return <ArrowUp className="w-3.5 h-3.5" />;
    if (title.includes('token')) return <FileText className="w-3.5 h-3.5" />;
    return <Bell className="w-3.5 h-3.5" />;
  };

  const timeAgo = (date: string) => {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <>
      {/* Invisible backdrop to dismiss when clicking outside */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Floating Corner Notification Card */}
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Notification Center"
        className="fixed top-16 right-4 sm:right-6 lg:right-10 z-50 w-full max-w-[400px] sm:max-w-[420px] max-h-[580px] flex flex-col bg-[#090C13] border border-emerald-500/30 rounded-2xl shadow-[0_12px_45px_rgba(0,0,0,0.85)] backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden text-white font-sans"
      >
        {/* Card Header with Cancel / Close Button */}
        <div className="shrink-0 border-b border-zinc-800/80 px-4 py-3 bg-[#0B0F19] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Bell className="w-4 h-4" />
            </div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-white tracking-tight">Notifications</h3>
              {isSyncing && <RefreshCw className="w-3 h-3 text-emerald-400 animate-spin" />}
            </div>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono">
                {unreadCount} unread
              </span>
            )}
          </div>

          {/* Cancel / Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close notifications"
            aria-label="Close notifications"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Tabs & Quick Actions */}
        <div className="shrink-0 border-b border-zinc-800/60 px-3 py-2 bg-[#080B12] space-y-2">
          <div className="flex gap-1">
            {(['all', 'rewards', 'transactions', 'system'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveFilter(tab)}
                className={`flex-1 py-1 rounded-lg text-[10.5px] capitalize border transition-colors font-medium cursor-pointer ${
                  activeFilter === tab
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-bold'
                    : 'text-zinc-400 border-transparent bg-zinc-900/50 hover:bg-zinc-800/60'
                }`}
              >
                {tab} {counts[tab] > 0 && <span className="ml-1 text-[9.5px] opacity-80">({counts[tab]})</span>}
              </button>
            ))}
          </div>

          {notifications.length > 0 && (
            <div className="flex items-center justify-between text-[11px] px-1 text-zinc-400">
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 hover:text-emerald-300 cursor-pointer transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> Mark all as read
              </button>
              <button
                type="button"
                onClick={deleteAll}
                className="flex items-center gap-1 text-rose-400/90 hover:text-rose-300 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear all
              </button>
            </div>
          )}
        </div>

        {/* Notification Items List */}
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-zinc-800/50 bg-[#06080E]">
          {loading ? (
            <div className="py-12 text-center">
              <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin mx-auto mb-2" />
              <p className="text-xs text-zinc-400">Loading notifications...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center px-6">
              <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mx-auto mb-2.5">
                <Bell className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-zinc-300">No notifications yet</h4>
              <p className="text-[11px] text-zinc-500 mt-1 max-w-[220px] mx-auto">
                Real-time transaction alerts, reward deposits, and security notices will appear here.
              </p>
            </div>
          ) : (
            filtered.map((n) => {
              const expanded = !!expandedIds[n.id];
              const deleting = !!deletingIds[n.id];
              return (
                <div
                  key={n.id}
                  className={`w-full py-2.5 px-3.5 transition-colors ${
                    expanded
                      ? 'bg-zinc-900/60'
                      : !n.is_read
                      ? 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.07]'
                      : 'hover:bg-zinc-900/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="relative shrink-0 pt-0.5">
                      <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400 shadow-sm">
                        {iconFor(n)}
                      </div>
                      {!n.is_read && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#090C13]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            markRead(n.id);
                            setExpandedIds((p) => ({ ...p, [n.id]: !p[n.id] }));
                          }}
                          className="min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h5
                              className={`text-[12px] leading-tight truncate ${
                                !n.is_read ? 'font-bold text-white' : 'font-medium text-zinc-200'
                              }`}
                            >
                              {n.title}
                            </h5>
                            <span className="text-[9.5px] text-zinc-500 font-mono shrink-0">
                              {timeAgo(n.created_at)}
                            </span>
                          </div>
                          <p
                            className={`text-[11px] text-zinc-400 mt-0.5 leading-snug ${
                              expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
                            }`}
                          >
                            {n.message}
                          </p>
                        </button>

                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => deleteOne(n.id)}
                          title="Delete notification"
                          aria-label="Delete notification"
                          className="shrink-0 p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {deleting ? (
                            <RefreshCw className="w-3 h-3 animate-spin text-rose-400" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      {expanded && (
                        <div className="mt-2 pt-2 border-t border-zinc-800/60">
                          {n.action_url && onNavigateToTab && (
                            <button
                              type="button"
                              onClick={() => {
                                onNavigateToTab(n.action_url!.replace('/', ''));
                                onClose();
                              }}
                              className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10.5px] font-semibold hover:bg-emerald-500/25 transition-colors cursor-pointer"
                            >
                              View Details <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};
