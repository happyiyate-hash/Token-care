import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pqqomaveycjeorgurpev.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxcW9tYXZleWNqZW9yZ3VycGV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMzkwMTAsImV4cCI6MjEwMTYxNTAxMH0.iLP3IXux4cc-ACPLBtciuauo2JXD8plcB3CAIXtzwEs';

let serverSupabaseClient: SupabaseClient | null = null;
export function getServerSupabase(): SupabaseClient {
  if (!serverSupabaseClient) serverSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return serverSupabaseClient;
}

export interface DeveloperUsageValidationResult {
  hasKey: boolean;
  allowed: boolean;
  statusCode?: number;
  error?: { code: string; message: string };
  project?: { id: string; project_name: string; api_key: string; plan_code: string; daily_limit: number; is_active: boolean; quota_locked?: boolean; quota_locked_until?: string | null };
  requestId?: string;
}

/** Updates public.developer_daily_usage analytics table for the project and today's date */
export async function recordDeveloperDailyUsage(options: {
  projectId: string;
  statusCode: number;
  errorCode?: string | null;
}): Promise<void> {
  const { projectId, statusCode, errorCode } = options;
  if (!projectId) return;

  const now = new Date();
  const usageDate = now.toISOString().slice(0, 10);
  const isBlocked =
    statusCode === 429 ||
    errorCode === 'BLOCKED' ||
    errorCode === 'QUOTA_EXHAUSTED' ||
    errorCode === 'INSUFFICIENT_CREDITS' ||
    errorCode === 'PROJECT_PAUSED';
  const isSuccess = statusCode >= 200 && statusCode < 400 && !isBlocked;

  try {
    const supabase = getServerSupabase();
    const { data: existing, error: selErr } = await supabase
      .from('developer_daily_usage')
      .select('id, calls, successful_calls, blocked_calls')
      .eq('project_id', projectId)
      .eq('usage_date', usageDate)
      .maybeSingle();

    if (!selErr && existing) {
      const updatedCalls = Number(existing.calls || 0) + 1;
      const updatedSuccessful = Number(existing.successful_calls || 0) + (isSuccess ? 1 : 0);
      const updatedBlocked = Number(existing.blocked_calls || 0) + (isBlocked ? 1 : 0);

      await supabase
        .from('developer_daily_usage')
        .update({
          calls: updatedCalls,
          successful_calls: updatedSuccessful,
          blocked_calls: updatedBlocked,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('developer_daily_usage')
        .insert({
          project_id: projectId,
          usage_date: usageDate,
          calls: 1,
          successful_calls: isSuccess ? 1 : 0,
          blocked_calls: isBlocked ? 1 : 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
    }
  } catch (err) {
    console.warn('[Developer Usage Service] recordDeveloperDailyUsage note:', err);
  }
}

/** Authentication only. Credit cost is supplied by the TokenCare backend operation. */
export async function validateAndConsumeDeveloperQuota(options: { apiKey?: string | null; endpoint: string; method?: string; action?: string; authHeader?: string | null }): Promise<DeveloperUsageValidationResult> {
  const apiKey = (options.apiKey || '').trim();
  if (!apiKey) return { hasKey: false, allowed: true };
  const requestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Date.now().toString(16).padStart(12, '0')}`;
  try {
    const { data: project, error } = await getServerSupabase().from('developer_projects').select('id, project_name, api_key, plan_code, daily_limit, is_active, quota_locked, quota_locked_until').eq('api_key', apiKey).maybeSingle();
    if (error || !project) return { hasKey: true, allowed: false, statusCode: 401, error: { code: 'INVALID_API_KEY', message: 'The provided API key is invalid or does not exist.' } };
    if (project.is_active === false) {
      const startedAt = new Date().toISOString();
      try {
        await getServerSupabase().from('developer_request_logs').insert({
          project_id: project.id,
          endpoint: options.endpoint,
          request_key: options.action || options.endpoint,
          method: options.method || 'POST',
          status_code: 403,
          latency_ms: 1,
          error_code: 'PROJECT_PAUSED',
          request_id: requestId,
          requested_at: startedAt,
          completed_at: startedAt,
          quota_consumed: false,
          message: 'This developer project is currently paused.',
        });
      } catch (_) {}

      await recordDeveloperDailyUsage({
        projectId: project.id,
        statusCode: 403,
        errorCode: 'PROJECT_PAUSED',
      });

      return { hasKey: true, allowed: false, statusCode: 403, error: { code: 'PROJECT_PAUSED', message: 'This developer project is currently paused.' }, project };
    }

    const requestedAt = new Date().toISOString();
    try {
      await getServerSupabase().from('developer_request_logs').insert({
        project_id: project.id,
        endpoint: options.endpoint,
        request_key: options.action || options.endpoint,
        method: options.method || 'POST',
        status_code: 102,
        latency_ms: 0,
        error_code: null,
        request_id: requestId,
        requested_at: requestedAt,
        quota_consumed: false,
        message: 'Processing request...',
      });
    } catch (_) {}

    return { hasKey: true, allowed: true, requestId, project };
  } catch (err) {
    console.error('[Developer Usage Service] Project authentication error:', err);
    return { hasKey: true, allowed: false, statusCode: 500, error: { code: 'PROJECT_AUTH_FAILED', message: 'Unable to verify developer project.' } };
  }
}

/** Charges the exact amount supplied by the backend. No operation pricing is stored here or in Supabase. */
export async function chargeDeveloperCredits(options: { projectId: string; credits: number; endpoint: string; actionKey?: string | null; requestId?: string | null }): Promise<{ allowed: boolean; balance?: number; charged?: number; error?: string }> {
  if (!Number.isSafeInteger(options.credits) || options.credits <= 0) return { allowed: false, error: 'Invalid credit amount.' };
  const { data, error } = await getServerSupabase().rpc('reserve_developer_credits', { p_project_id: options.projectId, p_credits: options.credits, p_endpoint: options.endpoint, p_action_key: options.actionKey ?? null, p_request_id: options.requestId ?? null });
  if (error) { console.error('[Developer Credit Service] Charge failed:', error); return { allowed: false, error: 'Unable to charge project credits.' }; }
  const result = Array.isArray(data) ? data[0] : data;
  return { allowed: result?.allowed === true, balance: result?.balance, charged: result?.charged, error: result?.allowed === false ? result?.error || 'Insufficient credits.' : undefined };
}

export async function refundDeveloperCredits(options: { projectId: string; credits: number; requestId?: string | null; actionKey?: string | null; reason?: string }): Promise<void> {
  if (!Number.isSafeInteger(options.credits) || options.credits <= 0) return;
  const { error } = await getServerSupabase().rpc('refund_developer_credits', { p_project_id: options.projectId, p_credits: options.credits, p_request_id: options.requestId ?? null, p_action_key: options.actionKey ?? null, p_reason: options.reason || 'request_failed' });
  if (error) console.error('[Developer Credit Service] Refund failed:', error);
}

export async function finalizeDeveloperRequestLog(options: { requestId?: string; statusCode: number; latencyMs: number; errorCode?: string | null; projectId?: string }): Promise<void> {
  if (!options.requestId) return;
  try {
    const supabase = getServerSupabase();
    await supabase.from('developer_request_logs').update({ status_code: options.statusCode, latency_ms: options.latencyMs, error_code: options.errorCode || null, completed_at: new Date().toISOString() }).eq('request_id', options.requestId);
    
    let pId = options.projectId;
    if (!pId) {
      const { data } = await supabase.from('developer_request_logs').select('project_id').eq('request_id', options.requestId).maybeSingle();
      pId = data?.project_id;
    }

    if (pId) {
      await recordDeveloperDailyUsage({
        projectId: pId,
        statusCode: options.statusCode,
        errorCode: options.errorCode,
      });
    }
  } catch (e) {
    console.warn('[Developer Usage Service] Finalize log note:', e);
  }
}

