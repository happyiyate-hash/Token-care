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

import {
  getAllTokensLocal,
  getTokensByUserLocal,
  batchSaveTokensLocal,
} from './localTokenStore';

export async function fetchExploreTokensFromBackend(): Promise<any[]> {
  try {
    const list = getAllTokensLocal();
    if (list && list.length > 0) return list;
  } catch {}
  return [];
}

export async function fetchTokensByUserFromBackend(userId: string): Promise<any[]> {
  if (!userId?.trim()) return [];
  try {
    const list = getTokensByUserLocal(userId.trim());
    if (list && list.length > 0) return list;
  } catch {}
  return [];
}

export async function saveTokensToBackend(userId: string, tokens: any[]): Promise<SaveTokenBackendResponse> {
  if (!tokens?.length) return { success: false, message: 'No tokens provided to save.' };
  const formattedTokens = tokens.map((t) => formatTokenForBackend(t));
  
  // Save directly on device in localTokenStore
  const localRes = batchSaveTokensLocal(
    userId,
    formattedTokens.map((t) => ({
      name: t.tokenName,
      symbol: t.tokenSymbol,
      contractAddress: t.contractAddress,
      blockchain: t.blockchain,
      chainId: t.chainId,
      logoUrl: t.logoUrl,
    }))
  );

  return {
    success: true,
    message: localRes.message || 'Token saved directly on device.',
    saved: localRes.saved,
    rejected: localRes.rejected,
    reward: { amount: 15, symbol: 'TC', credited: true },
  };
}
