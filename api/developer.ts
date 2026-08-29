import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let supabaseClient: SupabaseClient | null = null;

type RequestOutcome = 'success' | 'failed' | 'blocked';

function getSupabase(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return supabaseClient;
}

function send(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

function getApiKey(req: VercelRequest) {
  const key = req.headers['x-api-key'];
  if (typeof key === 'string' && key.trim()) return key.trim();

  const auth = req.headers.authorization;
  return auth?.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : '';
}

function getBody(req: VercelRequest): Record<string, unknown> {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }

  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

function getRequestKey(body: Record<string, unknown>) {
  return typeof body.key === 'string' && body.key.trim()
    ? body.key.trim()
    : 'unknown';
}

function getCreditCost(response: Response, body: unknown): number | null {
  const header =
    response.headers.get('x-tokencare-credit-cost') ||
    response.headers.get('x-credit-cost');

  if (header && /^\d+$/.test(header.trim())) {
    const value = Number(header.trim());
    if (Number.isSafeInteger(value) && value > 0) return value;
  }

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const value = (body as Record<string, unknown>).credit_cost;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function getUpstreamTimeoutMs() {
  const configured = Number(process.env.DEVELOPER_UPSTREAM_TIMEOUT_MS || 30000);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(Math.floor(configured), 120000)
    : 30000;
}

function classifyOutcome(statusCode: number, errorCode?: string | null): RequestOutcome {
  const code = errorCode || '';

  if (
    statusCode === 402 ||
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode === 504 ||
    code === 'INSUFFICIENT_CREDITS' ||
    code === 'PROJECT_PAUSED' ||
    code === 'BLOCKED' ||
    code === 'QUOTA_EXHAUSTED' ||
    code === 'UPSTREAM_TIMEOUT'
  ) {
    return 'blocked';
  }

  if (statusCode >= 200 && statusCode < 400) return 'success';
  return 'failed';
}

async function recordDailyOutcome(
  projectId: string,
  outcome: RequestOutcome,
  countCall: boolean,
) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');

  const { error } = await supabase.rpc('record_developer_daily_outcome', {
    p_project_id: projectId,
    p_outcome: outcome,
    p_count_call: countCall,
  });

  if (error) {
    throw new Error(`Daily usage outcome update failed: ${error.message}`);
  }
}

async function writeLog(p: {
  projectId: string;
  requestId: string;
  requestKey: string;
  method: string;
  statusCode: number;
  startedAt: number;
  errorCode?: string | null;
  message: string;
  creditsCharged: number;
  countCall: boolean;
}) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');

  const outcome = classifyOutcome(p.statusCode, p.errorCode);

  // Usage accounting is awaited. Serverless functions must not fire-and-forget
  // this update, otherwise successful/failed/blocked counters can be lost.
  await recordDailyOutcome(p.projectId, outcome, p.countCall);

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
    quota_consumed: p.creditsCharged > 0,
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

  const supabase = getSupabase();
  const upstreamUrl = process.env.DEVELOPER_UPSTREAM_URL;

  if (method !== 'POST') {
    return send(res, 405, {
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Use POST.',
    });
  }

  if (!apiKey) {
    return send(res, 401, {
      success: false,
      code: 'API_KEY_REQUIRED',
      message: 'API key required.',
      request_id: requestId,
    });
  }

  if (!supabase) {
    return send(res, 500, {
      success: false,
      code: 'SUPABASE_NOT_CONFIGURED',
      message: 'Database connection is not configured.',
      request_id: requestId,
    });
  }

  if (!upstreamUrl) {
    return send(res, 500, {
      success: false,
      code: 'UPSTREAM_NOT_CONFIGURED',
      message: 'Developer upstream is not configured.',
      request_id: requestId,
    });
  }

  if (requestKey === 'unknown') {
    return send(res, 400, {
      success: false,
      code: 'REQUEST_KEY_REQUIRED',
      message: 'The JSON body must contain a string `key`.',
      request_id: requestId,
    });
  }

  let projectId: string | null = null;
  let callAlreadyCounted = false;
  let outcomeRecorded = false;

  const recordAndLog = async (p: Omit<Parameters<typeof writeLog>[0], 'countCall'> & { countCall?: boolean }) => {
    const countCall = p.countCall ?? !callAlreadyCounted;
    await writeLog({ ...p, countCall });
    outcomeRecorded = true;
  };

  try {
    const { data: project, error: projectError } = await supabase
      .from('developer_projects')
      .select('id, is_active')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (projectError) {
      console.error('Project lookup failed:', projectError);
      return send(res, 500, {
        success: false,
        code: 'PROJECT_LOOKUP_FAILED',
        message: 'Unable to verify API key.',
        request_id: requestId,
      });
    }

    if (!project || !project.is_active) {
      return send(res, 401, {
        success: false,
        code: 'INVALID_API_KEY',
        message: 'Project does not exist for this API key or is inactive.',
        request_id: requestId,
      });
    }

    projectId = project.id;

    const controller = new AbortController();
    const timeoutMs = getUpstreamTimeoutMs();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'X-TokenCare-Project-Id': project.id,
          'X-TokenCare-Request-Id': requestId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);

      if (timedOut || (error as { name?: string })?.name === 'AbortError') {
        await recordAndLog({
          projectId,
          requestId,
          requestKey,
          method,
          statusCode: 504,
          startedAt,
          errorCode: 'UPSTREAM_TIMEOUT',
          message: 'Upstream request timed out.',
          creditsCharged: 0,
          countCall: true,
        });

        return send(res, 504, {
          success: false,
          code: 'UPSTREAM_TIMEOUT',
          message: 'The developer request timed out and was blocked.',
          request_id: requestId,
        });
      }

      throw error;
    }

    clearTimeout(timeout);

    const text = await upstreamResponse.text();
    let upstreamBody: unknown;
    try {
      upstreamBody = JSON.parse(text);
    } catch {
      upstreamBody = text;
    }

    if (!upstreamResponse.ok) {
      await recordAndLog({
        projectId,
        requestId,
        requestKey,
        method,
        statusCode: upstreamResponse.status,
        startedAt,
        errorCode: `UPSTREAM_${upstreamResponse.status}`,
        message: 'Upstream request failed.',
        creditsCharged: 0,
        countCall: true,
      });

      res.status(upstreamResponse.status);
      res.setHeader(
        'Content-Type',
        upstreamResponse.headers.get('content-type') || 'application/json',
      );
      return res.send(
        typeof upstreamBody === 'string'
          ? upstreamBody
          : JSON.stringify(upstreamBody),
      );
    }

    const creditCost = getCreditCost(upstreamResponse, upstreamBody);
    if (creditCost === null) {
      await recordAndLog({
        projectId,
        requestId,
        requestKey,
        method,
        statusCode: 502,
        startedAt,
        errorCode: 'CREDIT_COST_MISSING',
        message: 'Upstream did not provide the credit cost for this operation.',
        creditsCharged: 0,
        countCall: true,
      });

      return send(res, 502, {
        success: false,
        code: 'CREDIT_COST_MISSING',
        message: 'The TokenCare backend did not provide a valid credit cost for this operation.',
        request_id: requestId,
      });
    }

    const { data: chargeData, error: chargeError } = await supabase.rpc(
      'reserve_developer_credits',
      {
        p_project_id: project.id,
        p_credits: creditCost,
        p_endpoint: requestKey,
        p_action_key: requestKey,
        p_request_id: requestId,
      },
    );

    if (chargeError) {
      console.error('Credit charge failed:', chargeError);

      await recordAndLog({
        projectId,
        requestId,
        requestKey,
        method,
        statusCode: 500,
        startedAt,
        errorCode: 'CREDIT_CHARGE_FAILED',
        message: 'Unable to charge project credits.',
        creditsCharged: 0,
        countCall: true,
      });

      return send(res, 500, {
        success: false,
        code: 'CREDIT_CHARGE_FAILED',
        message: 'Unable to charge project credits.',
        request_id: requestId,
      });
    }

    const charge = Array.isArray(chargeData) ? chargeData[0] : chargeData;

    if (!charge?.allowed) {
      const chargeStatus = Number(charge?.status) || 402;
      const chargeErrorCode =
        chargeStatus === 429
          ? 'QUOTA_EXHAUSTED'
          : chargeStatus === 402
            ? 'INSUFFICIENT_CREDITS'
            : 'CREDIT_RESERVATION_DENIED';

      // 402 and 429 are already counted by reserve_developer_credits.
      // Other reservation failures are ordinary failed calls and are counted here.
      const alreadyCountedByReservation = chargeStatus === 402 || chargeStatus === 429;
      callAlreadyCounted = alreadyCountedByReservation;

      await recordAndLog({
        projectId,
        requestId,
        requestKey,
        method,
        statusCode: chargeStatus,
        startedAt,
        errorCode: chargeErrorCode,
        message: String(charge?.error || 'Credit reservation was denied.'),
        creditsCharged: 0,
        countCall: !alreadyCountedByReservation,
      });

      return send(res, chargeStatus, {
        success: false,
        code: chargeErrorCode,
        message: String(charge?.error || 'Unable to process this request.'),
        required_credits: creditCost,
        balance: charge?.balance ?? 0,
        request_id: requestId,
      });
    }

    // reserve_developer_credits has counted this request exactly once.
    callAlreadyCounted = true;

    await recordAndLog({
      projectId,
      requestId,
      requestKey,
      method,
      statusCode: upstreamResponse.status,
      startedAt,
      errorCode: null,
      message: 'Request succeeded.',
      creditsCharged: creditCost,
      countCall: false,
    });

    res.status(upstreamResponse.status);
    res.setHeader(
      'Content-Type',
      upstreamResponse.headers.get('content-type') || 'application/json',
    );
    res.setHeader('X-TokenCare-Credits-Charged', String(creditCost));
    res.setHeader('X-TokenCare-Credits-Remaining', String(charge.balance ?? 0));

    return res.send(
      typeof upstreamBody === 'string'
        ? upstreamBody
        : JSON.stringify(upstreamBody),
    );
  } catch (error) {
    console.error('Developer API error:', error);

    if (projectId && !outcomeRecorded) {
      try {
        await recordAndLog({
          projectId,
          requestId,
          requestKey,
          method,
          statusCode: 500,
          startedAt,
          errorCode: 'INTERNAL_ERROR',
          message: 'Internal server error.',
          creditsCharged: 0,
          countCall: !callAlreadyCounted,
        });
      } catch (usageError) {
        console.error('Failed to record developer request outcome:', usageError);
      }
    }

    return send(res, 500, {
      success: false,
      key: requestKey,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
      request_id: requestId,
    });
  }
}
