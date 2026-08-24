/**
 * Vercel Token Backend API Gateway
 *
 * Production Base URL: https://token-save-backend.vercel.app
 * 1. General Gateway: POST /api (actions: getAllTokens, getTokensByUser)
 * 2. Save-Token Gateway: POST /api/save-token (userId, tokens array)
 *
 * Strict Token Payload Structure:
 * {
 *   "userId": "USER_ID",
 *   "tokens": [
 *     {
 *       "blockchain": "Polygon",
 *       "blockchainSymbol": "MATIC",
 *       "chainId": 137,
 *       "contractAddress": "0x123456789...",
 *       "tokenName": "Tether USD",
 *       "tokenSymbol": "USDT",
 *       "logoUrl": "https://provider.com/usdt.png"
 *     }
 *   ]
 * }
 */

import { getChainInfo } from '../constants/chains';
import { resolveChainLogo } from './chainLogos';
import { notifyBackendError, extractBackendErrorMessage } from './toastManager';

export const VERCEL_TOKEN_GATEWAY_URL = 'https://token-save-backend.vercel.app/api';
export const VERCEL_SAVE_TOKEN_URL = 'https://token-save-backend.vercel.app/api/save-token';

export const LOCAL_PROXY_GATEWAY_URL = '/api/token-backend-gateway';
export const LOCAL_PROXY_SAVE_URL = '/api/token-backend-save';

export interface BackendTokenItem {
  blockchain: string;
  blockchainSymbol: string;
  chainId: number;
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  logoUrl: string;
}

export interface BackendSavePayload {
  userId: string;
  tokens: BackendTokenItem[];
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
    error?: string;
    message?: string;
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
 * Maps any input token object into the strictly required BackendTokenItem format.
 */
export function formatTokenForBackend(token: any, fallbackChainId?: string | number): BackendTokenItem {
  const chainIdInput = token.chainId ?? token.metadata?.chainId ?? fallbackChainId ?? '137';
  const rawAddr = token.contractAddress ?? token.address ?? token.id ?? token.metadata?.address ?? '';
  const contractAddress = String(rawAddr).trim();

  const chainMeta = getChainInfo(String(chainIdInput));
  const chainNetwork = resolveChainLogo(
    token.blockchain ?? token.metadata?.blockchainName ?? chainMeta.name,
    String(chainIdInput)
  );

  const blockchain =
    token.blockchain ||
    token.metadata?.blockchainName ||
    (token.metadata as any)?.chainName ||
    chainMeta.name ||
    chainNetwork.name ||
    'Polygon';

  const blockchainSymbol =
    token.blockchainSymbol ||
    (token.metadata as any)?.chainSymbol ||
    chainMeta.symbol ||
    chainNetwork.symbol ||
    'MATIC';

  let numericChainId = 137;
  if (typeof token.chainId === 'number' && !isNaN(token.chainId)) {
    numericChainId = token.chainId;
  } else if (chainMeta.id && !isNaN(Number(chainMeta.id))) {
    numericChainId = Number(chainMeta.id);
  } else if (typeof chainIdInput === 'number' && !isNaN(chainIdInput)) {
    numericChainId = chainIdInput;
  } else if (!isNaN(Number(chainIdInput)) && Number(chainIdInput) > 0) {
    numericChainId = Number(chainIdInput);
  } else if (chainNetwork.id && !isNaN(Number(chainNetwork.id))) {
    numericChainId = Number(chainNetwork.id);
  }

  const tokenName = token.tokenName || token.name || token.metadata?.name || 'Unknown Token';
  const tokenSymbol = (token.tokenSymbol || token.symbol || token.metadata?.symbol || 'TOK').toUpperCase();
  const logoUrl = token.logoUrl || token.metadata?.logoUrl || '';

  return {
    blockchain,
    blockchainSymbol,
    chainId: numericChainId,
    contractAddress,
    tokenName,
    tokenSymbol,
    logoUrl,
  };
}

/**
 * Safe fetcher that queries the internal server proxy first (avoiding CORS issues),
 * falling back to direct Vercel production API if needed.
 */
async function postTokenApi(
  urlOrProxy: string,
  fallbackUrl: string,
  payload: any,
  timeoutMs: number = 10000
): Promise<{ status: number; ok: boolean; json: any }> {
  const tryFetch = async (targetUrl: string) => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
      if (timeoutId) clearTimeout(timeoutId);
      const json = await res.json().catch(() => null);
      return { status: res.status, ok: res.ok, json };
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      throw e;
    }
  };

  // Try local proxy first
  try {
    const result = await tryFetch(urlOrProxy);
    // If proxy returned a valid response (not a 502/404 proxy failure)
    if (result.status !== 502 && result.status !== 404) {
      return result;
    }
  } catch (proxyErr) {
    // If proxy failed due to network or connection, try direct remote URL
    console.debug?.('[TokenBackend] Proxy call note, trying direct:', proxyErr);
  }

  // Direct remote fallback
  return tryFetch(fallbackUrl);
}

/**
 * 1. EXPLORE: Retrieve global token list from Vercel backend
 * POST /api with { "action": "getAllTokens" }
 */
