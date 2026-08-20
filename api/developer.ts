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

function getBody(req: VercelRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function getRequestKey(body: Record<string, unknown>): string {
  return typeof body.key === 'string' ? body.key.trim() : '';
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return send(res, 405, {
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'Only POST requests are supported',
    });
  }

  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const body = getBody(req);
  const requestKey = getRequestKey(body);
  const apiKey = getApiKey(req);

  if (!apiKey) {
    return send(res, 401, {
      success: false,
      code: 'API_KEY_REQUIRED',
      error: 'API key required',
      request_id: requestId,
    });
  }

  if (!requestKey) {
    return send(res, 400, {
      success: false,
      code: 'REQUEST_KEY_REQUIRED',
      error: 'The request body must contain a string "key" field',
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
        method: 'POST',
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
        method: 'POST',
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

    // The engine sends one stable operation key plus optional parameters.
    // The backend forwards the same JSON contract to the configured upstream.
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
      method: 'POST',
      statusCode: upstreamResponse.status,
      startedAt,
      errorCode: succeeded ? null : `UPSTREAM_${upstreamResponse.status}`,
      message: succeeded ? 'Request succeeded' : 'Upstream request failed',
      quotaConsumed: true,
    });

    return send(res, upstreamResponse.status, {
      success: succeeded,
      key: requestKey,
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
        method: 'POST',
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
