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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-api-key, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const apiKey = getApiKey(req);
  if (!apiKey) {
    return send(res, 401, {
      success: false,
      code: 'API_KEY_REQUIRED',
      error: 'API key required',
    });
  }

  if (!upstreamUrl) {
    return send(res, 500, {
      success: false,
      code: 'UPSTREAM_NOT_CONFIGURED',
      error: 'Developer upstream is not configured',
    });
  }

  try {
    // API-key -> exact developer project.
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
      });
    }

    if (!project || !project.is_active) {
      return send(res, 401, {
        success: false,
        code: 'INVALID_API_KEY',
        error: 'Project does not exist for this API key or is inactive',
      });
    }

    // PostgreSQL owns the daily counter. The RPC must create today's row when
    // necessary and atomically increment the existing row.
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
      return send(res, 500, {
        success: false,
        code: 'QUOTA_CHECK_FAILED',
        error: 'Unable to verify daily request quota',
      });
    }

    const quota = Array.isArray(quotaData) ? quotaData[0] : quotaData;

    if (!quota?.allowed) {
      return send(res, 429, {
        success: false,
        code: 'QUOTA_EXCEEDED',
        error: 'Daily quota exceeded',
        message: 'You have reached your daily request limit. Please try again tomorrow or upgrade your plan.',
        usage: {
          used: quota?.calls ?? 0,
          limit: quota?.daily_limit ?? project.daily_limit,
          remaining: 0,
        },
      });
    }

    // The exact request body/Cloudflare contract will be wired after the app's
    // request JSON is supplied. For now this forwards the received request
    // without inventing a payload contract.
    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method === 'GET' ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      ...(req.method === 'GET'
        ? {}
        : { body: JSON.stringify(req.body ?? {}) }),
    });

    const text = await upstreamResponse.text();
    let upstreamBody: unknown;
    try {
      upstreamBody = JSON.parse(text);
    } catch {
      upstreamBody = { raw: text };
    }

    return send(res, upstreamResponse.status, {
      success: upstreamResponse.ok,
      data: upstreamBody,
      usage: {
        used: quota.calls,
        limit: quota.daily_limit,
        remaining: quota.remaining_calls,
      },
    });
  } catch (error) {
    console.error('Developer API error:', error);
    return send(res, 500, {
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Internal server error',
    });
  }
}
