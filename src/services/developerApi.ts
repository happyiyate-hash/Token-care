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
  action_key?: string;
  action?: string;
  outcome?: 'succeeded' | 'failed' | 'blocked' | 'processing' | 'pending' | string;
  message?: string | null;
  error_message?: string | null;
  error_code?: string | null;
  status_code?: number;
  status?: number;
  requested_at?: string;
  completed_at?: string | null;
  latency_ms: number;
  quota_consumed?: boolean | number;
  details?: any;
  endpoint?: string;
  method?: string;
  created_at?: string;
  timestamp?: string;
  user_agent?: string;
}
export type DeveloperApiLog = DeveloperRequestLog;

export function normalizeDeveloperLog(row: any): DeveloperRequestLog {
  const reqId = String(row.request_id || row.id || `req_${Date.now()}`);
  const actionKey = row.action_key || row.action || (row.endpoint ? row.endpoint.replace(/^\/api\/?/, '') : 'api_call');
  
  // Determine normalized outcome: 'succeeded' | 'failed' | 'blocked' | 'processing'
  let outcome = 'succeeded';
  if (row.outcome) {
    outcome = String(row.outcome).toLowerCase();
  } else if (!row.completed_at && row.status_code === undefined && !row.error_code) {
    outcome = 'processing';
  } else if (Number(row.status_code) === 429 || row.error_code === 'QUOTA_EXHAUSTED' || row.error_code === 'RATE_LIMIT_EXCEEDED') {
    outcome = 'blocked';
  } else if (row.error_code || (row.status_code !== undefined && Number(row.status_code) >= 400)) {
    outcome = 'failed';
  } else if (row.status_code !== undefined && Number(row.status_code) < 400) {
    outcome = 'succeeded';
  }

  const requestedAt = row.requested_at || row.created_at || row.timestamp || new Date().toISOString();

  let detailsObj = row.details;
  if (typeof detailsObj === 'string') {
    try {
      detailsObj = JSON.parse(detailsObj);
    } catch {
      // keep string
    }
  }

  const statusCode = Number(
    row.status_code ??
      row.status ??
      (outcome === 'succeeded' ? 200 : outcome === 'blocked' ? 429 : outcome === 'processing' ? 102 : 500)
  );

  let quotaConsumed: boolean = true;
  if (typeof row.quota_consumed === 'boolean') {
    quotaConsumed = row.quota_consumed;
  } else if (typeof row.quota_consumed === 'number') {
    quotaConsumed = row.quota_consumed > 0;
  } else if (typeof row.quota_consumed === 'string') {
    quotaConsumed = row.quota_consumed.toLowerCase() === 'true' || row.quota_consumed === '1';
  } else {
    quotaConsumed = outcome !== 'blocked';
  }

  return {
    id: String(row.id || reqId),
    request_id: reqId,
    project_id: row.project_id,
    action_key: actionKey,
    action: actionKey,
    outcome: outcome,
    message: row.message ?? null,
    error_message: row.error_message ?? null,
    error_code: row.error_code ?? null,
    status_code: statusCode,
    status: statusCode,
    requested_at: requestedAt,
    created_at: requestedAt,
    timestamp: requestedAt,
    completed_at: row.completed_at ?? null,
    latency_ms: Number(row.latency_ms ?? 0),
    quota_consumed: quotaConsumed,
    details: detailsObj,
    endpoint: row.endpoint || (actionKey ? `/api/${actionKey}` : '/api'),
    method: row.method || 'POST',
    user_agent: row.user_agent,
  };
}

/**
 * Subscribes to realtime INSERT and UPDATE Postgres Changes on public.developer_request_logs
 * filtered strictly by the project_id.
 */
