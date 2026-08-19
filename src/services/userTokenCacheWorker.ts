/**
 * User Token Cache Cloudflare Worker Service
 *
 * Dedicated Worker: https://small-pine-71f9.happyiyate.workers.dev/
 *
 * Protocol:
 * - Save batch (merge): POST /tokens?merge=true { user_id, tokens: [{ blockchain, id }] }
 * - Save batch (replace): POST /tokens { user_id, tokens: [{ blockchain, id }] }
 * - Retrieve user tokens: GET /tokens?user_id=USER_ID
 */

export const USER_TOKEN_CACHE_WORKER_URL =
  'https://small-pine-71f9.happyiyate.workers.dev/tokens';

export interface WorkerUserTokenItem {
  blockchain: string;
  id: string;
  [key: string]: unknown;
}

export interface SaveUserTokensWorkerRequest {
  user_id: string;
  tokens: WorkerUserTokenItem[];
}

export interface SaveUserTokensWorkerResponse {
  success: boolean;
  user_id?: string;
  tokens?: WorkerUserTokenItem[];
  mode?: 'merge' | 'replace';
  error?: string;
}

export interface GetUserTokensWorkerResponse {
  user_id: string;
  tokens: WorkerUserTokenItem[];
}

/**
 * Saves or merges a user's tokens to the Cloudflare Worker KV cache.
 *
 * @param userId The unique user ID
 * @param tokens Array of tokens with { blockchain, id }
 * @param merge If true, adds to existing tokens (?merge=true). If false, replaces.
 */
export async function saveUserTokensToWorker(
  userId: string,
  tokens: WorkerUserTokenItem[],
  merge: boolean = true
): Promise<SaveUserTokensWorkerResponse> {
  if (!userId || !userId.trim()) {
    return { success: false, error: 'User ID is required.' };
  }

  if (!Array.isArray(tokens) || tokens.length === 0) {
    return { success: false, error: 'No tokens provided.' };
  }

  const endpoint = merge
    ? `${USER_TOKEN_CACHE_WORKER_URL}?merge=true`
    : USER_TOKEN_CACHE_WORKER_URL;

  const payload: SaveUserTokensWorkerRequest = {
    user_id: userId.trim(),
    tokens: tokens.map((t) => ({
      blockchain: String(t.blockchain || 'polygon').trim().toLowerCase(),
      id: String(t.id || (t as any).address || (t as any).contractAddress || '').trim(),
      ...(t.name ? { name: t.name } : {}),
      ...(t.symbol ? { symbol: t.symbol } : {}),
      ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
    })),
  };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    const json = await response.json();

    if (!response.ok || json.success === false) {
      throw new Error(json.error || `HTTP ${response.status}`);
    }

    return {
      success: true,
      user_id: json.user_id || userId,
      tokens: Array.isArray(json.tokens) ? json.tokens : payload.tokens,
      mode: json.mode || (merge ? 'merge' : 'replace'),
    };
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.warn('[UserTokenCacheWorker] Failed to save tokens to worker:', err?.message || err);
    return {
      success: false,
      error: err?.message || 'Failed to save tokens to worker.',
    };
  }
}

/**
 * Retrieves all saved tokens for a specific user from the Cloudflare Worker KV cache.
 *
 * @param userId The unique user ID
 */
export async function getUserTokensFromWorker(
  userId: string
): Promise<GetUserTokensWorkerResponse> {
  if (!userId || !userId.trim()) {
    return { user_id: '', tokens: [] };
  }

  const endpoint = `${USER_TOKEN_CACHE_WORKER_URL}?user_id=${encodeURIComponent(userId.trim())}`;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller?.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Worker HTTP ${response.status}`);
    }

    const json = await response.json();
    return {
      user_id: json.user_id || userId,
      tokens: Array.isArray(json.tokens) ? json.tokens : [],
    };
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.warn('[UserTokenCacheWorker] Failed to retrieve tokens for user:', userId, err?.message || err);
    return {
      user_id: userId,
      tokens: [],
    };
  }
}
