import { getSupabase } from '../lib/supabase';

export interface DeveloperProject {
  id: string;
  user_id: string;
  project_name: string;
  api_key: string;
  plan_code: string;
  daily_limit: number;
  is_active?: boolean;
  suspended_at?: string | null;
  subscription_status?: string;
  subscription_started_at?: string | null;
  subscription_expires_at?: string | null;
  quota_updated_at?: string;
  quota_locked?: boolean;
  quota_locked_until?: string | null;
  quota_lock_reason?: string | null;
  allowed_origins?: string[];
  webhook_url?: string;
  project_password_hash?: string | null;
  password_hash?: string | null;
  api_key_rotated_at?: string | null;
  api_key_rotation_available_at?: string | null;
  api_key_last_rotated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeveloperPlan {
  code: string;
  name: string;
  monthly_price_usd: number;
  daily_limit: number;
  is_active: boolean;
  created_at?: string;
}

export interface DeveloperSubscription {
  id: string;
  project_id: string;
  user_id: string;
  plan_code: string;
  status: string;
  started_at: string;
  expires_at?: string | null;
  provider?: string | null;
  provider_subscription_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeveloperDailyUsage {
  project_id?: string;
  usage_date: string;
  calls: number;
  successful_calls: number;
  blocked_calls: number;
}
export type DeveloperUsage = DeveloperDailyUsage;

export interface DeveloperRequestLog {
  id?: string;
  request_id?: string;
  project_id?: string;
  endpoint: string;
  method: string;
  status_code?: number;
  status?: number;
  latency_ms: number;
  error_code?: string | null;
  quota_consumed?: number;
  action?: string;
  created_at?: string;
  completed_at?: string;
  timestamp?: string;
  user_agent?: string;
}
export type DeveloperApiLog = DeveloperRequestLog;

export interface DeveloperQuota {
  has_project: boolean;
  project?: {
    id: string;
    project_name: string;
    api_key: string;
    plan_code: string;
    daily_limit: number;
    is_active: boolean;
    subscription_status: string;
    subscription_started_at?: string | null;
    subscription_expires_at?: string | null;
    quota_locked?: boolean;
    quota_locked_until?: string | null;
    quota_lock_reason?: string | null;
    api_key_rotated_at?: string | null;
    api_key_rotation_available_at?: string | null;
  };
  usage?: {
    usage_date: string;
    used: number;
    successful: number;
    blocked: number;
    limit: number;
    remaining: number;
  };
}

export interface DeveloperApiKey {
  id: string;
  name: string;
  key?: string;
  masked_key?: string;
  created_at?: string;
  last_used_at?: string;
  is_active?: boolean;
  status?: string;
  rate_limit?: number;
  usage_count?: number;
}

export const DEFAULT_DEVELOPER_PLANS: DeveloperPlan[] = [
  { code: 'free', name: 'Free', monthly_price_usd: 0, daily_limit: 100, is_active: true },
  { code: 'starter', name: 'Starter', monthly_price_usd: 5, daily_limit: 1000, is_active: true },
  { code: 'growth', name: 'Growth', monthly_price_usd: 10, daily_limit: 5000, is_active: true },
  { code: 'pro', name: 'Pro', monthly_price_usd: 20, daily_limit: 25000, is_active: true },
  { code: 'business', name: 'Business', monthly_price_usd: 50, daily_limit: 100000, is_active: true },
  { code: 'scale', name: 'Scale', monthly_price_usd: 100, daily_limit: 500000, is_active: true },
];

const supabase = () => getSupabase();

function unwrapRpc<T>(data: any): T | null {
  if (!data) return null;
  return (Array.isArray(data) ? data[0] : data) as T | null;
}

function normalizeProject(project: DeveloperProject | null): DeveloperProject | null {
  if (!project) return null;
  return {
    ...project,
    password_hash: undefined,
    project_password_hash: undefined,
  };
}

export async function getDeveloperProject(): Promise<DeveloperProject | null> {
  try {
    const { data, error } = await supabase().rpc('get_my_developer_project');
    if (!error && data) return normalizeProject(unwrapRpc<DeveloperProject>(data));
  } catch (e) {
    console.warn('[DeveloperAPI] get_my_developer_project:', e);
  }

  try {
    const { data: { user } } = await supabase().auth.getUser();
    if (!user?.id) return null;
    const { data } = await supabase().from('developer_projects').select('*').eq('user_id', user.id).maybeSingle();
    return normalizeProject((data as DeveloperProject) || null);
  } catch (e) {
    console.warn('[DeveloperAPI] developer_projects fallback:', e);
    return null;
  }
}

/** Deprecated compatibility helper. Password verification is authoritative in Supabase. */
export async function hashProjectPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getStoredProjectPasswordHash(_projectId: string): string | null { return null; }
export function saveStoredProjectPasswordHash(_projectId: string, _hash: string): void {}

export async function verifyProjectPassword(inputPassword: string, _project?: DeveloperProject): Promise<boolean> {
  const password = inputPassword?.trim();
  if (!password) return false;
  const { data, error } = await supabase().rpc('verify_my_developer_project_password', { p_password: password });
  if (error) {
    console.warn('[DeveloperAPI] verify_my_developer_project_password:', error);
    return false;
  }
  return data === true || data === 'true';
}

/**
 * Password changes are database-authoritative. The current password must be verified by the UI
 * before this function is called; the database function below performs the actual hash update.
 */
export async function updateProjectPassword(_projectId: string, newPassword: string, currentPassword?: string): Promise<void> {
  if (!newPassword?.trim()) throw new Error('New project password is required.');
  if (newPassword.trim().length < 12) throw new Error('Project password must be at least 12 characters.');
  if (!currentPassword?.trim()) throw new Error('Current project password is required.');

  const { data: valid, error: verifyError } = await supabase().rpc('verify_my_developer_project_password', { p_password: currentPassword.trim() });
  if (verifyError || !(valid === true || valid === 'true')) throw new Error('PROJECT_PASSWORD_INVALID');

  const { error } = await supabase().rpc('change_my_developer_project_password', {
    p_current_password: currentPassword.trim(),
    p_new_password: newPassword.trim(),
  });
  if (error) throw new Error(error.message || 'Unable to change project password.');
}

export const ROTATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function getApiKeyRotationCooldown(project: DeveloperProject): {
  isLocked: boolean;
  hoursRemaining: number;
  minutesRemaining: number;
  formattedRemaining: string;
  lastRotatedAt: Date | null;
} {
  const availableAt = project.api_key_rotation_available_at;
  if (availableAt) {
    const remaining = new Date(availableAt).getTime() - Date.now();
    if (remaining > 0) {
      const totalMinutes = Math.ceil(remaining / 60000);
      const hoursRemaining = Math.floor(totalMinutes / 60);
      const minutesRemaining = totalMinutes % 60;
      return {
        isLocked: true,
        hoursRemaining,
        minutesRemaining,
        formattedRemaining: hoursRemaining > 0 ? `${hoursRemaining}h ${minutesRemaining}m` : `${minutesRemaining}m`,
        lastRotatedAt: project.api_key_rotated_at ? new Date(project.api_key_rotated_at) : null,
      };
    }
    return { isLocked: false, hoursRemaining: 0, minutesRemaining: 0, formattedRemaining: '', lastRotatedAt: project.api_key_rotated_at ? new Date(project.api_key_rotated_at) : null };
  }

  const last = project.api_key_rotated_at || project.api_key_last_rotated_at;
  if (!last) return { isLocked: false, hoursRemaining: 0, minutesRemaining: 0, formattedRemaining: '', lastRotatedAt: null };
  const remaining = new Date(last).getTime() + ROTATION_COOLDOWN_MS - Date.now();
  if (remaining <= 0) return { isLocked: false, hoursRemaining: 0, minutesRemaining: 0, formattedRemaining: '', lastRotatedAt: new Date(last) };
  const totalMinutes = Math.ceil(remaining / 60000);
  const hoursRemaining = Math.floor(totalMinutes / 60);
  const minutesRemaining = totalMinutes % 60;
  return { isLocked: true, hoursRemaining, minutesRemaining, formattedRemaining: hoursRemaining > 0 ? `${hoursRemaining}h ${minutesRemaining}m` : `${minutesRemaining}m`, lastRotatedAt: new Date(last) };
}

export function recordApiKeyRotated(_projectId: string): void {}

export async function createDeveloperProject(projectName: string, projectPassword: string): Promise<DeveloperProject> {
  const name = projectName.trim() || 'My TokenCare App';
  const password = projectPassword?.trim();
  if (!password) throw new Error('Project password is required.');
  if (password.length < 12) throw new Error('Project password must be at least 12 characters long.');

  const { data: authData, error: authError } = await supabase().auth.getUser();
  if (authError || !authData?.user) throw new Error('You must be signed in to create a developer project.');

  const { data, error } = await supabase().rpc('create_my_developer_project', {
    p_project_name: name,
    p_project_password: password,
  });
  if (error) throw new Error(error.message || 'Unable to create developer project in Supabase.');

  const project = normalizeProject(unwrapRpc<DeveloperProject>(data));
  if (project) return project;
  const fresh = await getDeveloperProject();
  if (!fresh) throw new Error('Developer project was not returned by Supabase.');
  return fresh;
}

export async function getDeveloperQuota(): Promise<DeveloperQuota> {
  try {
    const { data, error } = await supabase().rpc('get_my_developer_quota');
    if (!error && data) return data as DeveloperQuota;
  } catch (e) {
    console.warn('[DeveloperAPI] get_my_developer_quota:', e);
  }
  return { has_project: false };
}

export async function getDeveloperPlans(): Promise<DeveloperPlan[]> {
  try {
    const { data, error } = await supabase().from('developer_plans').select('code, name, monthly_price_usd, daily_limit, is_active, created_at').eq('is_active', true).order('monthly_price_usd', { ascending: true });
    if (!error && Array.isArray(data) && data.length) return data as DeveloperPlan[];
  } catch (e) {
    console.warn('[DeveloperAPI] developer_plans:', e);
  }
  return DEFAULT_DEVELOPER_PLANS;
}

export async function getDeveloperSubscriptions(): Promise<DeveloperSubscription[]> {
  try {
    const { data, error } = await supabase().rpc('get_my_developer_subscriptions');
    if (!error && Array.isArray(data)) return data as DeveloperSubscription[];
  } catch (e) {
    console.warn('[DeveloperAPI] subscriptions:', e);
  }
  return [];
}

export async function updateDeveloperProject(updates: Partial<Pick<DeveloperProject, 'project_name' | 'plan_code'>>): Promise<DeveloperProject> {
  const current = await getDeveloperProject();
  if (!current) throw new Error('No developer project found.');
  const { data, error } = await supabase().rpc('update_my_developer_project', {
    p_project_name: updates.project_name ?? current.project_name,
    p_plan_code: updates.plan_code ?? current.plan_code,
  });
  if (error) throw new Error(error.message || 'Unable to update developer project.');
  const project = normalizeProject(unwrapRpc<DeveloperProject>(data));
  if (!project) throw new Error('Developer project update returned no project.');
  return project;
}

export async function regenerateDeveloperApiKey(projectPassword?: string): Promise<DeveloperProject> {
  const password = projectPassword?.trim();
  if (!password) throw new Error('PROJECT_PASSWORD_REQUIRED');
  const { data, error } = await supabase().rpc('rotate_my_developer_api_key', { p_password: password });
  if (error) throw new Error(error.message || 'Unable to rotate API key.');
  const project = normalizeProject(unwrapRpc<DeveloperProject>(data));
  if (project?.api_key) return project;
  const fresh = await getDeveloperProject();
  if (fresh) return fresh;
  throw new Error('API key rotation completed, but project reload failed.');
}

export async function setDeveloperProjectActive(active: boolean, projectPassword?: string): Promise<DeveloperProject | boolean> {
  const password = projectPassword?.trim();
  if (!password) throw new Error('PROJECT_PASSWORD_REQUIRED');
  const { data, error } = await supabase().rpc('set_my_developer_project_active', {
    p_active: active,
    p_password: password,
  });
  if (error) throw new Error(error.message || 'Unable to change project status.');
  const project = normalizeProject(unwrapRpc<DeveloperProject>(data));
  return project || data === true;
}

export async function deleteDeveloperProject(): Promise<boolean> {
  const { data, error } = await supabase().rpc('delete_my_developer_project');
  if (error) throw new Error(error.message || 'Unable to delete developer project.');
  return data === true || data === 'true';
}

export async function getDeveloperUsage(days = 30): Promise<DeveloperDailyUsage[]> {
  try {
    const { data, error } = await supabase().rpc('get_my_developer_usage', { p_days: days });
    if (!error && Array.isArray(data)) return data.map((row: any) => ({ project_id: row.project_id, usage_date: row.usage_date, calls: Number(row.calls ?? row.used ?? 0), successful_calls: Number(row.successful_calls ?? row.successful ?? row.calls ?? 0), blocked_calls: Number(row.blocked_calls ?? row.blocked ?? 0) }));
  } catch (e) { console.warn('[DeveloperAPI] usage:', e); }
  return [];
}

export async function getDeveloperApiLogs(limit = 100): Promise<DeveloperRequestLog[]> {
  try {
    const { data, error } = await supabase().rpc('get_my_developer_logs', { p_limit: limit });
    if (!error && Array.isArray(data)) return data.map((row: any) => ({ id: String(row.request_id || row.id || ''), request_id: String(row.request_id || row.id || ''), project_id: row.project_id, timestamp: row.created_at || row.timestamp || new Date().toISOString(), created_at: row.created_at || row.timestamp || new Date().toISOString(), completed_at: row.completed_at, method: row.method || 'POST', endpoint: row.endpoint || '/api', action: row.action, status: Number(row.status_code ?? row.status ?? 200), status_code: Number(row.status_code ?? row.status ?? 200), latency_ms: Number(row.latency_ms ?? 0), error_code: row.error_code ?? null, quota_consumed: Number(row.quota_consumed ?? 1), user_agent: row.user_agent }));
  } catch (e) { console.warn('[DeveloperAPI] logs:', e); }
  return [];
}

export async function consumeDeveloperCall(apiKey: string, endpoint: string, method = 'POST') {
  return await supabase().rpc('consume_developer_call', { p_api_key: apiKey, p_endpoint: endpoint, p_method: method });
}

export async function completeDeveloperCall(requestId: string, statusCode: number, latencyMs: number, errorCode: string | null = null) {
  return await supabase().rpc('complete_developer_call', { p_request_id: requestId, p_status_code: statusCode, p_latency_ms: latencyMs, p_error_code: errorCode });
}

export function recordDeveloperApiCall(options: { endpoint: string; method?: string; action?: string; status: number; latency_ms: number; error_code?: string | null; user_agent?: string }): DeveloperRequestLog {
  const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return { id, request_id: id, timestamp: new Date().toISOString(), created_at: new Date().toISOString(), method: options.method || 'POST', endpoint: options.endpoint, action: options.action || 'api_call', status: options.status, status_code: options.status, latency_ms: options.latency_ms, error_code: options.error_code ?? null, quota_consumed: 1, user_agent: options.user_agent };
}

export function clearDeveloperApiLogs(): void {}

export async function listDeveloperApiKeys(): Promise<DeveloperApiKey[]> {
  const project = await getDeveloperProject();
  if (!project) return [];
  const rawKey = String(project.api_key || '');
  return [{ id: project.id, name: `${project.project_name} Primary Key`, key: project.api_key, masked_key: rawKey ? `${rawKey.slice(0, 10)}••••••••${rawKey.slice(-4)}` : undefined, created_at: project.created_at, is_active: project.is_active !== false, status: project.is_active === false ? 'suspended' : 'active', rate_limit: project.daily_limit }];
}

export async function createDeveloperApiKey(name: string, projectPassword?: string): Promise<{ key: string; apiKey: DeveloperApiKey }> {
  const project = await createDeveloperProject(name, projectPassword || '');
  const rawKey = String(project.api_key || '');
  return { key: project.api_key, apiKey: { id: project.id, name: project.project_name, key: project.api_key, masked_key: `${rawKey.slice(0, 10)}••••••••${rawKey.slice(-4)}`, created_at: project.created_at, is_active: project.is_active !== false, rate_limit: project.daily_limit } };
}

export async function revokeDeveloperApiKey(_id: string, projectPassword?: string): Promise<boolean> {
  await regenerateDeveloperApiKey(projectPassword);
  return true;
}

export function getDeveloperApiBaseUrl(): string { return (import.meta.env.VITE_DEVELOPER_API_URL || '').trim().replace(/\/$/, ''); }
export const WORKER_BASE_URL = (import.meta.env.VITE_WORKER_BASE_URL || '').trim().replace(/\/$/, '');