export function subscribeToDeveloperLogs(
  supabaseClient: any,
  projectId: string,
  onInsert: (log: DeveloperRequestLog) => void,
  onUpdate: (log: DeveloperRequestLog) => void
) {
  const channel = supabaseClient
    .channel(`developer-logs-${projectId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'developer_request_logs',
        filter: `project_id=eq.${projectId}`,
      },
      (payload: any) => {
        if (payload?.new) {
          onInsert(normalizeDeveloperLog(payload.new));
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'developer_request_logs',
        filter: `project_id=eq.${projectId}`,
      },
      (payload: any) => {
        if (payload?.new) {
          onUpdate(normalizeDeveloperLog(payload.new));
        }
      }
    )
    .subscribe((status: string) => {
      console.log(`[Supabase Realtime] developer_request_logs (${projectId}):`, status);
    });

  return channel;
}

/**
 * Subscribes to realtime INSERT and UPDATE Postgres Changes on public.developer_daily_usage
 * filtered strictly by the project_id.
 */
export function subscribeToDeveloperDailyUsage(
  supabaseClient: any,
  projectId: string,
  onInsert: (usage: DeveloperDailyUsage) => void,
  onUpdate: (usage: DeveloperDailyUsage) => void
) {
  const channel = supabaseClient
    .channel(`developer-usage-${projectId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'developer_daily_usage',
        filter: `project_id=eq.${projectId}`,
      },
      (payload: any) => {
        if (payload?.new) {
          const row: DeveloperDailyUsage = {
            project_id: payload.new.project_id,
            usage_date: String(payload.new.usage_date),
            calls: Number(payload.new.calls ?? payload.new.used ?? 0),
            successful_calls: Number(payload.new.successful_calls ?? payload.new.successful ?? 0),
            blocked_calls: Number(payload.new.blocked_calls ?? payload.new.blocked ?? 0),
          };
          onInsert(row);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'developer_daily_usage',
        filter: `project_id=eq.${projectId}`,
      },
      (payload: any) => {
        if (payload?.new) {
          const row: DeveloperDailyUsage = {
            project_id: payload.new.project_id,
            usage_date: String(payload.new.usage_date),
            calls: Number(payload.new.calls ?? payload.new.used ?? 0),
            successful_calls: Number(payload.new.successful_calls ?? payload.new.successful ?? 0),
            blocked_calls: Number(payload.new.blocked_calls ?? payload.new.blocked ?? 0),
          };
          onUpdate(row);
        }
      }
    )
    .subscribe((status: string) => {
      console.log(`[Supabase Realtime] developer_daily_usage (${projectId}):`, status);
    });

  return channel;
}

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
    if (!error && Array.isArray(data)) {
      const rows = data.map((row: any) => ({
        project_id: row.project_id,
        usage_date: String(row.usage_date),
        calls: Number(row.calls ?? row.used ?? 0),
        successful_calls: Number(row.successful_calls ?? row.successful ?? 0),
        blocked_calls: Number(row.blocked_calls ?? row.blocked ?? 0),
      }));

      // Always return a complete calendar window. A missing database row means zero usage,
      // never synthetic/fake traffic.
      const byDate = new Map(rows.map((row) => [row.usage_date, row]));
      const today = new Date();
      const complete: DeveloperDailyUsage[] = [];
      for (let offset = days - 1; offset >= 0; offset -= 1) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const usageDate = `${year}-${month}-${day}`;
        complete.push(byDate.get(usageDate) ?? {
          project_id: rows[0]?.project_id,
          usage_date: usageDate,
          calls: 0,
          successful_calls: 0,
          blocked_calls: 0,
        });
      }
      return complete;
    }
  } catch (e) { console.warn('[DeveloperAPI] usage RPC error:', e); }

  // Direct table query fallback
  try {
    const proj = await getDeveloperProject();
    if (proj?.id) {
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
      const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
      
      const { data: rows, error: tblError } = await supabase()
        .from('developer_daily_usage')
        .select('*')
        .eq('project_id', proj.id)
        .gte('usage_date', startStr)
        .order('usage_date', { ascending: true });

      if (!tblError) {
        const byDate = new Map((rows || []).map((row: any) => [row.usage_date, {
          project_id: row.project_id,
          usage_date: String(row.usage_date),
          calls: Number(row.calls ?? 0),
          successful_calls: Number(row.successful_calls ?? 0),
          blocked_calls: Number(row.blocked_calls ?? 0),
        }]));

        const complete: DeveloperDailyUsage[] = [];
        for (let offset = days - 1; offset >= 0; offset -= 1) {
          const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const usageDate = `${year}-${month}-${day}`;
          complete.push(byDate.get(usageDate) ?? {
            project_id: proj.id,
            usage_date: usageDate,
            calls: 0,
            successful_calls: 0,
            blocked_calls: 0,
          });
        }
        return complete;
      }
    }
  } catch (e2) {
    console.warn('[DeveloperAPI] usage direct fallback error:', e2);
  }

  return [];
}

export async function getDeveloperApiLogs(limit = 100): Promise<DeveloperRequestLog[]> {
  try {
    const proj = await getDeveloperProject();
    if (proj?.id) {
      const { data: rows, error: tblErr } = await supabase()
        .from('developer_request_logs')
        .select('*')
        .eq('project_id', proj.id)
        .order('requested_at', { ascending: false })
        .limit(limit);

      if (!tblErr && Array.isArray(rows) && rows.length > 0) {
        return rows.map((row: any) => normalizeDeveloperLog(row));
      }
    }

    const { data, error } = await supabase().rpc('get_my_developer_logs', { p_limit: limit });
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((row: any) => normalizeDeveloperLog(row));
    }
  } catch (e) {
    console.warn('[DeveloperAPI] logs error:', e);
  }
  return [];
}

export async function consumeDeveloperCall(apiKey: string, endpoint: string, method = 'POST') {
  return await supabase().rpc('consume_developer_call', { p_api_key: apiKey, p_endpoint: endpoint, p_method: method });
}

export async function completeDeveloperCall(requestId: string, statusCode: number, latencyMs: number, errorCode: string | null = null) {
  return await supabase().rpc('complete_developer_call', { p_request_id: requestId, p_status_code: statusCode, p_latency_ms: latencyMs, p_error_code: errorCode });
}

