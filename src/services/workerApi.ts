import {
  fetchExploreTokensFromBackend,
  saveTokensToBackend,
  LOCAL_TOKEN_GATEWAY_URL,
  VERCEL_TOKEN_GATEWAY_URL,
} from './vercelTokenBackend';

function getRequestHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

/** All token operations are routed through the token gateway. */
export async function executeWorkerGenericAction(payload: Record<string, any>): Promise<any> {
  const tryPost = async (url: string) => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
      const result = await response.json().catch(() => null);
      return result ?? { success: false, error: `HTTP ${response.status}` };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const endpoints = [
    LOCAL_TOKEN_GATEWAY_URL,
    '/api/token',
    '/api/get-token-by-address',
  ];

  if (VERCEL_TOKEN_GATEWAY_URL && !VERCEL_TOKEN_GATEWAY_URL.includes('happyiyate-hashs-projects.vercel.app')) {
    endpoints.push(VERCEL_TOKEN_GATEWAY_URL);
  }

  for (const url of endpoints) {
    try {
      const res = await tryPost(url);
      if (res && (res.success || res.tokens || res.token || res.found)) {
        return res;
      }
    } catch {}
  }

  return { success: false, error: 'Token backend service unavailable' };
}

export interface WorkerTokenPayload {
  name: string;
  symbol: string;
  contractAddress: string;
  logoUrl?: string;
  verified?: boolean;
  chainId?: number;
}

export interface WorkerTokenLookupResult { exists: boolean; token?: WorkerTokenPayload | null; raw?: any; error?: string; }

/** Legacy lookup kept for compatibility, but it now goes through Vercel rather than Cloudflare. */
export async function getTokenByAddressFromWorker(blockchain: string, contractAddress: string): Promise<WorkerTokenLookupResult> {
  if (!contractAddress?.trim()) return { exists: false };
  try {
    const result = await executeWorkerGenericAction({
      action: 'getTokenByAddress', blockchain: blockchain.trim().toLowerCase(), contractAddress: contractAddress.trim().toLowerCase(),
    });
    const token = result?.token || result?.data || null;
    return { exists: !!(result?.exists || token || result?.found), token, raw: result };
  } catch (error: any) {
    return { exists: false, error: error?.message || 'Token backend unavailable' };
  }
}

export async function getAllTokensFromWorker(_page: number = 1, _limit: number = 100): Promise<{ success: boolean; tokens?: any[]; raw?: any; error?: string }> {
  try {
    const rawTokens = await fetchExploreTokensFromBackend();
    return { success: true, tokens: rawTokens, raw: rawTokens };
  } catch (error: any) {
    return { success: false, tokens: [], error: error?.message || 'Token backend directory unavailable' };
  }
}

export async function uploadTokensToWorker(tokens: WorkerTokenPayload[], blockchain: string = 'polygon', userId?: string): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!tokens?.length) return { success: false, error: 'No tokens provided for upload.' };
  try {
    const payloadTokens = tokens.map((t) => ({
      name: t.name || 'Unknown Token', symbol: t.symbol || 'TOK', contractAddress: t.contractAddress || '',
      blockchain: blockchain.toLowerCase(), chainId: t.chainId, logoUrl: t.logoUrl || '',
    }));
    const res = await saveTokensToBackend(userId || '', payloadTokens);
    return { success: res.success, result: res, error: res.error || (res.success ? undefined : res.message) };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to connect to token backend.' };
  }
}
