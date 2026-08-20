import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const upstreamUrl = process.env.DEVELOPER_UPSTREAM_URL;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function send(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body);
}

function getApiKey(req: VercelRequest): string {
  const header = req.headers['x-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();

  const authorization = req.headers.authorization;
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return '';
}

function getRequestKey(body: Record<string, unknown>, req: VercelRequest): string {
  const candidate = body.key ?? body.action ?? body.request ?? body.type ?? body.operation;
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  return req.url?.split('?')[0] || 'unknown';
}

function getBody(req: VercelRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'object' && !Array.isArray(req.body)) return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function writeLog(params: {
  projectId: string;
  requestId: string;
  requestKey: string;
  method: string;
  statusCode: number;
  startedAt: number;
  errorCode?: string | null;
  message: string;
  quotaConsumed: boolean;
}) {
  const latencyMs = Math.max(0, Date.now() - params.startedAt);
  const { error } = await supabase.from('developer_request_logs').insert({
    project_id: params.projectId,
    endpoint: params.requestKey,
    request_key: params.requestKey,
    method: params.method,
    status_code: params.statusCode,
    requested_at: new Date(params.startedAt).toISOString(),
    latency_ms: latencyMs,
    error_code: params.errorCode ?? null,
    request_id: params.requestId,
    completed_at: new Date().toISOString(),
    quota_consumed: params.quotaConsumed,
    message: params.message,
  });

  if (error) console.error('Request log write failed:', error);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-api-key, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const body = getBody(req);
  const requestKey = getRequestKey(body, req);
  const method = req.method || 'POST';

  const apiKey = getApiKey(req);
  if (!apiKey) {
    return send(res, 401, {
      success: false,
      code: 'API_KEY_REQUIRED',
      error: 'API key required',
      request_id: requestId,
    });
  }

  if (!upstreamUrl) {
    return send(res, 500, {
      success: false,
      code: 'UPSTREAM_NOT_CONFIGURED',
      error: 'Developer upstream is not configured',
      request_id: requestId,
    });
  }

  let projectId: string | null = null;

  try {
    // The service-role client intentionally bypasses RLS so this gateway can
    // resolve the API key and write project-owned usage/log records safely.
    const { data: project, error: projectError } = await supabase
      .from('developer_projects')
      .select('id, daily_limit, is_active, subscription_status')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (projectError) {
      console.error('Project lookup failed:', projectError);
      return send(res, 500, {
        success: false,
        code: 'PROJECT_LOOKUP_FAILED',
        error: 'Unable to verify API key',
        request_id: requestId,
      });
    }

    if (!project || !project.is_active) {
      return send(res, 401, {
        success: false,
        code: 'INVALID_API_KEY',
        error: 'Project does not exist for this API key or is inactive',
        request_id: requestId,
      });
    }

    projectId = project.id;

    // PostgreSQL owns the daily counter. It creates today's row when needed
    // and atomically increments the existing project/day row.
    const { data: quotaData, error: quotaError } = await supabase.rpc(
      'consume_developer_call',
      {
        p_project_id: project.id,
        p_success: true,
        p_blocked: false,
      },
    );

    if (quotaError) {
      console.error('Daily quota RPC failed:', quotaError);
      await writeLog({
        projectId,
        requestId,
        requestKey,
        method,
        statusCode: 500,
        startedAt,
        errorCode: 'QUOTA_CHECK_FAILED',
        message: 'Unable to verify daily request quota',
        quotaConsumed: false,
      });
      return send(res, 500, {
        success: false,
        code: 'QUOTA_CHECK_FAILED',
        error: 'Unable to verify daily request quota',
        request_id: requestId,
      });
    }

    const quota = Array.isArray(quotaData) ? quotaData[0] : quotaData;

    if (!quota?.allowed) {
      const message = 'You have reached your daily request limit. Please try again tomorrow or upgrade your plan.';
      await writeLog({
        projectId,
        requestId,
        requestKey,
        method,
        statusCode: 429,
        startedAt,
        errorCode: 'QUOTA_EXCEEDED',
        message,
        quotaConsumed: false,
      });
      return send(res, 429, {
        success: false,
        code: 'QUOTA_EXCEEDED',
        error: 'Daily quota exceeded',
        message,
        usage: {
          used: quota.calls ?? 0,
          limit: quota.daily_limit ?? project.daily_limit,
          remaining: 0,
        },
        request_id: requestId,
      });
    }

    // The exact Cloudflare request contract will be wired after the app's
    // final JSON shape is supplied. Until then, forward the body unchanged.
    const upstreamResponse = await fetch(upstreamUrl, {
      method: method === 'GET' ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    });

    const text = await upstreamResponse.text();
    let upstreamBody: unknown;
    try {
      upstreamBody = JSON.parse(text);
    } catch {
      upstreamBody = { raw: text };
    }

    const succeeded = upstreamResponse.ok;
    await writeLog({
      projectId,
      requestId,
      requestKey,
      method,
      statusCode: upstreamResponse.status,
      startedAt,
      errorCode: succeeded ? null : `UPSTREAM_${upstreamResponse.status}`,
      message: succeeded ? 'Request succeeded' : 'Upstream request failed',
      quotaConsumed: true,
    });

    return send(res, upstreamResponse.status, {
      success: succeeded,
      data: upstreamBody,
      usage: {
        used: quota.calls,
        limit: quota.daily_limit,
        remaining: quota.remaining_calls,
      },
      request_id: requestId,
    });
  } catch (error) {
    console.error('Developer API error:', error);

    if (projectId) {
      await writeLog({
        projectId,
        requestId,
        requestKey,
        method,
        statusCode: 500,
        startedAt,
        errorCode: 'INTERNAL_ERROR',
        message: 'Internal server error',
        quotaConsumed: false,
      });
    }

    return send(res, 500, {
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Internal server error',
      request_id: requestId,
    });
  }
}
