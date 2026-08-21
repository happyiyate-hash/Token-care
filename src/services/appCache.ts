import { SubmittedToken, UserRewardWallet } from '../types';
import { SupabaseUserProfile } from '../lib/supabase';
import { safeSetItem, sanitizeTokenForStorage, getSubmittedTokens, getRewardWallet } from './storage';

export type SessionStatus =
  | 'authenticated_local' // Restored locally from cache
  | 'online_validated'    // Online and server sync confirmed
  | 'offline'             // Device is offline, displaying cached data
  | 'expired_revoked';    // Session token expired or revoked by server

export interface CachedAppData {
  userId: string;
  userEmail: string;
  userProfile: SupabaseUserProfile | null;
  tokens: SubmittedToken[];
  wallet: UserRewardWallet | null;
  unreadCount: number;
  lastSyncTimestamp: number; // Date.now() timestamp
  sessionStatus: SessionStatus;
}

const DB_NAME = 'tokencare_offline_cache_v1';
const STORE_NAME = 'tokencare_store';
const ACTIVE_SESSION_USER_KEY = 'tokencare_active_session_user';
const LAST_ACTIVE_USER_KEY = 'tokencare_last_active_user';

// Helper to open IndexedDB with automatic fallback
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event: any) => {
      resolve(event.target.result);
    };

    request.onerror = (event: any) => {
      reject(event.target.error || new Error('Failed to open IndexedDB'));
    };
  });
}

/**
 * Save active user session identity to localStorage for offline authentication
 */
export function saveActiveSessionUser(user: any, profile?: SupabaseUserProfile | null): void {
  if (!user || !user.id) return;
  try {
    const userPayload = {
      id: user.id,
      email: user.email || '',
      aud: user.aud || 'authenticated',
      role: user.role || 'authenticated',
      user_metadata: user.user_metadata || {},
      app_metadata: user.app_metadata || {},
      created_at: user.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    safeSetItem(ACTIVE_SESSION_USER_KEY, JSON.stringify(userPayload));
    safeSetItem(LAST_ACTIVE_USER_KEY, user.id);

    if (profile) {
      safeSetItem(`tokencare_profile_${user.id}`, JSON.stringify(profile));
    }
  } catch (err) {
    console.warn('[AppCache] Error persisting active session user:', err);
  }
}

/**
 * Synchronously retrieves the active user session from local storage or cached session token.
 * This guarantees the user stays logged in even when completely offline or during long intervals.
 */
export function getActiveSessionUser(): any | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    // 1. Direct saved active session payload
    const activeRaw = localStorage.getItem(ACTIVE_SESSION_USER_KEY);
    if (activeRaw) {
      const parsed = JSON.parse(activeRaw);
      if (parsed && parsed.id) return parsed;
    }

    // 2. Check last active user ID and cached app payload
    const lastActiveUserId = localStorage.getItem(LAST_ACTIVE_USER_KEY);
    if (lastActiveUserId) {
      const cached = getSyncCachedAppData(lastActiveUserId);
      if (cached?.userId) {
        return {
          id: cached.userId,
          email: cached.userEmail || '',
          aud: 'authenticated',
          role: 'authenticated',
          user_metadata: cached.userProfile
            ? {
                full_name: cached.userProfile.display_name,
                username: cached.userProfile.username,
                avatar_url: cached.userProfile.avatar_url,
              }
            : {},
          app_metadata: {},
        };
      }
    }

    // 3. Fallback: Parse Supabase Auth token stored in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const user = parsed?.user || parsed?.currentSession?.user;
            if (user?.id) {
              saveActiveSessionUser(user);
              return user;
            }
          } catch {}
        }
      }
    }

    // 4. Check any available tokencare_cache_* entry
    const latest = getLatestCachedAppData();
    if (latest?.userId) {
      return {
        id: latest.userId,
        email: latest.userEmail || '',
        aud: 'authenticated',
        role: 'authenticated',
        user_metadata: latest.userProfile
          ? {
              full_name: latest.userProfile.display_name,
              username: latest.userProfile.username,
              avatar_url: latest.userProfile.avatar_url,
            }
          : {},
        app_metadata: {},
      };
    }

    return null;
  } catch (err) {
    console.warn('[AppCache] getActiveSessionUser error:', err);
    return null;
  }
}

/**
 * Clear active session user from local storage (used during explicit sign out)
 */
export function clearActiveSessionUser(userId?: string): void {
  try {
    localStorage.removeItem(ACTIVE_SESSION_USER_KEY);
    localStorage.removeItem(LAST_ACTIVE_USER_KEY);
  } catch {}
  if (userId) {
    clearCachedAppData(userId).catch(() => {});
  }
}

/**
 * Save non-sensitive cached dashboard and session application payload into BOTH IndexedDB & localStorage.
 * Guarantees synchronous offline access and persistent durability.
 */