export async function fetchExploreTokensFromBackend(): Promise<any[]> {
  const payload = {
    action: 'getAllTokens',
  };

  try {
    const { status, ok, json } = await postTokenApi(
      LOCAL_PROXY_GATEWAY_URL,
      VERCEL_TOKEN_GATEWAY_URL,
      payload,
      12000
    );

    if (!ok) {
      notifyBackendError(status, json, 'Explore: getAllTokens');
      const err = new Error(extractBackendErrorMessage(status, json));
      (err as any).status = status;
      (err as any).backendResponse = json;
      throw err;
    }

    if (json && json.success === false) {
      notifyBackendError(status, json, 'Explore: getAllTokens');
      const err = new Error(extractBackendErrorMessage(status, json));
      (err as any).status = status;
      (err as any).backendResponse = json;
      throw err;
    }

    const rawList =
      json?.tokens ||
      json?.data ||
      json?.result ||
      (Array.isArray(json) ? json : []);

    return Array.isArray(rawList) ? rawList : [];
  } catch (err: any) {
    if (!err?.backendResponse && err?.name !== 'AbortError') {
      console.error('[Explore: getAllTokens] Network or fetch failure:', err);
    }
    throw err;
  }
}

/**
 * 2. TOKENS: Retrieve tokens belonging to the currently authenticated user
 * POST /api with { "action": "getTokensByUser", "userId": "USER_ID" }
 */
export async function fetchTokensByUserFromBackend(userId: string): Promise<any[]> {
  if (!userId || !userId.trim()) {
    return [];
  }

  const payload = {
    action: 'getTokensByUser',
    userId: userId.trim(),
  };

  try {
    const { status, ok, json } = await postTokenApi(
      LOCAL_PROXY_GATEWAY_URL,
      VERCEL_TOKEN_GATEWAY_URL,
      payload,
      12000
    );

    if (!ok) {
      notifyBackendError(status, json, 'Tokens: getTokensByUser');
      const err = new Error(extractBackendErrorMessage(status, json));
      (err as any).status = status;
      (err as any).backendResponse = json;
      throw err;
    }

    if (json && json.success === false) {
      notifyBackendError(status, json, 'Tokens: getTokensByUser');
      const err = new Error(extractBackendErrorMessage(status, json));
      (err as any).status = status;
      (err as any).backendResponse = json;
      throw err;
    }

    const rawList =
      json?.tokens ||
      json?.data ||
      json?.result ||
      (Array.isArray(json) ? json : []);

    return Array.isArray(rawList) ? rawList : [];
  } catch (err: any) {
    if (!err?.backendResponse && err?.name !== 'AbortError') {
      console.error('[Tokens: getTokensByUser] Network or fetch failure:', err);
    }
    throw err;
  }
}

/**
 * 3. DONATE: Save token(s) to dedicated save-token gateway
 * POST /api/save-token with { "userId": "USER_ID", "tokens": [ { ... } ] }
 */
export async function saveTokensToBackend(
  userId: string,
  tokens: any[]
): Promise<SaveTokenBackendResponse> {
  if (!tokens || tokens.length === 0) {
    return {
      success: false,
      message: 'No tokens provided to save.',
    };
  }

  // Strictly format every token in the array
  const formattedTokens: BackendTokenItem[] = tokens.map((t) => formatTokenForBackend(t));

  const payload: BackendSavePayload = {
    userId: (userId || 'anonymous_user').trim(),
    tokens: formattedTokens,
  };

  try {
    const { status, ok, json } = await postTokenApi(
      LOCAL_PROXY_SAVE_URL,
      VERCEL_SAVE_TOKEN_URL,
      payload,
      15000
    );

    // Check for HTTP errors (400, 401, 403, 404, 409, 500, etc.)
    if (!ok) {
      const errorMsg = notifyBackendError(status, json, 'Donate: save-token');
      return {
        success: false,
        message: errorMsg,
        error: json?.error || `HTTP ${status}`,
        ...(json || {}),
      };
    }

    // Check for logical failure returned with 200 OK
    if (json && json.success === false) {
      const errorMsg = notifyBackendError(status, json, 'Donate: save-token');
      return {
        success: false,
        message: errorMsg,
        error: json?.error,
        ...(json || {}),
      };
    }

    // Check if token was rejected (e.g. duplicate rejected)
    const isDuplicateRejected =
      Array.isArray(json?.rejected) &&
      json.rejected.length > 0 &&
      (!json?.saved || json.saved.length === 0);

    if (isDuplicateRejected) {
      const errorMsg = notifyBackendError(status, json, 'Donate: save-token duplicate');
      return {
        success: false,
        message: errorMsg,
        ...(json || {}),
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
      ...(json || {}),
    } as SaveTokenBackendResponse;
  } catch (err: any) {
    console.error('[Donate: save-token] Network or fetch exception:', err);
    const msg = err?.message || 'Failed to communicate with token save service.';
    notifyBackendError(0, { error: 'Network Connection Failure', message: msg }, 'Donate: save-token');
    return {
      success: false,
      message: msg,
      error: err?.message || 'NETWORK_ERROR',
    };
  }
}
