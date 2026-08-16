import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Bell, CheckCheck, ChevronDown, Coins, ExternalLink, FileText, Gift, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { AppNotification, fetchUserNotifications, getCachedNotifications, markAllNotificationsAsRead, markNotificationAsRead, saveCachedNotifications, subscribeToRealtimeNotifications } from '../lib/supabase';
import { deleteAllNotificationsFromSupabase, deleteNotificationFromSupabase } from '../lib/notificationActions';

interface NotificationCenterViewProps { currentUser?: any; onClose?: () => void; onNavigateToTab?: (tab: string) => void; onUnreadCountChange?: (count: number) => void; }
interface NotificationDetailsProps { details?: Record<string, any>; }

const notificationFingerprint = (n: AppNotification) => [
  String(n?.type || '').trim().toLowerCase(),
  String(n?.title || '').trim().toLowerCase(),
  String(n?.message || '').trim(),
  String(n?.action_url || '').trim(),
].join('|');

/**
 * One logical event must render once even if an old cache entry, a Realtime
 * delivery, and the database row all have different IDs. The database now
 * enforces the same event-level uniqueness; this is the final client guard.
 */
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

export const NotificationDetails: React.FC<NotificationDetailsProps> = ({ details }) => {
  if (!details || typeof details !== 'object') return null;
  const entries = Object.entries(details).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  if (!entries.length) return null;
  return <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-1">{entries.map(([key, value]) => <div key={key} className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 text-[10.5px]"><span className="text-zinc-500 font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</span><span className="text-zinc-200 break-words">{String(value)}</span></div>)}</div>;
};

