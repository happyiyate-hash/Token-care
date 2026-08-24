/**
 * Vercel Token Backend API Gateway
 *
 * Base URL: https://token-save-backend-p74bbibkg-happyiyate-hashs-projects.vercel.app
 * 1. General Gateway: POST /api (actions: getAllTokens, getTokensByUser)
 * 2. Save-Token Gateway: POST /api/save-token (userId, tokens array)
 */

export const VERCEL_TOKEN_GATEWAY_URL =
  'https://token-save-backend-p74bbibkg-happyiyate-hashs-projects.vercel.app/api';

export const VERCEL_SAVE_TOKEN_URL =
  'https://token-save-backend-p74bbibkg-happyiyate-hashs-projects.vercel.app/api/save-token';

export interface TokenItemPayload {
  name: string;
  symbol: string;
  contractAddress: string;
  blockchain: string;
  logoUrl?: string;
  [key: string]: unknown;
}

export interface SaveTokenBackendResponse {
  success: boolean;
  partial?: boolean;
  message?: string;
  error?: string;
  saved?: Array<{
    name?: string;
    symbol?: string;
    contractAddress?: string;
    blockchain?: string;
    [key: string]: unknown;
  }>;
  rejected?: Array<{
    contractAddress?: string;
    reason?: string;
    [key: string]: unknown;
  }>;
  reward?: {
    amount: number;
    symbol: string;
    credited?: boolean;
  };
  notification?: {
    id?: string;
    title?: string;
    message?: string;
    type?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * 1. EXPLORE: Retrieve global token list from Vercel backend
 * Payload: { "action": "getAllTokens" }
 */
export async function fetchExploreTokensFromBackend(): Promise<any[]> {
  const payload = {
    action: 'getAllTokens',
  };

  const attemptFetch = async (): Promise<any[]> => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

    try {
      const response = await fetch(VERCEL_TOKEN_GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Vercel Backend HTTP ${response.status}`);
      }

      const json = await response.json();
      const rawList =
        json?.tokens ||
        json?.data ||
        json?.result ||
        (Array.isArray(json) ? json : []);

      return Array.isArray(rawList) ? rawList : [];
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      throw err;
    }
  };

  try {
    return await attemptFetch();
  } catch (firstErr) {
    console.warn('[VercelBackend] getAllTokens attempt 1 failed, retrying once...', firstErr);
    await new Promise((res) => setTimeout(res, 800));
    return await attemptFetch();
  }
}

/**
 * 2. TOKENS: Retrieve tokens belonging to the currently authenticated user
 * Payload: { "action": "getTokensByUser", "userId": "USER_ID" }
 */
export async function fetchTokensByUserFromBackend(userId: string): Promise<any[]> {
  if (!userId || !userId.trim()) {
    return [];
  }

  const payload = {
    action: 'getTokensByUser',
    userId: userId.trim(),
  };

  const attemptFetch = async (): Promise<any[]> => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

    try {
      const response = await fetch(VERCEL_TOKEN_GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Vercel Backend HTTP ${response.status}`);
      }

      const json = await response.json();
      const rawList =
        json?.tokens ||
        json?.data ||
        json?.result ||
        (Array.isArray(json) ? json : []);

      return Array.isArray(rawList) ? rawList : [];
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      throw err;
    }
  };

  try {
    return await attemptFetch();
  } catch (firstErr) {
    console.warn('[VercelBackend] getTokensByUser attempt 1 failed, retrying once...', firstErr);
    await new Promise((res) => setTimeout(res, 800));
    try {
      return await attemptFetch();
    } catch (retryErr) {
      console.warn('[VercelBackend] getTokensByUser retry failed:', retryErr);
      return [];
    }
  }
}

/**
 * 3. DONATE: Save token(s) to dedicated save-token gateway
 * Payload: { "userId": "USER_ID", "tokens": [...] }
 */
export async function saveTokensToBackend(
  userId: string,
  tokens: TokenItemPayload[]
): Promise<SaveTokenBackendResponse> {
  if (!tokens || tokens.length === 0) {
    return {
      success: false,
      message: 'No tokens provided to save.',
    };
  }

  const payload = {
    userId: (userId || 'anonymous_user').trim(),
    tokens: tokens.map((t) => ({
      name: t.name || 'Unknown Token',
      symbol: (t.symbol || 'TOK').toUpperCase(),
      contractAddress: String(t.contractAddress || (t as any).address || (t as any).id || '').trim(),
      blockchain: String(t.blockchain || (t as any).chainId || 'polygon').trim().toLowerCase(),
      ...(t.logoUrl ? { logoUrl: String(t.logoUrl).trim() } : {}),
    })),
  };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 15000) : null;

  try {
    const response = await fetch(VERCEL_SAVE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        message: json?.message || json?.error || `Server responded with HTTP ${response.status}`,
        error: json?.error || `HTTP ${response.status}`,
        ...json,
      };
    }

    return {
      success: json?.success ?? true,
      partial: json?.partial,
      message: json?.message || 'Token saved successfully.',
      saved: json?.saved || (json?.token ? [json.token] : []),
      rejected: json?.rejected || [],
      reward: json?.reward,
      notification: json?.notification,
      ...json,
    } as SaveTokenBackendResponse;
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.error('[VercelBackend] saveTokensToBackend error:', err);
    return {
      success: false,
      message: err?.message || 'Unable to connect to token save service.',
      error: err?.message || 'NETWORK_ERROR',
    };
  }
}