export async function setCachedAppData(data: CachedAppData): Promise<void> {
  if (!data || !data.userId) return;
  const userKey = `user_cache_${data.userId}`;

  // Always write sanitized payload to localStorage synchronously
  try {
    const sanitizedPayload: CachedAppData = {
      ...data,
      tokens: (data.tokens || []).slice(0, 60).map(sanitizeTokenForStorage),
    };
    safeSetItem(`tokencare_cache_${data.userId}`, JSON.stringify(sanitizedPayload));
    safeSetItem(LAST_ACTIVE_USER_KEY, data.userId);

    // Also persist active session user if matching
    if (data.userEmail || data.userProfile) {
      saveActiveSessionUser(
        {
          id: data.userId,
          email: data.userEmail,
          user_metadata: data.userProfile
            ? {
                full_name: data.userProfile.display_name,
                username: data.userProfile.username,
                avatar_url: data.userProfile.avatar_url,
              }
            : {},
        },
        data.userProfile
      );
    }
  } catch (lsErr) {
    console.warn('[AppCache] localStorage synchronous set note:', lsErr);
  }

  // Also write to IndexedDB asynchronously for large capacity
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(data, userKey);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[AppCache] IndexedDB set note:', err);
  }
}

/**
 * Retrieve cached dashboard and session payload for a specific authenticated user
 */
export async function getCachedAppData(userId?: string): Promise<CachedAppData | null> {
  if (!userId) return null;
  const userKey = `user_cache_${userId}`;

  // 1. Try reading from IndexedDB
  try {
    const db = await openDB();
    const result = await new Promise<CachedAppData | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(userKey);

      req.onsuccess = () => {
        resolve(req.result || null);
      };
      req.onerror = () => reject(req.error);
    });

    if (result && result.userId === userId) return result;
  } catch (err) {
    console.warn('[AppCache] IndexedDB get note:', err);
  }

  // 2. Fallback to synchronous localStorage
  return getSyncCachedAppData(userId);
}

/**
 * Synchronous local storage reader for instant synchronous hydration before React renders
 */
export function getLatestCachedAppData(): CachedAppData | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const lastActiveUserId = localStorage.getItem(LAST_ACTIVE_USER_KEY);
    if (lastActiveUserId) {
      const direct = getSyncCachedAppData(lastActiveUserId);
      if (direct) return direct;
    }

    let newest: CachedAppData | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('tokencare_cache_')) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as CachedAppData;
        if (!parsed?.userId) continue;
        if (!newest || Number(parsed.lastSyncTimestamp || 0) > Number(newest.lastSyncTimestamp || 0)) {
          newest = parsed;
        }
      } catch {}
    }
    if (newest) return newest;

    // Direct reconstruction from user-scoped storage items if cache payload is missing
    const activeUserRaw = localStorage.getItem(ACTIVE_SESSION_USER_KEY);
    if (activeUserRaw) {
      try {
        const u = JSON.parse(activeUserRaw);
        if (u?.id) {
          const profileRaw = localStorage.getItem(`tokencare_profile_${u.id}`);
          const profile = profileRaw ? JSON.parse(profileRaw) : null;
          const tokens = getSubmittedTokens(u.id);
          const wallet = getRewardWallet(u.id);
          return {
            userId: u.id,
            userEmail: u.email || '',
            userProfile: profile,
            tokens: Array.isArray(tokens) ? tokens : [],
            wallet: wallet,
            unreadCount: 0,
            lastSyncTimestamp: Date.now(),
            sessionStatus: 'offline',
          };
        }
      } catch {}
    }

    return null;
  } catch {
    return null;
  }
}

export function getSyncCachedAppData(userId?: string): CachedAppData | null {
  if (!userId) return null;
  try {
    const lsItem = localStorage.getItem(`tokencare_cache_${userId}`);
    if (lsItem) {
      const parsed = JSON.parse(lsItem) as CachedAppData;
      if (parsed && parsed.userId === userId) {
        return parsed;
      }
    }

    // Direct fallback from individual local storage records
    const profileRaw = localStorage.getItem(`tokencare_profile_${userId}`);
    const profile = profileRaw ? JSON.parse(profileRaw) : null;
    const tokens = getSubmittedTokens(userId);
    const wallet = getRewardWallet(userId);
    if (profile || (tokens && tokens.length > 0) || wallet.totalTokens > 0) {
      return {
        userId,
        userEmail: profile?.email || '',
        userProfile: profile,
        tokens: Array.isArray(tokens) ? tokens : [],
        wallet,
        unreadCount: 0,
        lastSyncTimestamp: Date.now(),
        sessionStatus: 'offline',
      };
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Clear user-scoped cached application data
 */
export async function clearCachedAppData(userId?: string): Promise<void> {
  if (!userId) return;
  const userKey = `user_cache_${userId}`;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(userKey);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore
  }

  try {
    localStorage.removeItem(`tokencare_cache_${userId}`);
    localStorage.removeItem(`tokencare_profile_${userId}`);
  } catch {
    // Ignore
  }
}
