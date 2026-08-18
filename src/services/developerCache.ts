import { DeveloperApiLog, DeveloperPlan, DeveloperProject, DeveloperQuota, DeveloperSubscription, DeveloperUsage } from './developerApi';

export interface CachedDeveloperViewData {
  userId: string;
  project: DeveloperProject | null;
  quota: DeveloperQuota | null;
  plans: DeveloperPlan[];
  subscriptions: DeveloperSubscription[];
  usage: DeveloperUsage[];
  logs: DeveloperApiLog[];
  lastSyncTimestamp: number;
}

const PREFIX = 'tokencare_developer_view_v1_';

function key(userId: string) {
  return `${PREFIX}${userId}`;
}

/**
 * Developer dashboard cache. This is deliberately user-scoped so one signed-in
 * account can never hydrate another account's Developer page.
 */
export function getCachedDeveloperView(userId?: string): CachedDeveloperViewData | null {
  if (!userId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDeveloperViewData;
    if (parsed?.userId !== userId) return null;
    
    // Strict project validation: only consider a project cached if it has a real string ID
    if (!parsed?.project || typeof parsed.project.id !== 'string' || !parsed.project.id.trim()) {
      return null;
    }
    
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedDeveloperView(data: CachedDeveloperViewData): void {
  if (!data?.userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key(data.userId), JSON.stringify(data));
  } catch (err) {
    console.warn('[DeveloperCache] Unable to persist Developer dashboard:', err);
  }
}

export function clearCachedDeveloperView(userId?: string): void {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key(userId));
  } catch {
    // Ignore cache cleanup errors.
  }
}