export const NotificationCenterView: React.FC<NotificationCenterViewProps> = ({ currentUser, onClose, onNavigateToTab, onUnreadCountChange }) => {
  const userId = currentUser?.id || 'demo-user-id';
  const [notifications, setNotifications] = useState<AppNotification[]>(() => dedupeNotifications(getCachedNotifications(userId)));
  const [loading, setLoading] = useState(() => getCachedNotifications(userId).length === 0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'rewards' | 'transactions' | 'system'>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});

  const syncNotifications = async () => {
    try {
      const fresh = dedupeNotifications(await fetchUserNotifications(userId));
      setNotifications(fresh);
      saveCachedNotifications(userId, fresh);
      onUnreadCountChange?.(fresh.filter(n => !n.is_read).length);
    } catch (error) { console.warn('[Notifications] Sync failed:', error); }
    finally { setLoading(false); setIsSyncing(false); }
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
        onUnreadCountChange?.(fresh.filter(n => !n.is_read).length);
      } catch (error) { console.warn('[Notifications] Initial sync failed:', error); }
      finally { if (mounted) { setLoading(false); setIsSyncing(false); } }
    };
    run();
    const unsubscribe = subscribeToRealtimeNotifications(userId, incoming => {
      if (!mounted) return;
      if (!incoming) { syncNotifications(); return; }
      setNotifications(prev => {
        const byId = prev.findIndex(n => n.id === incoming.id);
        const withIncoming = byId >= 0
          ? prev.map((n, i) => i === byId ? { ...incoming, is_read: n.is_read || incoming.is_read } : n)
          : [incoming, ...prev];
        const next = dedupeNotifications(withIncoming);
        saveCachedNotifications(userId, next);
        onUnreadCountChange?.(next.filter(n => !n.is_read).length);
        return next;
      });
    });
    return () => { mounted = false; unsubscribe(); };
  }, [userId]);

  const markRead = async (id: string) => {
    const target = notifications.find(n => n.id === id);
    if (!target || target.is_read) return;
    const next = notifications.map(n => n.id === id ? { ...n, is_read: true } : n);
    setNotifications(next); saveCachedNotifications(userId, next); onUnreadCountChange?.(next.filter(n => !n.is_read).length);
    try { await markNotificationAsRead(id, userId); } catch (error) { console.warn('[Notifications] Mark read failed:', error); }
  };

  const markAllRead = async () => {
    if (!notifications.some(n => !n.is_read)) return;
    const next = notifications.map(n => ({ ...n, is_read: true }));
    setNotifications(next); saveCachedNotifications(userId, next); onUnreadCountChange?.(0);
    try { await markAllNotificationsAsRead(userId); } catch (error) { console.warn('[Notifications] Mark all read failed:', error); }
  };

  const deleteOne = async (id: string) => {
    if (deletingIds[id]) return;
    setDeletingIds(prev => ({ ...prev, [id]: true }));
    const success = await deleteNotificationFromSupabase(id);
    if (success) {
      const next = notifications.filter(n => n.id !== id);
      setNotifications(next); saveCachedNotifications(userId, next); onUnreadCountChange?.(next.filter(n => !n.is_read).length);
      setExpandedIds(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
    }
    setDeletingIds(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
  };

  const deleteAll = async () => {
    if (!notifications.length) return;
    setIsSyncing(true);
    const success = await deleteAllNotificationsFromSupabase();
    if (success) { setNotifications([]); saveCachedNotifications(userId, []); onUnreadCountChange?.(0); setExpandedIds({}); }
    setIsSyncing(false);
  };

  const category = (n: AppNotification) => {
    const type = (n.type || '').toLowerCase();
    const cat = String(n.metadata?.category || '').toLowerCase();
    if (type.includes('reward') || type.includes('donat') || cat === 'rewards') return 'rewards';
    if (type.includes('withdraw') || type.includes('payout') || type.includes('transaction') || type.includes('tx') || cat === 'transactions') return 'transactions';
    if (type.includes('security') || type.includes('system') || type.includes('alert') || type.includes('login') || cat === 'system') return 'system';
    return 'all';
  };

  const filtered = useMemo(() => {
    return notifications.filter(n => activeFilter === 'all' || category(n) === activeFilter);
  }, [notifications, activeFilter]);

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const counts = { all: notifications.length, rewards: notifications.filter(n => category(n) === 'rewards').length, transactions: notifications.filter(n => category(n) === 'transactions').length, system: notifications.filter(n => category(n) === 'system').length };

  const iconFor = (n: AppNotification) => {
    const type = (n.type || '').toLowerCase(); const title = (n.title || '').toLowerCase();
    if (type.includes('security') || type.includes('login') || title.includes('security') || title.includes('login')) return <ShieldCheck className="w-3.5 h-3.5" />;
    if (type.includes('reward') || title.includes('reward')) return <Coins className="w-3.5 h-3.5" />;
    if (title.includes('welcome')) return <Gift className="w-3.5 h-3.5" />;
    if (type.includes('withdraw') || title.includes('approved')) return <ArrowDown className="w-3.5 h-3.5" />;
    if (type.includes('failed') || title.includes('rejected')) return <ArrowUp className="w-3.5 h-3.5" />;
    if (title.includes('token')) return <FileText className="w-3.5 h-3.5" />;
    return <Bell className="w-3.5 h-3.5" />;
  };

  const timeAgo = (date: string) => { const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000)); if (seconds < 60) return 'Just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; };

  return <div className="w-full h-full flex flex-col min-h-0 overflow-hidden bg-[#06080E] text-white font-sans">
    <header className="shrink-0 border-b border-white/[0.04] px-3 py-2 pt-safe-nav max-w-md mx-auto w-full flex items-center justify-between">
      <div className="flex items-center gap-2">{onClose && <button type="button" onClick={onClose} className="px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded-md text-xs text-zinc-300 flex items-center gap-1"><ArrowLeft className="w-3 h-3 text-[#4ADE80]" /> Back</button>}<h1 className="text-sm font-bold flex items-center gap-1.5">Notifications <Bell className="w-3.5 h-3.5 text-[#4ADE80]" /></h1>{isSyncing && <RefreshCw className="w-3 h-3 text-[#4ADE80] animate-spin" />}</div>
      {unreadCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#22C55E]/15 text-[#4ADE80]">{unreadCount} unread</span>}
    </header>
    <div className="shrink-0 border-b border-white/[0.04] px-3 py-1.5 max-w-md mx-auto w-full space-y-1.5">
      <div className="flex gap-1">{(['all','rewards','transactions','system'] as const).map(tab => <button key={tab} type="button" onClick={() => setActiveFilter(tab)} className={`flex-1 py-1 rounded-md text-[10px] capitalize border ${activeFilter === tab ? 'bg-[#22C55E]/15 text-[#4ADE80] border-[#22C55E]/25 font-bold' : 'text-zinc-400 border-transparent bg-white/[0.02]'}`}>{tab} {counts[tab] > 0 && <span className="ml-1">{counts[tab]}</span>}</button>)}</div>
      {notifications.length > 0 && <div className="flex items-center justify-between text-[10px] text-zinc-400"><button type="button" onClick={markAllRead} className="flex items-center gap-1 hover:text-emerald-400"><CheckCheck className="w-3 h-3" /> Mark all read</button><button type="button" onClick={deleteAll} className="flex items-center gap-1 text-rose-400 hover:text-rose-300"><Trash2 className="w-3 h-3" /> Delete all</button></div>}
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto max-w-md mx-auto w-full divide-y divide-white/[0.03]">
      {loading ? <div className="py-12 text-center"><RefreshCw className="w-4 h-4 text-[#4ADE80] animate-spin mx-auto" /></div> : filtered.length === 0 ? <div className="py-12 text-center px-6"><Bell className="w-6 h-6 text-zinc-600 mx-auto mb-2" /><h3 className="text-xs font-bold">No notifications</h3><p className="text-[11px] text-zinc-500 mt-1">Your notification activity will appear here.</p></div> : filtered.map(n => {
        const expanded = !!expandedIds[n.id]; const deleting = !!deletingIds[n.id];
        return <div key={n.id} className={`w-full py-2 px-3 ${expanded ? 'bg-white/[0.04]' : !n.is_read ? 'bg-emerald-500/[0.03]' : ''}`}>
          <div className="flex items-start gap-2.5"><div className="relative shrink-0 pt-0.5"><div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[#4ADE80]">{iconFor(n)}</div>{!n.is_read && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#22C55E] ring-2 ring-[#06080E]" />}</div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-1"><button type="button" onClick={() => { markRead(n.id); setExpandedIds(p => ({ ...p, [n.id]: !p[n.id] })); }} className="min-w-0 flex-1 text-left"><div className="flex items-center justify-between gap-2"><h4 className={`text-[12px] leading-tight truncate ${!n.is_read ? 'font-bold text-white' : 'font-semibold text-zinc-200'}`}>{n.title}</h4><span className="text-[9px] text-zinc-500 shrink-0">{timeAgo(n.created_at)}</span></div><p className={`text-[11px] text-zinc-400 mt-0.5 leading-tight ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-1'}`}>{n.message}</p></button>
              <button type="button" disabled={deleting} onClick={() => deleteOne(n.id)} title="Delete notification" aria-label="Delete notification" className="shrink-0 p-1.5 rounded-md text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">{deleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}</button><ChevronDown className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform ${expanded ? 'rotate-180 text-[#4ADE80]' : ''}`} /></div>
              {expanded && <div className="mt-2"><NotificationDetails details={n.metadata} />{n.action_url && onNavigateToTab && <button type="button" onClick={() => onNavigateToTab(n.action_url!.replace('/', ''))} className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#22C55E]/15 text-[#4ADE80] border border-[#22C55E]/25 text-[10px] font-semibold">View Details <ExternalLink className="w-2.5 h-2.5" /></button>}</div>}
            </div></div>
        </div>;
      })}
    </div>
  </div>;
};
