import { getActiveDeveloperApiKey } from './developerCache';
import {
  fetchExploreTokensFromBackend,
  saveTokensToBackend,
  VERCEL_TOKEN_GATEWAY_URL,
} from './vercelTokenBackend';

function getRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const activeKey = getActiveDeveloperApiKey();
  if (activeKey) {
    headers['x-api-key'] = activeKey;
  }
  return headers;
}

/**
 * Universal execution proxy helper for Token Backend actions.
 */
export async function executeWorkerGenericAction(
  payload: Record<string, any>
): Promise<any> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;

  try {
    const response = await fetch(VERCEL_TOKEN_GATEWAY_URL, {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);

    let result: any = null;
    try {
      result = await response.json();
    } catch {
      result = await response.text();
    }

    return result;
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.warn('[Backend API Direct] Execution fallback note:', error?.message || error);
    return {
      success: false,
      error: error?.message || 'Token backend service unavailable',
    };
  }
}

export interface WorkerTokenPayload {
  name: string;
  symbol: string;
  contractAddress: string;
  logoUrl?: string;
  verified?: boolean;
}

export interface WorkerTokenLookupResult {
  exists: boolean;
  token?: WorkerTokenPayload | null;
  raw?: any;
  error?: string;
}

/**
 * Queries Cloudflare Worker to check if a token contract address exists globally
 * Payload action: "getTokenByAddress"
 */
export async function getTokenByAddressFromWorker(
  blockchain: string,
  contractAddress: string
): Promise<WorkerTokenLookupResult> {
  if (!contractAddress || !contractAddress.trim()) {
    return { exists: false };
  }

  const normalizedAddress = contractAddress.trim().toLowerCase();
  const normalizedChain = (blockchain || 'polygon').trim().toLowerCase();

  const payload = {
    action: 'getTokenByAddress',
    blockchain: normalizedChain,
    contractAddress: normalizedAddress,
  };

  // 1. Try server-side proxy route first
  try {
    const proxyResponse = await fetch('/api/get-token-by-address', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify(payload),
    });

    if (proxyResponse.ok) {
      const data = await proxyResponse.json();
      const res = data.result || data;
      const exists = !!(
        res?.exists === true ||
        res?.token ||
        (res?.success === true && res?.data) ||
        res?.found === true
      );
      return {
        exists,
        token: res?.token || res?.data || null,
        raw: res,
      };
    }
  } catch (proxyError) {
    console.warn('[Worker API Lookup Proxy] Note:', proxyError);
  }

  // 2. Direct client-side fetch fallback with timeout
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;

  try {
    const response = await fetch('https://rough-meadow-6435.happyiyate.workers.dev/', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);

    let result: any = null;
    try {
      result = await response.json();
    } catch {
      result = await response.text();
    }

    const exists = !!(
      result?.exists === true ||
      result?.token ||
      (result?.success === true && result?.data) ||
      result?.found === true
    );

    return {
      exists,
      token: result?.token || result?.data || null,
      raw: result,
    };
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.warn('[Worker API Lookup Direct] Lookup fallback note:', error?.message || error);
    return {
      exists: false,
      error: error?.message || 'Worker connection unavailable',
    };
  }
}

/**
 * Fetches global token directory from Vercel backend gateway
 * Payload action: "getAllTokens"
 */
export async function getAllTokensFromWorker(
  _page: number = 1,
  _limit: number = 100
): Promise<{ success: boolean; tokens?: any[]; raw?: any; error?: string }> {
  try {
    const rawTokens = await fetchExploreTokensFromBackend();
    return {
      success: true,
      tokens: rawTokens,
      raw: rawTokens,
    };
  } catch (error: any) {
    console.warn('[Backend API Directory] Fetch note:', error?.message || error);
    return {
      success: false,
      tokens: [],
      error: error?.message || 'Token backend directory unavailable',
    };
  }
}

/**
 * Uploads token metadata array to save-token endpoint
 */
export async function uploadTokensToWorker(
  tokens: WorkerTokenPayload[],
  blockchain: string = 'polygon',
  userId?: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!tokens || tokens.length === 0) {
    return { success: false, error: 'No tokens provided for upload.' };
  }

  try {
    const payloadTokens = tokens.map((t) => ({
      name: t.name || 'Unknown Token',
      symbol: t.symbol || 'TOK',
      contractAddress: t.contractAddress || '0x0000000000000000000000000000000000000000',
      blockchain: blockchain.toLowerCase(),
      logoUrl: t.logoUrl || '',
    }));

    const res = await saveTokensToBackend(userId || 'anonymous_user', payloadTokens);
    return {
      success: res.success,
      result: res,
      error: res.error || (res.success ? undefined : res.message),
    };
  } catch (error: any) {
    console.warn('[Backend API Save] Upload note:', error?.message || error);
    return {
      success: false,
      error: error?.message || 'Failed to connect to token save endpoint.',
    };
  }
}
