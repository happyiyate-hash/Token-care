/** Central Vercel Token Backend gateway. The app never calls the Cloudflare Worker directly. */

import { getChainInfo } from '../constants/chains';
import { resolveChainLogo } from './chainLogos';
import { notifyBackendError, extractBackendErrorMessage } from './toastManager';

export const VERCEL_TOKEN_GATEWAY_URL =
  'https://token-save-backend-p74bbibkg-happyiyate-hashs-projects.vercel.app/api/token';
export const LOCAL_TOKEN_GATEWAY_URL = '/api/token';

export const VERCEL_SAVE_TOKEN_URL = VERCEL_TOKEN_GATEWAY_URL;
export const LOCAL_PROXY_GATEWAY_URL = LOCAL_TOKEN_GATEWAY_URL;
export const LOCAL_PROXY_SAVE_URL = LOCAL_TOKEN_GATEWAY_URL;

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

async function postTokenApi(payload: any, timeoutMs = 12000): Promise<{ status: number; ok: boolean; json: any }> {
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
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  // Try local backend handler first
  try {
    const localResult = await tryPost(LOCAL_TOKEN_GATEWAY_URL);
    if (localResult.ok && localResult.json && localResult.json.success !== false) {
      return localResult;
    }
    if (localResult.status !== 404 && localResult.status !== 502) {
      return localResult;
    }
  } catch (err) {
    console.debug('[TokenBackend] Local endpoint note:', err);
  }

  // Fallback to direct Vercel Gateway URL
  return tryPost(VERCEL_TOKEN_GATEWAY_URL);
}

export async function fetchExploreTokensFromBackend(): Promise<any[]> {
  const { status, ok, json } = await postTokenApi({ action: 'getAllTokens' });
  if (!ok || json?.success === false) {
    notifyBackendError(status, json, 'Explore: getAllTokens');
    throw Object.assign(new Error(extractBackendErrorMessage(status, json)), { status, backendResponse: json });
  }
  const rawList = json?.tokens || json?.data || json?.result || (Array.isArray(json) ? json : []);
  return Array.isArray(rawList) ? rawList : [];
}

export async function fetchTokensByUserFromBackend(userId: string): Promise<any[]> {
  if (!userId?.trim()) return [];
  const { status, ok, json } = await postTokenApi({ action: 'getTokensByUser', userId: userId.trim() });
  if (!ok || json?.success === false) {
    notifyBackendError(status, json, 'Tokens: getTokensByUser');
    throw Object.assign(new Error(extractBackendErrorMessage(status, json)), { status, backendResponse: json });
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
    const { status, ok, json } = await postTokenApi({ action: 'saveToken', ...payload }, 15000);
    if (!ok || json?.success === false) {
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
    const message = err?.message || 'Failed to communicate with token save service.';
    notifyBackendError(0, { error: 'Network Connection Failure', message }, 'Donate: save-token');
    return { success: false, message, error: 'NETWORK_ERROR' };
  }
}
