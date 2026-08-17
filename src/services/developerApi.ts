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
  allowed_origins?: string[];
  webhook_url?: string;
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

// Compatibility alias
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

// Compatibility alias
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

// Default catalog based on the blueprint specifications
export const DEFAULT_DEVELOPER_PLANS: DeveloperPlan[] = [
  { code: 'free', name: 'Free', monthly_price_usd: 0, daily_limit: 100, is_active: true },
  { code: 'starter', name: 'Starter', monthly_price_usd: 5, daily_limit: 1000, is_active: true },
  { code: 'growth', name: 'Growth', monthly_price_usd: 10, daily_limit: 5000, is_active: true },
  { code: 'pro', name: 'Pro', monthly_price_usd: 20, daily_limit: 25000, is_active: true },
  { code: 'business', name: 'Business', monthly_price_usd: 50, daily_limit: 100000, is_active: true },
  { code: 'scale', name: 'Scale', monthly_price_usd: 100, daily_limit: 500000, is_active: true },
];

function unwrapRpc<T>(data: any): T | null {
  if (!data) return null;
  if (Array.isArray(data)) return (data[0] ?? null) as T;
  return data as T;
}

/**
 * 6. Checking whether the user already has a project
 * Calls Supabase RPC get_my_developer_project()
 */
export async function getDeveloperProject(): Promise<DeveloperProject | null> {
  try {
    const { data, error } = await getSupabase().rpc('get_my_developer_project');
    if (!error && data) {
      const project = unwrapRpc<DeveloperProject>(data);
      if (project && project.id) {
        return project;
      }
    }
    if (error) {
      console.warn('[DeveloperAPI] get_my_developer_project RPC note:', error.message);
    }
  } catch (e) {
    console.warn('[DeveloperAPI] get_my_developer_project exception:', e);
  }

  // Fallback to direct query on developer_projects for authenticated user
  try {
    const {
      data: { user },
    } = await getSupabase().auth.getUser();
    if (user?.id) {
      const { data: dbProj } = await getSupabase()
        .from('developer_projects')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (dbProj && dbProj.id) {
        return dbProj as DeveloperProject;
      }
    }
  } catch (err) {
    console.warn('[DeveloperAPI] developer_projects fallback query note:', err);
  }

  return null;
}

/**
 * 7. Creating the project
 * Calls Supabase RPC create_my_developer_project(p_project_name)
 */
export async function createDeveloperProject(projectName: string): Promise<DeveloperProject> {
  const name = projectName.trim() || 'My TokenCare App';

  // Check auth user session
  try {
    const { data: authData, error: authError } = await getSupabase().auth.getUser();
    if (authError || !authData?.user) {
      throw new Error('You must be signed in to create a developer project. Please sign in to your account.');
    }
  } catch (err: any) {
    if (err.message?.includes('signed in')) throw err;
    console.warn('[DeveloperAPI] Auth check note:', err);
  }

  const { data, error } = await getSupabase().rpc('create_my_developer_project', {
    p_project_name: name,
  });

  if (error) {
    console.error('[DeveloperAPI] create_my_developer_project RPC error:', error);
    const errorMsg = error.message || (error as any).details || (error as any).hint || 'Unable to create developer project in Supabase.';
    throw new Error(errorMsg);
  }

  const project = unwrapRpc<DeveloperProject>(data);
  if (!project) {
    // If unwrapRpc returned null, check developer_projects table
    const {
      data: { user },
    } = await getSupabase().auth.getUser();
    if (user?.id) {
      const { data: dbProj, error: dbErr } = await getSupabase()
        .from('developer_projects')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (dbProj && dbProj.id) {
        return dbProj as DeveloperProject;
      }
      if (dbErr) {
        throw new Error(dbErr.message || 'Developer project could not be loaded.');
      }
    }
    throw new Error('Developer project was not returned by Supabase.');
  }
  return project;
}

/**
 * 8. Checking quota
 * Calls Supabase RPC get_my_developer_quota()
 */
export async function getDeveloperQuota(): Promise<DeveloperQuota> {
  try {
    const { data, error } = await getSupabase().rpc('get_my_developer_quota');
    if (!error && data) {
      return (data || { has_project: false }) as DeveloperQuota;
    }
    if (error) {
      console.warn('[DeveloperAPI] get_my_developer_quota note:', error.message);
    }
  } catch (e) {
    console.warn('[DeveloperAPI] get_my_developer_quota exception:', e);
  }

  return { has_project: false };
}

