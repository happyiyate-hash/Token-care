import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const upstreamUrl = process.env.DEVELOPER_UPSTREAM_URL;

if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function send(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

function getApiKey(req: VercelRequest) {
  const key = req.headers['x-api-key'];
  if (typeof key === 'string' && key.trim()) return key.trim();
  const auth = req.headers.authorization;
  return auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function getBody(req: VercelRequest): Record<string, unknown> {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  }
  return {};
}

// The backend never hardcodes Cloudflare operations. The JSON body is opaque
// to the gateway. Only its top-level `key` is extracted for logging.
function getRequestKey(body: Record<string, unknown>) {
  return typeof body.key === 'string' && body.key.trim() ? body.key.trim() : 'unknown';
}

async function writeLog(p: {
  projectId: string; requestId: string; requestKey: string; method: string;
  statusCode: number; startedAt: number; errorCode?: string | null;
  message: string; quotaConsumed: boolean;
}) {
  const { error } = await supabase.from('developer_request_logs').insert({
    project_id: p.projectId,
    endpoint: p.requestKey,
    request_key: p.requestKey,
    method: p.method,
    status_code: p.statusCode,
    requested_at: new Date(p.startedAt).toISOString(),
    latency_ms: Math.max(0, Date.now() - p.startedAt),
    error_code: p.errorCode ?? null,
    request_id: p.requestId,
    completed_at: new Date().toISOString(),
    quota_consumed: p.quotaConsumed,
    message: p.message,
  });
  if (error) console.error('Request log write failed:', error);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-api-key, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const method = req.method || 'POST';
  const body = getBody(req);
  const requestKey = getRequestKey(body);
  const apiKey = getApiKey(req);

  if (method !== 'POST') {
    return send(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' });
  }
  if (!apiKey) {
    return send(res, 401, { success: false, code: 'API_KEY_REQUIRED', message: 'API key required.', request_id: requestId });
  }
  if (!upstreamUrl) {
    return send(res, 500, { success: false, code: 'UPSTREAM_NOT_CONFIGURED', message: 'Developer upstream is not configured.', request_id: requestId });
  }
  if (requestKey === 'unknown') {
    return send(res, 400, { success: false, code: 'REQUEST_KEY_REQUIRED', message: 'The JSON body must contain a string `key`.', request_id: requestId });
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
      return send(res, 500, { success: false, code: 'PROJECT_LOOKUP_FAILED', message: 'Unable to verify API key.', request_id: requestId });
    }
    if (!project || !project.is_active) {
      return send(res, 401, { success: false, code: 'INVALID_API_KEY', message: 'Project does not exist for this API key or is inactive.', request_id: requestId });
    }
    projectId = project.id;

    const { data: quotaData, error: quotaError } = await supabase.rpc('consume_developer_call', {
      p_project_id: project.id,
      p_success: true,
      p_blocked: false,
    });

    if (quotaError) {
      console.error('Quota RPC failed:', quotaError);
      await writeLog({ projectId, requestId, requestKey, method, statusCode: 500, startedAt, errorCode: 'QUOTA_CHECK_FAILED', message: 'Unable to verify daily request quota.', quotaConsumed: false });
      return send(res, 500, { success: false, code: 'QUOTA_CHECK_FAILED', message: 'Unable to verify daily request quota.', request_id: requestId });
    }

    const quota = Array.isArray(quotaData) ? quotaData[0] : quotaData;
    if (!quota?.allowed) {
      const message = 'You have reached your daily request limit. Please try again tomorrow or upgrade your plan.';
      await writeLog({ projectId, requestId, requestKey, method, statusCode: 429, startedAt, errorCode: 'QUOTA_EXCEEDED', message, quotaConsumed: false });
      return send(res, 429, {
        success: false,
        key: requestKey,
        code: 'QUOTA_EXCEEDED',
        message,
        usage: { used: quota?.calls ?? 0, limit: quota?.daily_limit ?? project.daily_limit, remaining: 0 },
        request_id: requestId,
      });
    }

    // Pass the exact JSON body through unchanged. No operation names are
    // hardcoded here, so Cloudflare can add new keys without a backend update.
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(body),
    });

    const text = await upstreamResponse.text();
    let upstreamBody: unknown;
    try { upstreamBody = JSON.parse(text); } catch { upstreamBody = text; }

    const ok = upstreamResponse.ok;
    await writeLog({
      projectId,
      requestId,
      requestKey,
      method,
      statusCode: upstreamResponse.status,
      startedAt,
      errorCode: ok ? null : `UPSTREAM_${upstreamResponse.status}`,
      message: ok ? 'Request succeeded.' : 'Upstream request failed.',
      quotaConsumed: true,
    });

    // Return Cloudflare's response body directly. We do not wrap or rewrite
    // the application's JSON response, so the engine receives the same JSON.
    res.status(upstreamResponse.status);
    res.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || 'application/json');
    return res.send(typeof upstreamBody === 'string' ? upstreamBody : JSON.stringify(upstreamBody));
  } catch (error) {
    console.error('Developer API error:', error);
    if (projectId) {
      await writeLog({ projectId, requestId, requestKey, method, statusCode: 500, startedAt, errorCode: 'INTERNAL_ERROR', message: 'Internal server error.', quotaConsumed: true });
    }
    return send(res, 500, { success: false, key: requestKey, code: 'INTERNAL_ERROR', message: 'Internal server error.', request_id: requestId });
  }
}