export function recordDeveloperApiCall(options: {
  endpoint: string;
  method?: string;
  action_key?: string;
  action?: string;
  outcome?: string;
  message?: string;
  error_message?: string | null;
  error_code?: string | null;
  status?: number;
  status_code?: number;
  latency_ms: number;
  quota_consumed?: boolean | number;
  details?: any;
  user_agent?: string;
}): DeveloperRequestLog {
  const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const statusCode = options.status_code ?? options.status ?? 200;
  const outcome = options.outcome || (statusCode < 400 ? 'succeeded' : (statusCode === 429 ? 'blocked' : 'failed'));
  const actionKey = options.action_key || options.action || (options.endpoint ? options.endpoint.replace(/^\/api\/?/, '') : 'api_call');

  return normalizeDeveloperLog({
    id,
    request_id: id,
    action_key: actionKey,
    action: actionKey,
    outcome: outcome,
    message: options.message || (outcome === 'succeeded' ? 'Request succeeded.' : options.error_message || 'Request completed.'),
    error_message: options.error_message ?? null,
    error_code: options.error_code ?? null,
    status_code: statusCode,
    status: statusCode,
    latency_ms: options.latency_ms,
    quota_consumed: options.quota_consumed !== undefined ? options.quota_consumed : (outcome !== 'blocked'),
    details: options.details,
    requested_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    endpoint: options.endpoint,
    method: options.method || 'POST',
    user_agent: options.user_agent,
  });
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

export const DEVELOPER_API_URL = "https://back-end-gamma-ebon.vercel.app/api/developer";

export function getDeveloperGatewayBaseUrl(): string {
  return DEVELOPER_API_URL;
}

export function getDeveloperRpcEndpoint(): string {
  return DEVELOPER_API_URL;
}

export function getDeveloperApiBaseUrl(): string {
  return DEVELOPER_API_URL;
}

export interface RpcPresetAction {
  id: string;
  name: string;
  actionKey: 'getAllTokens' | 'getBlockchainTokens' | 'getTokenByAddress';
  method: 'POST';
  description: string;
  defaultPayload: Record<string, any>;
  sampleCurl: (apiKey?: string) => string;
}

export const RPC_PRESET_ACTIONS: RpcPresetAction[] = [
  {
    id: 'get-all-tokens',
    name: 'Get All Tokens',
    actionKey: 'getAllTokens',
    method: 'POST',
    description: 'Fetch the full multi-chain directory of verified tokens from the indexer.',
    defaultPayload: {
      action: 'getAllTokens',
      page: 1,
      limit: 100,
    },
    sampleCurl: (apiKey = 'YOUR_API_KEY') =>
`curl -X POST ${DEVELOPER_API_URL} \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
  "action": "getAllTokens",
  "page": 1,
  "limit": 100
}'`,
  },
  {
    id: 'get-blockchain-tokens',
    name: 'Get Tokens by Blockchain',
    actionKey: 'getBlockchainTokens',
    method: 'POST',
    description: 'Retrieve verified tokens filtered specifically for a chosen blockchain network.',
    defaultPayload: {
      action: 'getBlockchainTokens',
      blockchain: 'polygon',
      page: 1,
      limit: 100,
    },
    sampleCurl: (apiKey = 'YOUR_API_KEY') =>
`curl -X POST ${DEVELOPER_API_URL} \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
  "action": "getBlockchainTokens",
  "blockchain": "polygon",
  "page": 1,
  "limit": 100
}'`,
  },
  {
    id: 'get-token-by-address',
    name: 'Get Token by Contract Address',
    actionKey: 'getTokenByAddress',
    method: 'POST',
    description: 'Lookup detailed token metadata, verification state, and parameters by contract address.',
    defaultPayload: {
      action: 'getTokenByAddress',
      address: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
    },
    sampleCurl: (apiKey = 'YOUR_API_KEY') =>
`curl -X POST ${DEVELOPER_API_URL} \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
  "action": "getTokenByAddress",
  "address": "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"
}'`,
  },
];

export async function executeDeveloperRpcCall(
  payload: Record<string, any>,
  apiKey?: string
): Promise<{ status: number; ok: boolean; latencyMs: number; data: any }> {
  const endpoint = DEVELOPER_API_URL;
  const start = performance.now();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey.trim()) {
    headers['X-API-Key'] = apiKey.trim();
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const latencyMs = Math.max(1, Math.round(performance.now() - start));
    let data: any;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { text };
    }
    return {
      status: res.status,
      ok: res.ok,
      latencyMs,
      data,
    };
  } catch (err: any) {
    const latencyMs = Math.max(1, Math.round(performance.now() - start));
    return {
      status: 500,
      ok: false,
      latencyMs,
      data: {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: err?.message || 'Failed to connect to Developer RPC gateway.',
        },
      },
    };
  }
}