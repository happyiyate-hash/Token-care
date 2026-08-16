import { getSupabase } from './supabase';

/**
 * Remove legacy duplicate notification events from the local cache before the
 * notification center reads it. This is a cache repair, not the source of truth:
 * Supabase now enforces the same event-level uniqueness in the database.
 */
function repairNotificationCaches(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('tokencare_notifications_')) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;

      const byEvent = new Map<string, any>();
      for (const notification of parsed) {
        if (!notification || typeof notification !== 'object') continue;
        const fingerprint = [
          String(notification.type || '').trim().toLowerCase(),
          String(notification.title || '').trim().toLowerCase(),
          String(notification.message || '').trim(),
          String(notification.action_url || '').trim(),
        ].join('|');

        const existing = byEvent.get(fingerprint);
        if (!existing) {
          byEvent.set(fingerprint, notification);
        } else if (notification.is_read && !existing.is_read) {
          byEvent.set(fingerprint, { ...notification, is_read: true });
        }
      }

      const repaired = Array.from(byEvent.values())
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 30);

      window.localStorage.setItem(key, JSON.stringify(repaired));
    }
  } catch (error) {
    console.warn('[Notifications] Local cache repair skipped:', error);
  }
}

// NotificationCenterView imports this module before its initial state is created,
// so old duplicate cache entries are repaired before they can flash on screen.
repairNotificationCaches();

/** Delete one notification belonging to the currently authenticated user. */
export async function deleteNotificationFromSupabase(notificationId: string): Promise<boolean> {
  if (!notificationId) return false;
  const supabase = getSupabase();

  try {
    const { data, error } = await supabase.rpc('delete_my_notification', {
      p_notification_id: notificationId,
    });
    if (error) throw error;
    return data === true || data === 'true' || data === 1;
  } catch (error) {
    console.warn('[Notifications] Delete notification failed:', error);
    return false;
  }
}

/** Delete every notification belonging to the currently authenticated user. */
export async function deleteAllNotificationsFromSupabase(): Promise<boolean> {
  const supabase = getSupabase();

  try {
    const { error } = await supabase.rpc('delete_all_my_notifications');
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('[Notifications] Delete all notifications failed:', error);
    return false;
  }
}
