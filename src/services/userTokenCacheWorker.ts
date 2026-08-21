/**
 * User Token Cache Cloudflare Worker Service
 *
 * Dedicated Worker: https://small-pine-71f9.happyiyate.workers.dev/
 *
 * A token's blockchain identity is data, not a whitelist. The worker therefore
 * accepts and preserves dynamically discovered chains even when TokenCare has
 * no local selector entry for them yet.
 */

export const USER_TOKEN_CACHE_WORKER_URL =
  'https://small-pine-71f9.happyiyate.workers.dev/tokens';

export interface WorkerUserTokenItem {
  blockchain: string;
  chainId?: string | number;
  blockchainName?: string;
  blockchainSymbol?: string;
  tokenStandard?: string;
  id: string;
  name?: string;
  symbol?: string;
  logoUrl?: string;
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

export async function saveUserTokensToWorker(
  userId: string,
  tokens: WorkerUserTokenItem[],
  merge: boolean = true
): Promise<SaveUserTokensWorkerResponse> {
  if (!userId || !userId.trim()) return { success: false, error: 'User ID is required.' };
  if (!Array.isArray(tokens) || tokens.length === 0) return { success: false, error: 'No tokens provided.' };

  const endpoint = merge ? `${USER_TOKEN_CACHE_WORKER_URL}?merge=true` : USER_TOKEN_CACHE_WORKER_URL;

  const payload: SaveUserTokensWorkerRequest = {
    user_id: userId.trim(),
    tokens: tokens.map((t) => {
      const blockchain = String(t.blockchain || t.blockchainName || '').trim().toLowerCase();
      const id = String(t.id || (t as any).address || (t as any).contractAddress || '').trim();
      return {
        blockchain,
        ...(t.chainId !== undefined && t.chainId !== null ? { chainId: t.chainId } : {}),
        ...(t.blockchainName ? { blockchainName: String(t.blockchainName).trim() } : {}),
        ...(t.blockchainSymbol ? { blockchainSymbol: String(t.blockchainSymbol).trim() } : {}),
        ...(t.tokenStandard ? { tokenStandard: String(t.tokenStandard).trim() } : {}),
        id,
        ...(t.name ? { name: t.name } : {}),
        ...(t.symbol ? { symbol: t.symbol } : {}),
        ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
      };
    }),
  };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);
    const json = await response.json();
    if (!response.ok || json.success === false) throw new Error(json.error || `HTTP ${response.status}`);
    return {
      success: true,
      user_id: json.user_id || userId,
      tokens: Array.isArray(json.tokens) ? json.tokens : payload.tokens,
      mode: json.mode || (merge ? 'merge' : 'replace'),
    };
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.warn('[UserTokenCacheWorker] Failed to save tokens to worker:', err?.message || err);
    return { success: false, error: err?.message || 'Failed to save tokens to worker.' };
  }
}

export async function getUserTokensFromWorker(userId: string): Promise<GetUserTokensWorkerResponse> {
  if (!userId || !userId.trim()) return { user_id: '', tokens: [] };
  const endpoint = `${USER_TOKEN_CACHE_WORKER_URL}?user_id=${encodeURIComponent(userId.trim())}`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Worker HTTP ${response.status}`);
    const json = await response.json();
    return { user_id: json.user_id || userId, tokens: Array.isArray(json.tokens) ? json.tokens : [] };
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.warn('[UserTokenCacheWorker] Failed to retrieve tokens for user:', userId, err?.message || err);
    return { user_id: userId, tokens: [] };
  }
}
