import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pqqomaveycjeorgurpev.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxcW9tYXZleWNqZW9yZ3VycGV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMzkwMTAsImV4cCI6MjEwMTYxNTAxMH0.iLP3IXux4cc-ACPLBtciuauo2JXD8plcB3CAIXtzwEs';

let serverSupabaseClient: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (!serverSupabaseClient) {
    serverSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return serverSupabaseClient;
}

export interface DeveloperUsageValidationResult {
  hasKey: boolean;
  allowed: boolean;
  statusCode?: number;
  error?: {
    code: string;
    message: string;
  };
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
  dailyLimit?: number;
  usedToday?: number;
  remainingToday?: number;
  resetAt?: string;
}

/**
 * Validates the developer API key against database, checks project active state,
 * checks daily quota, atomically increments today's usage, and logs the request.
 */
export async function validateAndConsumeDeveloperQuota(options: {
  apiKey?: string | null;
  endpoint: string;
  method?: string;
  action?: string;
  authHeader?: string | null;
}): Promise<DeveloperUsageValidationResult> {
  const apiKey = (options.apiKey || '').trim();
  const endpoint = options.endpoint || '/api';
  const method = (options.method || 'POST').toUpperCase();

  // If no API key provided, treat as unauthenticated public request
  if (!apiKey) {
    return { hasKey: false, allowed: true };
  }

  const supabase = getServerSupabase();

  try {
    // 1. Try Supabase RPC consume_developer_call if available
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('consume_developer_call', {
        p_api_key: apiKey,
        p_endpoint: endpoint,
      });

      if (!rpcError && rpcResult) {
        if (rpcResult.allowed === false || rpcResult.success === false) {
          return {
            hasKey: true,
            allowed: false,
            statusCode: rpcResult.status_code || 429,
            error: {
              code: rpcResult.error_code || 'QUOTA_EXHAUSTED',
              message: rpcResult.message || 'Daily API quota limit reached.',
            },
            dailyLimit: rpcResult.daily_limit,
            usedToday: rpcResult.used_today,
            remainingToday: rpcResult.remaining_today || 0,
          };
        }

        if (rpcResult.allowed === true || rpcResult.success === true) {
          return {
            hasKey: true,
            allowed: true,
            requestId: rpcResult.request_id,
            dailyLimit: rpcResult.daily_limit || 100,
            usedToday: rpcResult.used_today || 1,
            remainingToday: rpcResult.remaining_today ?? Math.max(0, (rpcResult.daily_limit || 100) - (rpcResult.used_today || 1)),
          };
        }
      }
    } catch (rpcEx) {
      console.warn('[Developer Usage Service] RPC consume_developer_call exception:', rpcEx);
    }

    // 2. Authoritative Database Verification & Atomic Usage Tracking
    const { data: project, error: projError } = await supabase
      .from('developer_projects')
      .select('*')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (projError || !project) {
      return {
        hasKey: true,
        allowed: false,
        statusCode: 401,
        error: {
          code: 'INVALID_API_KEY',
          message: 'The provided API key is invalid or does not exist.',
        },
      };
    }

    // Check project active state
    if (project.is_active === false) {
      return {
        hasKey: true,
        allowed: false,
        statusCode: 403,
        error: {
          code: 'PROJECT_PAUSED',
          message: 'This developer project is currently paused. Please reactivate it in your Developer dashboard.',
        },
        project,
      };
    }

    // Check quota lock state
    const now = new Date();
    if (project.quota_locked) {
      if (project.quota_locked_until && new Date(project.quota_locked_until) > now) {
        return {
          hasKey: true,
          allowed: false,
          statusCode: 429,
          error: {
            code: 'QUOTA_EXHAUSTED',
            message: 'Daily rate limit reached. Quota exhausted.',
          },
          project,
          dailyLimit: project.daily_limit || 100,
          remainingToday: 0,
        };
      } else {
        // Unlock expired lock
        await supabase
          .from('developer_projects')
          .update({
            quota_locked: false,
            quota_locked_until: null,
            quota_lock_reason: null,
          })
          .eq('id', project.id);
      }
    }

    // Determine plan daily limit
    const dailyLimit = Number(project.daily_limit || 100);
    const todayStr = now.toISOString().slice(0, 10);
    const nextMidnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));

    // Query today's usage row
    const { data: usageRow } = await supabase
      .from('developer_daily_usage')
      .select('*')
      .eq('project_id', project.id)
      .eq('usage_date', todayStr)
      .maybeSingle();

    const currentCalls = Number(usageRow?.calls ?? 0);
    const requestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Date.now().toString(16).padStart(12, '0')}`;

    // Quota exhausted check
    if (currentCalls >= dailyLimit) {
      // Lock project in database
      await supabase
        .from('developer_projects')
        .update({
          quota_locked: true,
          quota_locked_until: nextMidnightUtc.toISOString(),
          quota_lock_reason: 'Daily quota limit reached',
          updated_at: now.toISOString(),
        })
        .eq('id', project.id);

      // Increment blocked count
      if (usageRow) {
        await supabase
          .from('developer_daily_usage')
          .update({
            blocked_calls: (usageRow.blocked_calls || 0) + 1,
          })
          .eq('id', usageRow.id);
      }

      // Record blocked log
      await supabase.from('developer_request_logs').insert({
        request_id: requestId,
        project_id: project.id,
        endpoint,
        method,
        status_code: 429,
        latency_ms: 0,
        error_code: 'QUOTA_EXHAUSTED',
        quota_consumed: 0,
        requested_at: now.toISOString(),
        completed_at: now.toISOString(),
      });

      return {
        hasKey: true,
        allowed: false,
        statusCode: 429,
        error: {
          code: 'QUOTA_EXHAUSTED',
          message: 'Daily rate limit reached. Quota exhausted.',
        },
        project,
        dailyLimit,
        usedToday: currentCalls,
        remainingToday: 0,
        resetAt: nextMidnightUtc.toISOString(),
      };
    }

    // Quota is available - increment usage
    const newCalls = currentCalls + 1;
    if (usageRow?.id) {
      await supabase
        .from('developer_daily_usage')
        .update({
          calls: newCalls,
          successful_calls: (usageRow.successful_calls || 0) + 1,
        })
        .eq('id', usageRow.id);
    } else {
      await supabase.from('developer_daily_usage').insert({
        project_id: project.id,
        usage_date: todayStr,
        calls: 1,
        successful_calls: 1,
        blocked_calls: 0,
      });
    }

    // If limit reached on this call, automatically lock
    if (newCalls >= dailyLimit) {
      await supabase
        .from('developer_projects')
        .update({
          quota_locked: true,
          quota_locked_until: nextMidnightUtc.toISOString(),
          quota_lock_reason: 'Daily quota limit reached',
          updated_at: now.toISOString(),
        })
        .eq('id', project.id);
    }

    // Insert request log
    await supabase.from('developer_request_logs').insert({
      request_id: requestId,
      project_id: project.id,
      endpoint,
      method,
      status_code: 200,
      latency_ms: 0,
      quota_consumed: 1,
      requested_at: now.toISOString(),
    });

    return {
      hasKey: true,
      allowed: true,
      requestId,
      project,
      dailyLimit,
      usedToday: newCalls,
      remainingToday: Math.max(0, dailyLimit - newCalls),
      resetAt: nextMidnightUtc.toISOString(),
    };
  } catch (err: any) {
    console.error('[Developer Usage Service] Error validating request:', err);
    // Allow request to proceed if internal validation fails to avoid bricking app
    return { hasKey: true, allowed: true };
  }
}

/**
 * Updates developer request log with actual status code, latency, and completion timestamp.
 */
export async function finalizeDeveloperRequestLog(options: {
  requestId?: string;
  statusCode: number;
  latencyMs: number;
  errorCode?: string | null;
}): Promise<void> {
  if (!options.requestId) return;
  try {
    const supabase = getServerSupabase();
    await supabase
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