/**
 * 9. Loading plans dynamically from developer_plans table
 */
export async function getDeveloperPlans(): Promise<DeveloperPlan[]> {
  try {
    const { data, error } = await getSupabase()
      .from('developer_plans')
      .select('code, name, monthly_price_usd, daily_limit, is_active, created_at')
      .eq('is_active', true)
      .order('monthly_price_usd', { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data as DeveloperPlan[];
    }
  } catch (err) {
    console.warn('[DeveloperAPI] developer_plans load note:', err);
  }
  return DEFAULT_DEVELOPER_PLANS;
}

/**
 * 10. Loading subscriptions
 * Calls Supabase RPC get_my_developer_subscriptions()
 */
export async function getDeveloperSubscriptions(): Promise<DeveloperSubscription[]> {
  try {
    const { data, error } = await getSupabase().rpc('get_my_developer_subscriptions');
    if (!error && Array.isArray(data)) {
      return data as DeveloperSubscription[];
    }
  } catch (err) {
    console.warn('[DeveloperAPI] get_my_developer_subscriptions error:', err);
  }
  return [];
}

/**
 * 11. Updating project information
 * Calls Supabase RPC update_my_developer_project(p_project_name, p_plan_code)
 */
export async function updateDeveloperProject(
  updates: Partial<Pick<DeveloperProject, 'project_name' | 'plan_code'>>
): Promise<DeveloperProject> {
  const current = await getDeveloperProject();
  if (!current) throw new Error('No active developer project found.');

  const { data, error } = await getSupabase().rpc('update_my_developer_project', {
    p_project_name: updates.project_name ?? current.project_name,
    p_plan_code: updates.plan_code ?? current.plan_code,
  });

  if (error) {
    throw new Error(error.message || 'Unable to update developer project.');
  }

  const project = unwrapRpc<DeveloperProject>(data);
  if (!project) throw new Error('Developer project update returned no project.');
  return project;
}

/**
 * 12. API-key rotation
 * Calls Supabase RPC rotate_my_developer_api_key()
 */
export async function regenerateDeveloperApiKey(): Promise<string> {
  const { data, error } = await getSupabase().rpc('rotate_my_developer_api_key');
  if (error) {
    throw new Error(error.message || 'Unable to rotate API key.');
  }
  const project = unwrapRpc<DeveloperProject>(data);
  if (project?.api_key) {
    return project.api_key;
  }
  if (typeof data === 'string' && data) {
    return data;
  }
  throw new Error('API key rotation did not return a key.');
}

/**
 * 13. Activating/deactivating a project
 * Calls Supabase RPC set_my_developer_project_active(p_active)
 */
export async function setDeveloperProjectActive(active: boolean): Promise<DeveloperProject | boolean> {
  const { data, error } = await getSupabase().rpc('set_my_developer_project_active', {
    p_active: active,
  });
  if (error) {
    throw new Error(error.message || 'Unable to change project status.');
  }
  const project = unwrapRpc<DeveloperProject>(data);
  return project || (data === true);
}

/**
 * Delete Developer Project
 * Calls Supabase RPC delete_my_developer_project()
 */
export async function deleteDeveloperProject(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('delete_my_developer_project');
  if (error) {
    throw new Error(error.message || 'Unable to delete developer project.');
  }
  return data === true || data === 'true';
}

/**
 * 14. Usage history
 * Calls Supabase RPC get_my_developer_usage(p_days)
 */
export async function getDeveloperUsage(days = 30): Promise<DeveloperDailyUsage[]> {
  try {
    const { data, error } = await getSupabase().rpc('get_my_developer_usage', {
      p_days: days,
    });
    if (!error && Array.isArray(data)) {
      return data.map((row: any) => ({
        project_id: row.project_id,
        usage_date: row.usage_date,
        calls: Number(row.calls ?? row.used ?? 0),
        successful_calls: Number(row.successful_calls ?? row.successful ?? row.calls ?? 0),
        blocked_calls: Number(row.blocked_calls ?? row.blocked ?? 0),
      }));
    }
  } catch (err) {
    console.warn('[DeveloperAPI] get_my_developer_usage error:', err);
  }
  return [];
}

/**
 * 15. Request logs
 * Calls Supabase RPC get_my_developer_logs(p_limit)
 */
export async function getDeveloperApiLogs(limit = 100): Promise<DeveloperRequestLog[]> {
  try {
    const { data, error } = await getSupabase().rpc('get_my_developer_logs', {
      p_limit: limit,
    });
    if (!error && Array.isArray(data)) {
      return data.map((row: any) => ({
        id: String(row.request_id || row.id || ''),
        request_id: String(row.request_id || row.id || ''),
        project_id: row.project_id,
        timestamp: row.created_at || row.timestamp || new Date().toISOString(),
        created_at: row.created_at || row.timestamp || new Date().toISOString(),
        completed_at: row.completed_at,
        method: row.method || 'POST',
        endpoint: row.endpoint || '/api',
        action: row.action || undefined,
        status: Number(row.status_code ?? row.status ?? 200),
        status_code: Number(row.status_code ?? row.status ?? 200),
        latency_ms: Number(row.latency_ms ?? 0),
        error_code: row.error_code ?? null,
        quota_consumed: Number(row.quota_consumed ?? 1),
        user_agent: row.user_agent,
      }));
    }
  } catch (err) {
    console.warn('[DeveloperAPI] get_my_developer_logs error:', err);
  }
  return [];
}

/**
 * 16. Backend quota consumption helper (called by API backend)
 */
export async function consumeDeveloperCall(apiKey: string, endpoint: string, method = 'POST') {
  return await getSupabase().rpc('consume_developer_call', {
    p_api_key: apiKey,
    p_endpoint: endpoint,
    p_method: method,
  });
}

/**
 * 18. Backend request completion helper (called by API backend)
 */
export async function completeDeveloperCall(
  requestId: string,
  statusCode: number,
  latencyMs: number,
  errorCode: string | null = null
) {
  return await getSupabase().rpc('complete_developer_call', {
    p_request_id: requestId,
    p_status_code: statusCode,
    p_latency_ms: latencyMs,
    p_error_code: errorCode,
  });
}

/**
 * Record API test telemetry
 */
export function recordDeveloperApiCall(options: {
  endpoint: string;
  method?: string;
  action?: string;
  status: number;
  latency_ms: number;
  error_code?: string | null;
  user_agent?: string;
}): DeveloperRequestLog {
  return {
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    request_id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
    method: options.method || 'POST',
    endpoint: options.endpoint,
    action: options.action || 'api_call',
    status: options.status,
    status_code: options.status,
    latency_ms: options.latency_ms,
    error_code: options.error_code ?? null,
    quota_consumed: 1,
    user_agent: options.user_agent,
  };
}

export function clearDeveloperApiLogs(): void {
  // Telemetry is authoritatively stored in Supabase developer_request_logs
}

export async function listDeveloperApiKeys(): Promise<DeveloperApiKey[]> {
  const project = await getDeveloperProject();
  if (!project) return [];
  const rawKey = String(project.api_key || '');
  return [
    {
      id: project.id,
      name: `${project.project_name} Primary Key`,
      key: project.api_key,
      masked_key: rawKey ? `${rawKey.slice(0, 10)}••••••••${rawKey.slice(-4)}` : undefined,
      created_at: project.created_at,
      is_active: project.is_active !== false,
      status: project.is_active === false ? 'suspended' : 'active',
      rate_limit: project.daily_limit,
    },
  ];
}

export async function createDeveloperApiKey(name: string): Promise<{ key: string; apiKey: DeveloperApiKey }> {
  const project = await createDeveloperProject(name);
  const rawKey = String(project.api_key || '');
  return {
    key: project.api_key,
    apiKey: {
      id: project.id,
      name: project.project_name,
      key: project.api_key,
      masked_key: `${rawKey.slice(0, 10)}••••••••${rawKey.slice(-4)}`,
      created_at: project.created_at,
      is_active: project.is_active !== false,
      rate_limit: project.daily_limit,
    },
  };
}

export async function revokeDeveloperApiKey(_id: string): Promise<boolean> {
  await regenerateDeveloperApiKey();
  return true;
}

export function getDeveloperApiBaseUrl(): string {
  return (import.meta.env.VITE_DEVELOPER_API_URL || '').trim().replace(/\/$/, '');
}

export const WORKER_BASE_URL = (import.meta.env.VITE_WORKER_BASE_URL || '').trim().replace(/\/$/, '');
