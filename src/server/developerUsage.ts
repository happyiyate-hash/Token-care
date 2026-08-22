import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pqqomaveycjeorgurpev.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxcW9tYXZleWNqZW9yZ3VycGV2IiwibmFtZSI6IlRva2VuQ2FyZSIsImlhdCI6MTc4NjAzOTAxMCwiZXhwIjoxNzAxNjE1MTAxMH0.iLP3IXux4cc-ACPLBtciuau2JXD8plcB3CAIXtzwEs';

let serverSupabaseClient: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (!serverSupabaseClient) {
    serverSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serverSupabaseClient;
}

export interface DeveloperUsageValidationResult {
  hasKey: boolean;
  allowed: boolean;
  statusCode?: number;
  error?: { code: string; message: string };
  project?: {
    id: string;
    project_name: string;
    api_key: string;
    plan_code: string;
    daily_limit: number;
    is_active: boolean;
    quota_locked?: boolean;
    quota_locked_until?: string | null;
  };
  requestId?: string;
}

/**
 * Authentication only.
 *
 * IMPORTANT: this function no longer consumes a daily quota. The TokenCare
 * operation/backend decides the credit cost and calls chargeDeveloperCredits
 * with that cost. No operation -> credit price is stored here or in Supabase.
 */
export async function validateAndConsumeDeveloperQuota(options: {
  apiKey?: string | null;
  endpoint: string;
  method?: string;
  action?: string;
  authHeader?: string | null;
}): Promise<DeveloperUsageValidationResult> {
  const apiKey = (options.apiKey || '').trim();
  if (!apiKey) return { hasKey: false, allowed: true };

  const supabase = getServerSupabase();
  const requestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Date.now().toString(16).padStart(12, '0')}`;

  try {
    const { data: project, error } = await supabase
      .from('developer_projects')
      .select('id, project_name, api_key, plan_code, daily_limit, is_active, quota_locked, quota_locked_until')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (error || !project) {
      return { hasKey: true, allowed: false, statusCode: 401, error: { code: 'INVALID_API_KEY', message: 'The provided API key is invalid or does not exist.' } };
    }
    if (project.is_active === false) {
      return { hasKey: true, allowed: false, statusCode: 403, error: { code: 'PROJECT_PAUSED', message: 'This developer project is currently paused.' }, project };
    }

    return { hasKey: true, allowed: true, requestId, project };
  } catch (err) {
    console.error('[Developer Usage Service] Project authentication error:', err);
    return { hasKey: true, allowed: false, statusCode: 500, error: { code: 'PROJECT_AUTH_FAILED', message: 'Unable to verify developer project.' } };
  }
}

/**
 * Charges the exact amount supplied by the TokenCare backend.
 * The credit amount is deliberately an argument, not a database price table.
 */
export async function chargeDeveloperCredits(options: {
  projectId: string;
  credits: number;
  endpoint: string;
  actionKey?: string | null;
  requestId?: string | null;
}): Promise<{ allowed: boolean; balance?: number; charged?: number; error?: string }> {
  if (!Number.isSafeInteger(options.credits) || options.credits <= 0) {
    return { allowed: false, error: 'Invalid credit amount.' };
  }

  const { data, error } = await getServerSupabase().rpc('reserve_developer_credits', {
    p_project_id: options.projectId,
    p_credits: options.credits,
    p_endpoint: options.endpoint,
    p_action_key: options.actionKey ?? null,
    p_request_id: options.requestId ?? null,
  });

  if (error) {
    console.error('[Developer Credit Service] Charge failed:', error);
    return { allowed: false, error: 'Unable to charge project credits.' };
  }

  const result = Array.isArray(data) ? data[0] : data;
  return {
    allowed: result?.allowed === true,
    balance: result?.balance,
    charged: result?.charged,
    error: result?.allowed === false ? result?.error || 'Insufficient credits.' : undefined,
  };
}

export async function refundDeveloperCredits(options: {
  projectId: string;
  credits: number;
  requestId?: string | null;
  actionKey?: string | null;
  reason?: string;
}): Promise<void> {
  if (!Number.isSafeInteger(options.credits) || options.credits <= 0) return;
  const { error } = await getServerSupabase().rpc('refund_developer_credits', {
    p_project_id: options.projectId,
    p_credits: options.credits,
    p_request_id: options.requestId ?? null,
    p_action_key: options.actionKey ?? null,
    p_reason: options.reason || 'request_failed',
  });
  if (error) console.error('[Developer Credit Service] Refund failed:', error);
}

export async function finalizeDeveloperRequestLog(options: {
  requestId?: string;
  statusCode: number;
  latencyMs: number;
  errorCode?: string | null;
}): Promise<void> {
  if (!options.requestId) return;
  try {
    await getServerSupabase()
      .from('developer_request_logs')
      .update({
        status_code: options.statusCode,
        latency_ms: options.latencyMs,
        error_code: options.errorCode || null,
        completed_at: new Date().toISOString(),
      })
      .eq('request_id', options.requestId);
  } catch (e) {
    console.warn('[Developer Usage Service] Finalize log note:', e);
  }
}
