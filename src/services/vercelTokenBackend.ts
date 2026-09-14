/** Central Vercel Token Backend gateway. The app never calls the Cloudflare Worker directly. */

import { getChainInfo } from '../constants/chains';
import { resolveChainLogo } from './chainLogos';
import { notifyBackendError, extractBackendErrorMessage } from './toastManager';

export const VERCEL_TOKEN_GATEWAY_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VERCEL_TOKEN_BACKEND_URL) || '';
export const LOCAL_TOKEN_GATEWAY_URL = '/api/token';

export const VERCEL_SAVE_TOKEN_URL = VERCEL_TOKEN_GATEWAY_URL || LOCAL_TOKEN_GATEWAY_URL;
export const LOCAL_PROXY_GATEWAY_URL = LOCAL_TOKEN_GATEWAY_URL;
export const LOCAL_PROXY_SAVE_URL = '/api/save-token';

export interface BackendTokenItem {
  blockchain: string;
  blockchainSymbol: string;
  chainId: number;
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  logoUrl: string;
}

export interface BackendSavePayload { userId: string; tokens: BackendTokenItem[]; }

export interface SaveTokenBackendResponse {
  success: boolean;
  partial?: boolean;
  message?: string;
  error?: string;
  saved?: any[];
  rejected?: any[];
  reward?: { amount: number; symbol: string; credited?: boolean; [key: string]: unknown };
  notification?: any;
  offlineSaved?: boolean;
  [key: string]: unknown;
}

export function formatTokenForBackend(token: any, fallbackChainId?: string | number): BackendTokenItem {
  const chainIdInput = token.chainId ?? token.metadata?.chainId ?? fallbackChainId ?? '137';
  const chainMeta = getChainInfo(String(chainIdInput));
  const chainNetwork = resolveChainLogo(
    token.blockchain ?? token.metadata?.blockchainName ?? chainMeta.name,
    String(chainIdInput)
  );
  const blockchain = token.blockchain || token.metadata?.blockchainName || token.metadata?.chainName || chainMeta.name || chainNetwork.name || 'Polygon';
  const blockchainSymbol = token.blockchainSymbol || token.metadata?.chainSymbol || chainMeta.symbol || chainNetwork.symbol || 'MATIC';
  let numericChainId = Number(token.chainId ?? chainMeta.id ?? chainIdInput ?? chainNetwork.id ?? 137);
  if (!Number.isFinite(numericChainId) || numericChainId <= 0) numericChainId = 137;
  const contractAddress = String(token.contractAddress ?? token.address ?? token.id ?? token.metadata?.address ?? '').trim();
  const tokenName = token.tokenName || token.name || token.metadata?.name || 'Unknown Token';
  const tokenSymbol = String(token.tokenSymbol || token.symbol || token.metadata?.symbol || 'TOK').toUpperCase();
  const logoUrl = token.logoUrl || token.metadata?.logoUrl || '';
  return { blockchain, blockchainSymbol, chainId: numericChainId, contractAddress, tokenName, tokenSymbol, logoUrl };
}

async function postTokenApi(payload: any, timeoutMs = 8000): Promise<{ status: number; ok: boolean; json: any }> {
  const tryPost = async (url: string) => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
      const json = await res.json().catch(() => null);
      return { status: res.status, ok: res.ok, json };
    } catch {
      return null;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const candidateEndpoints: string[] = [
    LOCAL_TOKEN_GATEWAY_URL,
    '/api/save-token',
    '/api/token-backend-save',
    '/backend',
  ];

  if (
    VERCEL_TOKEN_GATEWAY_URL &&
    !VERCEL_TOKEN_GATEWAY_URL.includes('happyiyate-hashs-projects.vercel.app')
  ) {
    candidateEndpoints.push(VERCEL_TOKEN_GATEWAY_URL);
  }

  let lastFailureResult: { status: number; ok: boolean; json: any } | null = null;

  for (const endpoint of candidateEndpoints) {
    const result = await tryPost(endpoint);
    if (!result) continue;

    // Successful response
    if (result.ok && result.json && result.json.success !== false) {
      return result;
    }

    // Business validation response (e.g. 400 Bad Request with rejected tokens)
    if (result.status === 400 && result.json) {
      return result;
    }

    lastFailureResult = result;
  }

  return (
    lastFailureResult || {
      status: 0,
      ok: false,
      json: { success: false, error: 'OFFLINE_MODE', message: 'Token service offline or unreachable.' },
    }
  );
}

export async function fetchExploreTokensFromBackend(): Promise<any[]> {
  const { status, ok, json } = await postTokenApi({ action: 'getAllTokens' });
  if (!ok || json?.success === false) {
    if (status !== 0) {
      notifyBackendError(status, json, 'Explore: getAllTokens');
    }
    return [];
  }
  const rawList = json?.tokens || json?.data || json?.result || (Array.isArray(json) ? json : []);
  return Array.isArray(rawList) ? rawList : [];
}

export async function fetchTokensByUserFromBackend(userId: string): Promise<any[]> {
  if (!userId?.trim()) return [];
  const { status, ok, json } = await postTokenApi({ action: 'getTokensByUser', userId: userId.trim() });
  if (!ok || json?.success === false) {
    if (status !== 0) {
      notifyBackendError(status, json, 'Tokens: getTokensByUser');
    }
    return [];
  }
  const rawList = json?.tokens || json?.data || json?.result || (Array.isArray(json) ? json : []);
  return Array.isArray(rawList) ? rawList : [];
}

export async function saveTokensToBackend(userId: string, tokens: any[]): Promise<SaveTokenBackendResponse> {
  if (!tokens?.length) return { success: false, message: 'No tokens provided to save.' };
  const formattedTokens = tokens.map((t) => formatTokenForBackend(t));
  const payload: BackendSavePayload = { userId: (userId || '').trim(), tokens: formattedTokens };
  if (!payload.userId) return { success: false, error: 'User ID is required.', message: 'User ID is required.' };
  try {
    const { status, ok, json } = await postTokenApi({ action: 'saveToken', ...payload }, 10000);
    if (!ok || json?.success === false) {
      // If network unreachable / offline, fallback cleanly to local storage without throwing error toast
      if (status === 0) {
        return {
          success: true,
          partial: true,
          offlineSaved: true,
          message: 'Token registered to your local directory (offline mode).',
          saved: formattedTokens,
          rejected: [],
        };
      }
      const message = notifyBackendError(status, json, 'Donate: save-token');
      return { success: false, message, error: json?.error || `HTTP ${status}`, ...(json || {}) };
    }
    return {
      success: json?.success ?? true,
      partial: json?.partial,
      message: json?.message || 'Token saved successfully.',
      saved: json?.saved || [],
      rejected: json?.rejected || [],
      reward: json?.reward,
      notification: json?.notification,
      ...(json || {}),
    };
  } catch (err: any) {
    console.warn('[TokenBackend] Save note:', err?.message || err);
    return {
      success: true,
      partial: true,
      offlineSaved: true,
      message: 'Token saved to your local directory (offline mode).',
      saved: formattedTokens,
      rejected: [],
    };
  }
}
